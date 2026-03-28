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
      const expected = dotProductBigInt(snps, quantized.weights);
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
        ethers.ZeroHash
      );
      await marketplace.createModelShell(
        false,
        BigInt(quantized.weights.length),
        chunkSize,
        `ipfs://heprs-${fixtureSize}`,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
      for (const chunk of chunkBigIntVector(quantized.weights, firstChunkLength)) {
        await marketplace.appendPublicModelChunk(modelId, chunk);
      }
      await marketplace.finalizeModel(modelId);

      const Engine = await ethers.getContractFactory("PRSComputeEngine");
      const engine = await Engine.deploy(await marketplace.getAddress());

      const jobId = await engine.jobCount();
      await engine.startPRS(modelId, snps);

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

  it("publishes the HEPRS 5000-SNP fixture in chunks using the balanced advisor recommendation and documents SNP-ingestion as the next boundary", async function () {
    const { genotypes, betas } = loadHeprsFixture(5000);
    const snps = toBigIntVector(genotypes[0]);
    const recommendation = getHeprsBalancedRecommendation(5000);
    const quantized = quantizeHeprsWeightsWithRecommendation(5000, betas);
    const chunkLength = 128;

    expect(snps.length).to.equal(quantized.weights.length);
    expect(snps.length).to.equal(5001);
    expect(quantized.scale).to.equal(recommendation.scale);

    const expected = dotProductBigInt(snps, quantized.weights);
    const chunked = chunkedDotProductBigInt(snps, quantized.weights, chunkLength);
    expect(chunked).to.equal(expected);

    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Marketplace.deploy();
    const modelId = await marketplace.createModelShell.staticCall(
      false,
      BigInt(quantized.weights.length),
      BigInt(chunkLength),
      "ipfs://heprs-5000",
      ethers.ZeroHash,
      ethers.ZeroHash
    );
    await marketplace.createModelShell(
      false,
      BigInt(quantized.weights.length),
      BigInt(chunkLength),
      "ipfs://heprs-5000",
      ethers.ZeroHash,
      ethers.ZeroHash
    );
    for (const chunk of chunkBigIntVector(quantized.weights, chunkLength)) {
      await marketplace.appendPublicModelChunk(modelId, chunk);
    }
    await marketplace.finalizeModel(modelId);

    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Engine.deploy(await marketplace.getAddress());

    await expect(
      engine.startPRS(modelId, snps)
    ).to.be.rejectedWith(/out of gas/i);
  });
});
