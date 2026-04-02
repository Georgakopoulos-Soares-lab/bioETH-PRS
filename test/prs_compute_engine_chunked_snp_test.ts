import { expect } from "chai";
import { ethers } from "hardhat";
import { encryptUint64Array, debugDecryptUint64 } from "./utils/fhevm-helpers";

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += chunkSize) {
    chunks.push(values.slice(start, start + chunkSize));
  }
  return chunks;
}

describe("PRSComputeEngine — chunked SNP ingestion", function () {
  async function deployPublicModel(
    weights: bigint[],
    chunkSize: bigint
  ) {
    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Marketplace.deploy();
    const modelId = await marketplace.createModelShell.staticCall(
      false,
      BigInt(weights.length),
      chunkSize,
      "ipfs://public-model",
      ethers.ZeroHash,
      ethers.ZeroHash,
      0n,
      0n
    );
    await marketplace.createModelShell(
      false,
      BigInt(weights.length),
      chunkSize,
      "ipfs://public-model",
      ethers.ZeroHash,
      ethers.ZeroHash,
      0n,
      0n
    );
    for (const chunk of chunkArray(weights, Number(chunkSize))) {
      await marketplace.appendPublicModelChunk(modelId, chunk);
    }
    await marketplace.finalizeModel(modelId);
    return { marketplace, modelId };
  }

  async function deployEngine(marketplaceAddr: string, owner: string) {
    const Registry = await ethers.getContractFactory("GenomicRegistry");
    const registry = await Registry.deploy();
    const sampleId = await registry.registerSample.staticCall("ipfs://sample");
    await registry.registerSample("ipfs://sample");
    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Engine.deploy(marketplaceAddr, await registry.getAddress());
    return { engine, registry, sampleId };
  }

  it("creates a job shell using finalized model geometry", async function () {
    const [jobOwner] = await ethers.getSigners();
    const { marketplace, modelId } = await deployPublicModel([1n, 2n, 3n], 2n);
    const { engine, sampleId } = await deployEngine(await marketplace.getAddress(), jobOwner.address);

    const expectedJobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await expect(engine.createPRSJob(modelId, sampleId))
      .to.emit(engine, "JobCreated")
      .withArgs(expectedJobId, modelId, jobOwner.address, 3n, 2n, sampleId);

    const [
      storedModelId,
      requester,
      weightCount,
      chunkSize,
      chunkCount,
      uploadedSnpCount,
      snpsFinalized,
      nextChunkIndex,
      processedWeights,
      isPrivate,
      complete,
      storedSampleId
    ] = await engine.getJobState(expectedJobId);

    expect(storedModelId).to.equal(modelId);
    expect(requester).to.equal(jobOwner.address);
    expect(weightCount).to.equal(3n);
    expect(chunkSize).to.equal(2n);
    expect(chunkCount).to.equal(2n);
    expect(uploadedSnpCount).to.equal(0n);
    expect(snpsFinalized).to.equal(false);
    expect(nextChunkIndex).to.equal(0n);
    expect(processedWeights).to.equal(0n);
    expect(isPrivate).to.equal(false);
    expect(complete).to.equal(false);
    expect(storedSampleId).to.equal(sampleId);
  });

  it("rejects job creation for invalid or unfinalized models", async function () {
    const [owner] = await ethers.getSigners();
    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Marketplace.deploy();
    await marketplace.createModelShell(
      false,
      3n,
      2n,
      "ipfs://draft-model",
      ethers.ZeroHash,
      ethers.ZeroHash,
      0n,
      0n
    );

    const { engine, sampleId } = await deployEngine(await marketplace.getAddress(), owner.address);

    await expect(engine.createPRSJob(0n, sampleId)).to.be.revertedWith("Model not finalized");
    await expect(engine.createPRSJob(99n, sampleId)).to.be.revertedWith("Invalid model");
  });

  it("appends SNP chunks sequentially and finalizes upload", async function () {
    const [jobOwner] = await ethers.getSigners();
    const { marketplace, modelId } = await deployPublicModel([1n, 2n, 3n], 2n);
    const { engine, sampleId } = await deployEngine(await marketplace.getAddress(), jobOwner.address);
    const engineAddr = await engine.getAddress();

    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);

    const enc1 = await encryptUint64Array(engineAddr, jobOwner.address, [4n, 5n]);
    await expect(engine.appendSnpChunk(jobId, enc1.handles, enc1.inputProof))
      .to.emit(engine, "SnpChunkAppended")
      .withArgs(jobId, 0n, 2n);

    let state = await engine.getJobState(jobId);
    expect(state[5]).to.equal(2n);
    expect(state[6]).to.equal(false);

    const enc2 = await encryptUint64Array(engineAddr, jobOwner.address, [6n]);
    await engine.appendSnpChunk(jobId, enc2.handles, enc2.inputProof);
    await expect(engine.finalizeSnpUpload(jobId))
      .to.emit(engine, "SnpUploadFinalized")
      .withArgs(jobId, jobOwner.address);

    state = await engine.getJobState(jobId);
    expect(state[5]).to.equal(3n);
    expect(state[6]).to.equal(true);
  });

  it("rejects invalid SNP chunk lengths, extra chunks, and non-requester uploads", async function () {
    const [jobOwner, stranger] = await ethers.getSigners();
    const { marketplace, modelId } = await deployPublicModel([1n, 2n, 3n], 2n);
    const { engine, sampleId } = await deployEngine(await marketplace.getAddress(), jobOwner.address);
    const engineAddr = await engine.getAddress();

    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);

    const encBad = await encryptUint64Array(engineAddr, jobOwner.address, [4n]);
    await expect(engine.appendSnpChunk(jobId, encBad.handles, encBad.inputProof))
      .to.be.revertedWith("Invalid SNP chunk length");

    const encStranger = await encryptUint64Array(engineAddr, stranger.address, [4n, 5n]);
    await expect(engine.connect(stranger).appendSnpChunk(jobId, encStranger.handles, encStranger.inputProof))
      .to.be.revertedWith("Not requester");

    const enc1 = await encryptUint64Array(engineAddr, jobOwner.address, [4n, 5n]);
    await engine.appendSnpChunk(jobId, enc1.handles, enc1.inputProof);

    const enc2 = await encryptUint64Array(engineAddr, jobOwner.address, [6n]);
    await engine.appendSnpChunk(jobId, enc2.handles, enc2.inputProof);

    const encExtra = await encryptUint64Array(engineAddr, jobOwner.address, [7n]);
    await expect(engine.appendSnpChunk(jobId, encExtra.handles, encExtra.inputProof))
      .to.be.revertedWith("All SNP chunks uploaded");

    await engine.finalizeSnpUpload(jobId);

    const encAfter = await encryptUint64Array(engineAddr, jobOwner.address, [7n]);
    await expect(engine.appendSnpChunk(jobId, encAfter.handles, encAfter.inputProof))
      .to.be.revertedWith("SNP upload finalized");
  });

  it("rejects compute before SNP upload is finalized", async function () {
    const [jobOwner] = await ethers.getSigners();
    const { marketplace, modelId } = await deployPublicModel([1n, 2n, 3n], 2n);
    const { engine, sampleId } = await deployEngine(await marketplace.getAddress(), jobOwner.address);
    const engineAddr = await engine.getAddress();

    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);

    const enc1 = await encryptUint64Array(engineAddr, jobOwner.address, [4n, 5n]);
    await engine.appendSnpChunk(jobId, enc1.handles, enc1.inputProof);

    const enc2 = await encryptUint64Array(engineAddr, jobOwner.address, [6n]);
    await engine.appendSnpChunk(jobId, enc2.handles, enc2.inputProof);

    await expect(engine.computeChunk(jobId))
      .to.be.revertedWith("SNP upload not finalized");
  });

  it("computes a public-model dot product and allows permissionless compute relays", async function () {
    const [jobOwner, relayer] = await ethers.getSigners();
    const { marketplace, modelId } = await deployPublicModel([1n, 2n, 3n], 2n);
    const { engine, sampleId } = await deployEngine(await marketplace.getAddress(), jobOwner.address);
    const engineAddr = await engine.getAddress();

    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);

    const enc1 = await encryptUint64Array(engineAddr, jobOwner.address, [4n, 5n]);
    await engine.appendSnpChunk(jobId, enc1.handles, enc1.inputProof);

    const enc2 = await encryptUint64Array(engineAddr, jobOwner.address, [6n]);
    await engine.appendSnpChunk(jobId, enc2.handles, enc2.inputProof);
    await engine.finalizeSnpUpload(jobId);

    await engine.connect(relayer).computeChunk(jobId);
    const partialHandle = await engine.getPartialSum(jobId);
    expect(await debugDecryptUint64(partialHandle)).to.equal(14n);

    await engine.connect(relayer).computeChunk(jobId);
    const tx = await engine.finalize(jobId);
    const receipt = await tx.wait();
    const finalEvent = receipt!.logs.find(
      (log: any) => engine.interface.parseLog(log)?.name === "JobFinalized"
    );
    const scoreHandle = engine.interface.parseLog(finalEvent as any)!.args.encodedScore;
    expect(await debugDecryptUint64(scoreHandle)).to.equal(32n);
  });

  it("requires the requester for readPartial and finalize", async function () {
    const [jobOwner, stranger] = await ethers.getSigners();
    const { marketplace, modelId } = await deployPublicModel([1n, 2n], 2n);
    const { engine, sampleId } = await deployEngine(await marketplace.getAddress(), jobOwner.address);
    const engineAddr = await engine.getAddress();

    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);

    const enc = await encryptUint64Array(engineAddr, jobOwner.address, [3n, 4n]);
    await engine.appendSnpChunk(jobId, enc.handles, enc.inputProof);
    await engine.finalizeSnpUpload(jobId);
    await engine.computeChunk(jobId);

    await expect(engine.connect(stranger).readPartial(jobId))
      .to.be.revertedWith("Not requester");
    await expect(engine.connect(stranger).finalize(jobId))
      .to.be.revertedWith("Not requester");
  });

  it("requires private-model authorization and computes after authorization", async function () {
    const [owner] = await ethers.getSigners();
    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const Registry = await ethers.getContractFactory("GenomicRegistry");
    const marketplace = await Marketplace.deploy();
    const registry = await Registry.deploy();
    const sampleId = await registry.registerSample.staticCall("ipfs://sample");
    await registry.registerSample("ipfs://sample");
    const engine = await Engine.deploy(await marketplace.getAddress(), await registry.getAddress());
    const mpAddr = await marketplace.getAddress();
    const engineAddr = await engine.getAddress();

    const modelId = await marketplace.createModelShell.staticCall(
      true, 3n, 2n, "ipfs://private-model",
      ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
    );
    await marketplace.createModelShell(
      true, 3n, 2n, "ipfs://private-model",
      ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
    );

    const wEnc1 = await encryptUint64Array(mpAddr, owner.address, [2n, 3n]);
    await marketplace.appendEncryptedModelChunk(modelId, wEnc1.handles, wEnc1.inputProof);

    const wEnc2 = await encryptUint64Array(mpAddr, owner.address, [4n]);
    await marketplace.appendEncryptedModelChunk(modelId, wEnc2.handles, wEnc2.inputProof);
    await marketplace.finalizeModel(modelId);

    await expect(engine.createPRSJob(modelId, sampleId))
      .to.be.revertedWith("Engine not authorized");

    await marketplace.setPrivateModelReader(modelId, engineAddr, true);

    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);

    const sEnc1 = await encryptUint64Array(engineAddr, owner.address, [5n, 6n]);
    await engine.appendSnpChunk(jobId, sEnc1.handles, sEnc1.inputProof);

    const sEnc2 = await encryptUint64Array(engineAddr, owner.address, [7n]);
    await engine.appendSnpChunk(jobId, sEnc2.handles, sEnc2.inputProof);
    await engine.finalizeSnpUpload(jobId);

    await engine.computeChunk(jobId);
    await engine.computeChunk(jobId);
    const tx = await engine.finalize(jobId);
    const receipt = await tx.wait();
    const finalEvent = receipt!.logs.find(
      (log: any) => engine.interface.parseLog(log)?.name === "JobFinalized"
    );
    const scoreHandle = engine.interface.parseLog(finalEvent as any)!.args.encodedScore;
    expect(await debugDecryptUint64(scoreHandle)).to.equal(56n);
  });

  describe("Registry ACL enforcement", function () {
    it("owner can create a job for their own sample", async function () {
      const [owner] = await ethers.getSigners();
      const { marketplace, modelId } = await deployPublicModel([1n, 2n], 2n);
      const { engine, sampleId } = await deployEngine(await marketplace.getAddress(), owner.address);

      await expect(engine.createPRSJob(modelId, sampleId)).to.not.be.reverted;
    });

    it("delegate with grantAccess can create a job", async function () {
      const [owner, researcher] = await ethers.getSigners();
      const { marketplace, modelId } = await deployPublicModel([1n, 2n], 2n);
      const { engine, registry, sampleId } = await deployEngine(await marketplace.getAddress(), owner.address);

      await registry.grantAccess(sampleId, researcher.address);
      await expect(engine.connect(researcher).createPRSJob(modelId, sampleId)).to.not.be.reverted;
    });

    it("stranger without access is rejected", async function () {
      const [owner, stranger] = await ethers.getSigners();
      const { marketplace, modelId } = await deployPublicModel([1n, 2n], 2n);
      const { engine, sampleId } = await deployEngine(await marketplace.getAddress(), owner.address);

      await expect(engine.connect(stranger).createPRSJob(modelId, sampleId))
        .to.be.revertedWith("No registry access");
    });

    it("revoked grantee is rejected", async function () {
      const [owner, researcher] = await ethers.getSigners();
      const { marketplace, modelId } = await deployPublicModel([1n, 2n], 2n);
      const { engine, registry, sampleId } = await deployEngine(await marketplace.getAddress(), owner.address);

      await registry.grantAccess(sampleId, researcher.address);
      await registry.revokeAccess(sampleId, researcher.address);
      await expect(engine.connect(researcher).createPRSJob(modelId, sampleId))
        .to.be.revertedWith("No registry access");
    });

    it("rejects an unregistered sampleId", async function () {
      const [owner] = await ethers.getSigners();
      const { marketplace, modelId } = await deployPublicModel([1n, 2n], 2n);
      const { engine } = await deployEngine(await marketplace.getAddress(), owner.address);

      await expect(engine.createPRSJob(modelId, 999n))
        .to.be.revertedWith("Invalid sample");
    });
  });
});
