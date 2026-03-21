import { expect } from "chai";
import { ethers } from "hardhat";

import {
  dotProductBigInt,
  loadHeprsFixture,
  quantizeSignedWeightsToUint64,
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

describe("HEPRS fixture compatibility — mock FHE (Hardhat)", function () {
  this.timeout(120000);

  for (const fixtureSize of ONCHAIN_HEPRS_FIXTURE_SIZES) {
    it(`matches a plaintext dot product on the HEPRS ${fixtureSize}-SNP fixture`, async function () {
      const { genotypes, betas } = loadHeprsFixture(fixtureSize);
      const sampleIndex = 0;
      const snps = toBigIntVector(genotypes[sampleIndex]);

      // The original HEPRS beta row contains negative floats. For this first
      // on-chain math check we quantize to integers and shift them into the
      // non-negative range that the current Solidity prototype supports.
      const quantized = quantizeSignedWeightsToUint64(betas);
      const chunkSize = 128n;
      const firstChunkLength = Number(chunkSize);
      const expected = dotProductBigInt(snps, quantized.weights);
      const expectedFirstChunk = dotProductBigInt(
        snps.slice(0, firstChunkLength),
        quantized.weights.slice(0, firstChunkLength)
      );

      expect(snps.length).to.equal(quantized.weights.length);
      expect(snps.length).to.equal(fixtureSize + 1);

      const Marketplace = await ethers.getContractFactory("ModelMarketplace");
      const marketplace = await Marketplace.deploy();
      const modelId = await marketplace.modelCount();
      await marketplace.listPublicModel(quantized.weights);

      const Engine = await ethers.getContractFactory("PRSComputeEngine");
      const engine = await Engine.deploy(await marketplace.getAddress());

      const jobId = await engine.jobCount();
      await engine.startPRS(modelId, snps, chunkSize);

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

  it("loads the HEPRS 5000-SNP fixture, matches local chunked math, and documents the current on-chain listing limit", async function () {
    const { genotypes, betas } = loadHeprsFixture(5000);
    const snps = toBigIntVector(genotypes[0]);
    const quantized = quantizeSignedWeightsToUint64(betas);
    const chunkLength = 128;

    expect(snps.length).to.equal(quantized.weights.length);
    expect(snps.length).to.equal(5001);

    const expected = dotProductBigInt(snps, quantized.weights);
    const chunked = chunkedDotProductBigInt(snps, quantized.weights, chunkLength);
    expect(chunked).to.equal(expected);

    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Marketplace.deploy();

    await expect(
      marketplace.listPublicModel(quantized.weights)
    ).to.be.rejectedWith(/out of gas/i);
  });
});
