import { expect } from "chai";
import { ethers } from "hardhat";

import {
  chunkBigIntVector,
  dotProductBigInt,
  getHeprsBalancedRecommendation,
  loadHeprsFixture,
  quantizeHeprsWeightsWithRecommendation,
  toBigIntVector
} from "./utils/heprs";

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

describe("HEPRS fixture integration — mock FHE (Hardhat)", function () {
  this.timeout(120000);

  for (const fixtureSize of ONCHAIN_HEPRS_FIXTURE_SIZES) {
    it(`matches a plaintext dot product on the HEPRS ${fixtureSize}-SNP fixture using the balanced advisor recommendation`, async function () {
      const { genotypes, betas } = loadHeprsFixture(fixtureSize);
      const sampleIndex = 0;
      const snps = toBigIntVector(genotypes[sampleIndex]);
      const recommendation = getHeprsBalancedRecommendation(fixtureSize);
      const quantized = quantizeHeprsWeightsWithRecommendation(
        fixtureSize,
        betas
      );
      const chunkSize = 128n;
      const firstChunkLength = Number(chunkSize);
      // V1 corrected encoded score: (weighted_sum + scoreOffset) - weightZeroPoint * genoSum
      const genoSum = snps.reduce((a, b) => a + b, 0n);
      const naiveDotProduct = dotProductBigInt(snps, quantized.weights);
      const expected = naiveDotProduct + quantized.scoreOffset - quantized.weightZeroPoint * genoSum;
      const expectedFirstChunk = dotProductBigInt(
        snps.slice(0, firstChunkLength),
        quantized.weights.slice(0, firstChunkLength)
      );

      expect(snps.length).to.equal(quantized.weights.length);
      expect(snps.length).to.equal(fixtureSize + 1);
      expect(quantized.scale).to.equal(recommendation.scale);

      const Marketplace = await ethers.getContractFactory("ModelMarketplace");
      const marketplace = await Marketplace.deploy();
      const modelId = await marketplace.createModelShell.staticCall(
        false,
        BigInt(quantized.weights.length),
        chunkSize,
        `ipfs://heprs-${fixtureSize}`,
        ethers.ZeroHash,
        ethers.ZeroHash,
        quantized.weightZeroPoint,
        quantized.scoreOffset
      );
      await marketplace.createModelShell(
        false,
        BigInt(quantized.weights.length),
        chunkSize,
        `ipfs://heprs-${fixtureSize}`,
        ethers.ZeroHash,
        ethers.ZeroHash,
        quantized.weightZeroPoint,
        quantized.scoreOffset
      );
      for (const chunk of chunkBigIntVector(quantized.weights, firstChunkLength)) {
        await marketplace.appendPublicModelChunk(modelId, chunk);
      }
      await marketplace.finalizeModel(modelId);

      const Engine = await ethers.getContractFactory("PRSComputeEngine");
      const engine = await Engine.deploy(await marketplace.getAddress());

      const jobId = await engine.createPRSJob.staticCall(modelId);
      await engine.createPRSJob(modelId);
      for (const chunk of chunkBigIntVector(snps, firstChunkLength)) {
        await engine.appendSnpChunk(jobId, chunk);
      }
      await engine.finalizeSnpUpload(jobId);

      await engine.computeChunk(jobId);
      const partial = await engine.readPartial.staticCall(jobId);
      expect(partial).to.equal(expectedFirstChunk);

      const totalChunks = Math.ceil(snps.length / firstChunkLength);
      for (let i = 1; i < totalChunks; i++) {
        await engine.computeChunk(jobId);
      }

      const score = await engine.finalize.staticCall(jobId);
      expect(score).to.equal(expected);
    });
  }

  it("matches a plaintext dot product on the HEPRS 5000-SNP fixture using chunked SNP ingestion and the balanced advisor recommendation", async function () {
    const { genotypes, betas } = loadHeprsFixture(5000);
    const snps = toBigIntVector(genotypes[0]);
    const recommendation = getHeprsBalancedRecommendation(5000);
    const quantized = quantizeHeprsWeightsWithRecommendation(5000, betas);
    const chunkLength = 128;

    expect(snps.length).to.equal(quantized.weights.length);
    expect(snps.length).to.equal(5001);
    expect(quantized.scale).to.equal(recommendation.scale);

    // V1 corrected encoded score: (weighted_sum + scoreOffset) - weightZeroPoint * genoSum
    const genoSum = snps.reduce((a, b) => a + b, 0n);
    const naiveDotProduct = dotProductBigInt(snps, quantized.weights);
    const expected = naiveDotProduct + quantized.scoreOffset - quantized.weightZeroPoint * genoSum;
    const chunked = chunkedDotProductBigInt(snps, quantized.weights, chunkLength);
    // chunked naive dot product should still match the naive dot product (sanity check)
    expect(chunked).to.equal(naiveDotProduct);
    const expectedFirstChunk = dotProductBigInt(
      snps.slice(0, chunkLength),
      quantized.weights.slice(0, chunkLength)
    );

    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Marketplace.deploy();
    const modelId = await marketplace.createModelShell.staticCall(
      false,
      BigInt(quantized.weights.length),
      BigInt(chunkLength),
      "ipfs://heprs-5000",
      ethers.ZeroHash,
      ethers.ZeroHash,
      quantized.weightZeroPoint,
      quantized.scoreOffset
    );
    await marketplace.createModelShell(
      false,
      BigInt(quantized.weights.length),
      BigInt(chunkLength),
      "ipfs://heprs-5000",
      ethers.ZeroHash,
      ethers.ZeroHash,
      quantized.weightZeroPoint,
      quantized.scoreOffset
    );
    for (const chunk of chunkBigIntVector(quantized.weights, chunkLength)) {
      await marketplace.appendPublicModelChunk(modelId, chunk);
    }
    await marketplace.finalizeModel(modelId);

    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Engine.deploy(await marketplace.getAddress());
    const jobId = await engine.createPRSJob.staticCall(modelId);
    await engine.createPRSJob(modelId);
    for (const chunk of chunkBigIntVector(snps, chunkLength)) {
      await engine.appendSnpChunk(jobId, chunk);
    }
    await engine.finalizeSnpUpload(jobId);

    await engine.computeChunk(jobId);
    const partial = await engine.readPartial.staticCall(jobId);
    expect(partial).to.equal(expectedFirstChunk);

    const totalChunks = Math.ceil(snps.length / chunkLength);
    for (let i = 1; i < totalChunks; i++) {
      await engine.computeChunk(jobId);
    }

    const score = await engine.finalize.staticCall(jobId);
    expect(score).to.equal(expected);
  });
});
