import { expect } from "chai";
import { ethers } from "hardhat";
import { encryptUint64Array, debugDecryptUint64 } from "./utils/fhevm-helpers";

describe("BioETHPRS — fhEVM mock coprocessor (Hardhat)", function () {
  async function deploy() {
    const BioETHPRS = await ethers.getContractFactory("BioETHPRS");
    return BioETHPRS.deploy();
  }

  it("computes correct PRS via chunked dot product", async function () {
    const [signer] = await ethers.getSigners();
    const bioeth = await deploy();
    const addr = await bioeth.getAddress();

    // weights = [2, 3, 4], snps = [5, 6, 7], chunkSize = 2
    // expected: 2*5 + 3*6 + 4*7 = 10 + 18 + 28 = 56
    const weightsEnc = await encryptUint64Array(addr, signer.address, [2n, 3n, 4n]);
    const modelId = await bioeth.uploadModel.staticCall(
      weightsEnc.handles, weightsEnc.inputProof, false
    );
    await bioeth.uploadModel(weightsEnc.handles, weightsEnc.inputProof, false);
    expect(await bioeth.modelCount()).to.equal(1n);

    const snpsEnc = await encryptUint64Array(addr, signer.address, [5n, 6n, 7n]);
    const jobId = await bioeth.startPRS.staticCall(
      modelId, snpsEnc.handles, snpsEnc.inputProof, 2
    );
    await bioeth.startPRS(modelId, snpsEnc.handles, snpsEnc.inputProof, 2);
    expect(await bioeth.jobCount()).to.equal(1n);

    // Chunk 1: indices [0, 2) → 0 + 2*5 + 3*6 = 28
    await bioeth.computeChunk(jobId);
    const partialHandle = await bioeth.getPartialSum(jobId);
    expect(await debugDecryptUint64(partialHandle)).to.equal(28n);

    // Chunk 2: indices [2, 3) → 28 + 4*7 = 56
    await bioeth.computeChunk(jobId);
    // finalize is a write tx (FHE.allow), use getPartialSum for the raw handle
    const finalHandle = await bioeth.getPartialSum(jobId);
    expect(await debugDecryptUint64(finalHandle)).to.equal(56n);
  });

  it("emits JobCreated and ChunkComputed events", async function () {
    const [signer] = await ethers.getSigners();
    const bioeth = await deploy();
    const addr = await bioeth.getAddress();

    const weightsEnc = await encryptUint64Array(addr, signer.address, [10n, 20n]);
    await bioeth.uploadModel(weightsEnc.handles, weightsEnc.inputProof, false);

    const snpsEnc = await encryptUint64Array(addr, signer.address, [3n, 4n]);
    await expect(bioeth.startPRS(0n, snpsEnc.handles, snpsEnc.inputProof, 2))
      .to.emit(bioeth, "JobCreated")
      .withArgs(0n, 0n, signer.address);

    await expect(bioeth.computeChunk(0n))
      .to.emit(bioeth, "ChunkComputed")
      .withArgs(0n, 2n, true);
  });

  it("rejects invalid model id in startPRS", async function () {
    const [signer] = await ethers.getSigners();
    const bioeth = await deploy();
    const addr = await bioeth.getAddress();

    const snpsEnc = await encryptUint64Array(addr, signer.address, [1n]);
    await expect(bioeth.startPRS(99n, snpsEnc.handles, snpsEnc.inputProof, 1n))
      .to.be.revertedWith("Invalid model");
  });

  it("rejects finalize before job is complete", async function () {
    const [signer] = await ethers.getSigners();
    const bioeth = await deploy();
    const addr = await bioeth.getAddress();

    const weightsEnc = await encryptUint64Array(addr, signer.address, [10n, 20n]);
    await bioeth.uploadModel(weightsEnc.handles, weightsEnc.inputProof, false);

    // chunkSize 1, two snps → need two computeChunk calls
    const snpsEnc = await encryptUint64Array(addr, signer.address, [5n, 6n]);
    const jobId = await bioeth.startPRS.staticCall(
      0n, snpsEnc.handles, snpsEnc.inputProof, 1n
    );
    await bioeth.startPRS(0n, snpsEnc.handles, snpsEnc.inputProof, 1n);
    await bioeth.computeChunk(jobId); // only first chunk
    await expect(bioeth.finalize(jobId))
      .to.be.revertedWith("Job not complete");
  });

  it("rejects double-computation past completion", async function () {
    const [signer] = await ethers.getSigners();
    const bioeth = await deploy();
    const addr = await bioeth.getAddress();

    const weightsEnc = await encryptUint64Array(addr, signer.address, [5n]);
    await bioeth.uploadModel(weightsEnc.handles, weightsEnc.inputProof, false);

    const snpsEnc = await encryptUint64Array(addr, signer.address, [3n]);
    const jobId = await bioeth.startPRS.staticCall(
      0n, snpsEnc.handles, snpsEnc.inputProof, 10n
    );
    await bioeth.startPRS(0n, snpsEnc.handles, snpsEnc.inputProof, 10n);
    await bioeth.computeChunk(jobId); // completes (chunkSize > length)
    await expect(bioeth.computeChunk(jobId))
      .to.be.revertedWith("Job already complete");
  });

  it("readPartial is restricted to the requester", async function () {
    const [owner, stranger] = await ethers.getSigners();
    const bioeth = await deploy();
    const addr = await bioeth.getAddress();

    const weightsEnc = await encryptUint64Array(addr, owner.address, [5n, 6n]);
    await bioeth.connect(owner).uploadModel(weightsEnc.handles, weightsEnc.inputProof, false);

    const snpsEnc = await encryptUint64Array(addr, owner.address, [1n, 2n]);
    const jobId = await bioeth.connect(owner).startPRS.staticCall(
      0n, snpsEnc.handles, snpsEnc.inputProof, 10n
    );
    await bioeth.connect(owner).startPRS(0n, snpsEnc.handles, snpsEnc.inputProof, 10n);

    // Requester can call readPartial
    await expect(bioeth.connect(owner).readPartial(jobId)).to.not.be.reverted;

    // A stranger cannot grant themselves decrypt access
    await expect(bioeth.connect(stranger).readPartial(jobId))
      .to.be.revertedWith("Not requester");
  });
});
