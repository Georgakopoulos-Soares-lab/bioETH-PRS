import { expect } from "chai";
import { ethers } from "hardhat";

// Mock-mode tests: run directly on Hardhat with the plaintext FHE mock.
// No fhEVM node, no Docker, no fhevmjs needed.
// In the mock, euint64 is type-aliased to uint64 — pass plain bigint values.

describe("BioETHPRS — mock FHE (Hardhat)", function () {
  async function deploy() {
    const BioETHPRS = await ethers.getContractFactory("BioETHPRS");
    return BioETHPRS.deploy();
  }

  it("computes correct PRS via chunked dot product", async function () {
    const bioeth = await deploy();

    // weights = [2, 3, 4], snps = [5, 6, 7], chunkSize = 2
    // expected: 2*5 + 3*6 + 4*7 = 10 + 18 + 28 = 56
    const weights = [2n, 3n, 4n];
    const snps = [5n, 6n, 7n];

    const modelId = await bioeth.uploadModel.staticCall(weights, false);
    await bioeth.uploadModel(weights, false);
    expect(await bioeth.modelCount()).to.equal(1n);

    const jobId = await bioeth.startPRS.staticCall(modelId, snps, 2);
    await bioeth.startPRS(modelId, snps, 2);
    expect(await bioeth.jobCount()).to.equal(1n);

    // Chunk 1: indices [0, 2) → 0 + 2*5 + 3*6 = 28
    await bioeth.computeChunk(jobId);
    const partial = await bioeth.readPartial.staticCall(jobId);
    expect(partial).to.equal(28n);

    // Chunk 2: indices [2, 3) → 28 + 4*7 = 56
    await bioeth.computeChunk(jobId);
    const finalScore = await bioeth.finalize.staticCall(jobId);
    expect(finalScore).to.equal(56n);
  });

  it("emits JobCreated and ChunkComputed events", async function () {
    const bioeth = await deploy();
    await bioeth.uploadModel([10n, 20n], false);

    await expect(bioeth.startPRS(0n, [3n, 4n], 2))
      .to.emit(bioeth, "JobCreated")
      .withArgs(0n, 0n, (await ethers.getSigners())[0].address);

    await expect(bioeth.computeChunk(0n))
      .to.emit(bioeth, "ChunkComputed")
      .withArgs(0n, 2n, true);
  });

  it("rejects invalid model id in startPRS", async function () {
    const bioeth = await deploy();
    await expect(bioeth.startPRS(99n, [1n], 1n))
      .to.be.revertedWith("Invalid model");
  });

  it("rejects finalize before job is complete", async function () {
    const bioeth = await deploy();
    await bioeth.uploadModel([10n, 20n], false);
    // chunkSize 1, two snps → need two computeChunk calls
    const jobId = await bioeth.startPRS.staticCall(0n, [5n, 6n], 1n);
    await bioeth.startPRS(0n, [5n, 6n], 1n);
    await bioeth.computeChunk(jobId); // only first chunk
    await expect(bioeth.finalize(jobId))
      .to.be.revertedWith("Job not complete");
  });

  it("rejects double-computation past completion", async function () {
    const bioeth = await deploy();
    await bioeth.uploadModel([5n], false);
    const jobId = await bioeth.startPRS.staticCall(0n, [3n], 10n);
    await bioeth.startPRS(0n, [3n], 10n);
    await bioeth.computeChunk(jobId); // completes (chunkSize > length)
    await expect(bioeth.computeChunk(jobId))
      .to.be.revertedWith("Job already complete");
  });
});
