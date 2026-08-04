import { expect } from "chai";
import { ethers } from "hardhat";
import { encryptUint64Array, debugDecryptUint64 } from "./utils/fhevm-helpers";

import {
  HEPRS_FIXTURE_SIZES,
  chunkBigIntVector,
  dotProductBigInt,
  getHeprsBalancedRecommendation,
  loadHeprsFixture,
  quantizeHeprsWeightsWithRecommendation,
  toBigIntVector
} from "./utils/heprs";
import {
  fixtureModelProvenance,
  heprsManifestPath,
  heprsWeightsPath,
  heprsGenotypePath,
} from "../scripts/utils/provenance";

const ONCHAIN_HEPRS_FIXTURE_SIZES = [100, 500, 1000] as const;

function chunkedDotProductBigInt(
  lhs: bigint[],
  rhs: bigint[],
  chunkLength: number
): bigint {
  let sum = 0n;
  for (let start = 0; start < lhs.length; start += chunkLength) {
    sum += dotProductBigInt(
      lhs.slice(start, start + chunkLength),
      rhs.slice(start, start + chunkLength)
    );
  }
  return sum;
}

describe("HEPRS fixture integration — fhEVM mock coprocessor (Hardhat)", function () {
  this.timeout(120000);
  const uploadChunkSize = 32;
  const computeChunkSize = 20;

  for (const fixtureSize of ONCHAIN_HEPRS_FIXTURE_SIZES) {
    it(`matches a plaintext dot product on the HEPRS ${fixtureSize}-SNP fixture using the balanced advisor recommendation`, async function () {
      const [signer] = await ethers.getSigners();
      const { genotypes, betas } = loadHeprsFixture(fixtureSize);
      const sampleIndex = 0;
      const snps = toBigIntVector(genotypes[sampleIndex]);
      const recommendation = getHeprsBalancedRecommendation(fixtureSize);
      const quantized = quantizeHeprsWeightsWithRecommendation(
        fixtureSize,
        betas
      );
      // Decoupled chunk sizes:
      //   uploadChunkSize=32 — 2048-bit input-proof budget (max 32 euint64s per call)
      //   computeChunkSize=20 — HCU-safe on mock; Sepolia ceiling TBD (run probe:hcu)

      // V1 corrected encoded score: (weighted_sum + scoreOffset) - weightZeroPoint * genoSum
      const genoSum = snps.reduce((a, b) => a + b, 0n);
      const naiveDotProduct = dotProductBigInt(snps, quantized.weights);
      const expected = naiveDotProduct + quantized.scoreOffset - quantized.weightZeroPoint * genoSum;
      const expectedFirstChunk = dotProductBigInt(
        snps.slice(0, computeChunkSize),
        quantized.weights.slice(0, computeChunkSize)
      );

      expect(snps.length).to.equal(quantized.weights.length);
      expect(snps.length).to.equal(fixtureSize + 1);
      expect(quantized.scale).to.equal(recommendation.scale);

      // R2.4-E1: commit to the exact fixture bytes and to the model manifest the
      // independent Python reference consumes.
      const prov = fixtureModelProvenance({
        manifestPath: heprsManifestPath(fixtureSize),
        weightsPath: heprsWeightsPath(fixtureSize),
        genotypePath: heprsGenotypePath(fixtureSize),
        extra: { nominalSnpCount: fixtureSize, scale: quantized.scale },
      });

      const Marketplace = await ethers.getContractFactory("ModelMarketplace");
      const marketplace = await Marketplace.deploy();
      const modelId = await marketplace.createModelShell.staticCall(
        false,
        BigInt(quantized.weights.length),
        BigInt(uploadChunkSize),
        BigInt(computeChunkSize),
        `ipfs://heprs-${fixtureSize}`,
        prov.manifestHash,
        prov.sourceModelHash,
        quantized.weightZeroPoint,
        quantized.scoreOffset
      );
      await marketplace.createModelShell(
        false,
        BigInt(quantized.weights.length),
        BigInt(uploadChunkSize),
        BigInt(computeChunkSize),
        `ipfs://heprs-${fixtureSize}`,
        prov.manifestHash,
        prov.sourceModelHash,
        quantized.weightZeroPoint,
        quantized.scoreOffset
      );
      // Publish weights in uploadChunkSize batches (no proof limit for public weights)
      for (const chunk of chunkBigIntVector(quantized.weights, uploadChunkSize)) {
        await marketplace.appendPublicModelChunk(modelId, chunk);
      }
      await marketplace.finalizeModel(modelId);

      const Registry = await ethers.getContractFactory("GenomicRegistry");
      const registry = await Registry.deploy();
      const sampleId = await registry.registerSampleWithManifest.staticCall(
        `ipfs://heprs-${fixtureSize}-sample`,
        prov.genotypeManifestHash
      );
      await registry.registerSampleWithManifest(
        `ipfs://heprs-${fixtureSize}-sample`,
        prov.genotypeManifestHash
      );
      const Engine = await ethers.getContractFactory("PRSComputeEngine");
      const engine = await Engine.deploy(await marketplace.getAddress(), await registry.getAddress());
      const engineAddr = await engine.getAddress();

      const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
      await engine.createPRSJob(modelId, sampleId);
      // Upload SNPs in uploadChunkSize batches (limited by fhEVM input-proof budget)
      for (const chunk of chunkBigIntVector(snps, uploadChunkSize)) {
        const enc = await encryptUint64Array(engineAddr, signer.address, chunk);
        await engine.appendSnpChunk(jobId, enc.handles, enc.inputProof);
      }
      await engine.finalizeSnpUpload(jobId);

      await engine.computeChunk(jobId);
      const partialHandle = await engine.getPartialSum(jobId);
      expect(await debugDecryptUint64(partialHandle)).to.equal(expectedFirstChunk);

      const totalComputeChunks = Math.ceil(snps.length / computeChunkSize);
      for (let i = 1; i < totalComputeChunks; i++) {
        await engine.computeChunk(jobId);
      }

      const tx = await engine.finalize(jobId);
      const receipt = await tx.wait();
      const finalEvent = receipt!.logs.find(
        (log: any) => engine.interface.parseLog(log)?.name === "JobFinalized"
      );
      const scoreHandle = engine.interface.parseLog(finalEvent as any)!.args.encodedScore;
      expect(await debugDecryptUint64(scoreHandle)).to.equal(expected);
    });
  }

  it("matches a plaintext dot product on the HEPRS 5000-SNP fixture using chunked SNP ingestion and the balanced advisor recommendation", async function () {
    const [signer] = await ethers.getSigners();
    const { genotypes, betas } = loadHeprsFixture(5000);
    const snps = toBigIntVector(genotypes[0]);
    const recommendation = getHeprsBalancedRecommendation(5000);
    const quantized = quantizeHeprsWeightsWithRecommendation(5000, betas);
    // Decoupled chunk sizes

    expect(snps.length).to.equal(quantized.weights.length);
    expect(snps.length).to.equal(5001);
    expect(quantized.scale).to.equal(recommendation.scale);

    // V1 corrected encoded score: (weighted_sum + scoreOffset) - weightZeroPoint * genoSum
    const genoSum = snps.reduce((a, b) => a + b, 0n);
    const naiveDotProduct = dotProductBigInt(snps, quantized.weights);
    const expected = naiveDotProduct + quantized.scoreOffset - quantized.weightZeroPoint * genoSum;
    const chunked = chunkedDotProductBigInt(snps, quantized.weights, computeChunkSize);
    expect(chunked).to.equal(naiveDotProduct);
    const expectedFirstChunk = dotProductBigInt(
      snps.slice(0, computeChunkSize),
      quantized.weights.slice(0, computeChunkSize)
    );

    // R2.4-E1: real provenance for the 5,000-SNP overflow-boundary run.
    const prov = fixtureModelProvenance({
      manifestPath: heprsManifestPath(5000),
      weightsPath: heprsWeightsPath(5000),
      genotypePath: heprsGenotypePath(5000),
      extra: { nominalSnpCount: 5000, scale: quantized.scale, purpose: "overflow_boundary" },
    });

    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Marketplace.deploy();
    const modelId = await marketplace.createModelShell.staticCall(
      false,
      BigInt(quantized.weights.length),
      BigInt(uploadChunkSize),
      BigInt(computeChunkSize),
      "ipfs://heprs-5000",
      prov.manifestHash,
      prov.sourceModelHash,
      quantized.weightZeroPoint,
      quantized.scoreOffset
    );
    await marketplace.createModelShell(
      false,
      BigInt(quantized.weights.length),
      BigInt(uploadChunkSize),
      BigInt(computeChunkSize),
      "ipfs://heprs-5000",
      prov.manifestHash,
      prov.sourceModelHash,
      quantized.weightZeroPoint,
      quantized.scoreOffset
    );
    for (const chunk of chunkBigIntVector(quantized.weights, uploadChunkSize)) {
      await marketplace.appendPublicModelChunk(modelId, chunk);
    }
    await marketplace.finalizeModel(modelId);

    const Registry = await ethers.getContractFactory("GenomicRegistry");
    const registry = await Registry.deploy();
    const sampleId = await registry.registerSampleWithManifest.staticCall(
      "ipfs://heprs-5000-sample",
      prov.genotypeManifestHash
    );
    await registry.registerSampleWithManifest(
      "ipfs://heprs-5000-sample",
      prov.genotypeManifestHash
    );
    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Engine.deploy(await marketplace.getAddress(), await registry.getAddress());
    const engineAddr = await engine.getAddress();
    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);
    for (const chunk of chunkBigIntVector(snps, uploadChunkSize)) {
      const enc = await encryptUint64Array(engineAddr, signer.address, chunk);
      await engine.appendSnpChunk(jobId, enc.handles, enc.inputProof);
    }
    await engine.finalizeSnpUpload(jobId);

    await engine.computeChunk(jobId);
    const partialHandle = await engine.getPartialSum(jobId);
    expect(await debugDecryptUint64(partialHandle)).to.equal(expectedFirstChunk);

    const totalComputeChunks = Math.ceil(snps.length / computeChunkSize);
    for (let i = 1; i < totalComputeChunks; i++) {
      await engine.computeChunk(jobId);
    }

    const tx = await engine.finalize(jobId);
    const receipt = await tx.wait();
    const finalEvent = receipt!.logs.find(
      (log: any) => engine.interface.parseLog(log)?.name === "JobFinalized"
    );
    const scoreHandle = engine.interface.parseLog(finalEvent as any)!.args.encodedScore;
    expect(await debugDecryptUint64(scoreHandle)).to.equal(expected);
  });
});

const UINT64_MAX = 2n ** 64n - 1n;

describe("HEPRS quantization — overflow safety across all individuals", function () {
  // Pure TypeScript: no contract calls, no FHE. Verifies that the encoded score
  // produced by the quantization formula stays within uint64 bounds for every
  // individual in every fixture. An overflow here would silently corrupt the
  // on-chain accumulator.
  for (const fixtureSize of HEPRS_FIXTURE_SIZES) {
    it(`encoded scores stay within uint64 for all 50 individuals — ${fixtureSize} SNP fixture`, function () {
      const { genotypes, betas } = loadHeprsFixture(fixtureSize);
      const quantized = quantizeHeprsWeightsWithRecommendation(fixtureSize, betas);

      for (let idx = 0; idx < genotypes.length; idx++) {
        const snps = toBigIntVector(genotypes[idx]);
        const naive = dotProductBigInt(snps, quantized.weights);
        const genoSum = snps.reduce((a, b) => a + b, 0n);
        const encoded = naive + quantized.scoreOffset - quantized.weightZeroPoint * genoSum;

        expect(encoded, `individual ${idx}: encoded score is negative`).to.be.gte(0n);
        expect(encoded, `individual ${idx}: encoded score overflows uint64`).to.be.lte(UINT64_MAX);
      }
    });
  }
});
