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
    uploadChunkSize: bigint,
    computeChunkSize: bigint
  ) {
    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Marketplace.deploy();
    const modelId = await marketplace.createModelShell.staticCall(
      false,
      BigInt(weights.length),
      uploadChunkSize,
      computeChunkSize,
      "ipfs://public-model",
      ethers.ZeroHash,
      ethers.ZeroHash,
      0n,
      0n
    );
    await marketplace.createModelShell(
      false,
      BigInt(weights.length),
      uploadChunkSize,
      computeChunkSize,
      "ipfs://public-model",
      ethers.ZeroHash,
      ethers.ZeroHash,
      0n,
      0n
    );
    // Publish weights in uploadChunkSize batches
    for (const chunk of chunkArray(weights, Number(uploadChunkSize))) {
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
    const { marketplace, modelId } = await deployPublicModel([1n, 2n, 3n], 2n, 2n);
    const { engine, sampleId } = await deployEngine(await marketplace.getAddress(), jobOwner.address);

    const expectedJobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await expect(engine.createPRSJob(modelId, sampleId))
      .to.emit(engine, "JobCreated")
      .withArgs(expectedJobId, modelId, jobOwner.address, 3n, 2n, sampleId);

    const [
      storedModelId,
      requester,
      weightCount,
      uploadChunkSize,
      computeChunkSize,
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
    expect(uploadChunkSize).to.equal(2n);
    expect(computeChunkSize).to.equal(2n);
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
      false, 3n, 2n, 2n, "ipfs://draft-model", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
    );

    const { engine, sampleId } = await deployEngine(await marketplace.getAddress(), owner.address);

    await expect(engine.createPRSJob(0n, sampleId)).to.be.revertedWith("Model not finalized");
    await expect(engine.createPRSJob(99n, sampleId)).to.be.revertedWith("Invalid model");
  });

  it("appends SNP chunks sequentially and finalizes upload", async function () {
    const [jobOwner] = await ethers.getSigners();
    const { marketplace, modelId } = await deployPublicModel([1n, 2n, 3n], 2n, 2n);
    const { engine, sampleId } = await deployEngine(await marketplace.getAddress(), jobOwner.address);
    const engineAddr = await engine.getAddress();

    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);

    const enc1 = await encryptUint64Array(engineAddr, jobOwner.address, [4n, 5n]);
    await expect(engine.appendSnpChunk(jobId, enc1.handles, enc1.inputProof))
      .to.emit(engine, "SnpChunkAppended")
      .withArgs(jobId, 0n, 2n);

    let state = await engine.getJobState(jobId);
    expect(state[6]).to.equal(2n);  // uploadedSnpCount
    expect(state[7]).to.equal(false); // snpsFinalized

    const enc2 = await encryptUint64Array(engineAddr, jobOwner.address, [6n]);
    await engine.appendSnpChunk(jobId, enc2.handles, enc2.inputProof);
    await expect(engine.finalizeSnpUpload(jobId))
      .to.emit(engine, "SnpUploadFinalized")
      .withArgs(jobId, jobOwner.address);

    state = await engine.getJobState(jobId);
    expect(state[6]).to.equal(3n);  // uploadedSnpCount
    expect(state[7]).to.equal(true); // snpsFinalized
  });

  it("rejects invalid SNP chunk lengths, extra chunks, and non-requester uploads", async function () {
    const [jobOwner, stranger] = await ethers.getSigners();
    const { marketplace, modelId } = await deployPublicModel([1n, 2n, 3n], 2n, 2n);
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
    const { marketplace, modelId } = await deployPublicModel([1n, 2n, 3n], 2n, 2n);
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
    const { marketplace, modelId } = await deployPublicModel([1n, 2n, 3n], 2n, 2n);
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

  it("decoupled: upload SNPs in large batches, compute in smaller HCU-safe chunks", async function () {
    // Model: weights [1,2,3,4,5,6], uploadChunkSize=6 (upload all at once), computeChunkSize=2
    // SNPs: [1,1,1,1,1,1]
    // Expected dot product: 1+2+3+4+5+6 = 21 (no zero-point correction)
    const [jobOwner] = await ethers.getSigners();
    const weights = [1n, 2n, 3n, 4n, 5n, 6n];
    const { marketplace, modelId } = await deployPublicModel(weights, 6n, 2n);
    const { engine, sampleId } = await deployEngine(await marketplace.getAddress(), jobOwner.address);
    const engineAddr = await engine.getAddress();

    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);

    // Upload all 6 SNPs in a single transaction (uploadChunkSize=6)
    const enc = await encryptUint64Array(engineAddr, jobOwner.address, [1n, 1n, 1n, 1n, 1n, 1n]);
    await engine.appendSnpChunk(jobId, enc.handles, enc.inputProof);
    await engine.finalizeSnpUpload(jobId);

    // Compute in 3 chunks of 2 (computeChunkSize=2)
    await engine.computeChunk(jobId); // weights [1,2] × snps [1,1] = 3
    await engine.computeChunk(jobId); // weights [3,4] × snps [1,1] = 7
    await engine.computeChunk(jobId); // weights [5,6] × snps [1,1] = 11

    const tx = await engine.finalize(jobId);
    const receipt = await tx.wait();
    const finalEvent = receipt!.logs.find(
      (log: any) => engine.interface.parseLog(log)?.name === "JobFinalized"
    );
    const scoreHandle = engine.interface.parseLog(finalEvent as any)!.args.encodedScore;
    expect(await debugDecryptUint64(scoreHandle)).to.equal(21n);
  });

  it("requires the requester for readPartial and finalize", async function () {
    const [jobOwner, stranger] = await ethers.getSigners();
    const { marketplace, modelId } = await deployPublicModel([1n, 2n], 2n, 2n);
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
      true, 3n, 2n, 2n, "ipfs://private-model",
      ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
    );
    await marketplace.createModelShell(
      true, 3n, 2n, 2n, "ipfs://private-model",
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
      const { marketplace, modelId } = await deployPublicModel([1n, 2n], 2n, 2n);
      const { engine, sampleId } = await deployEngine(await marketplace.getAddress(), owner.address);

      await expect(engine.createPRSJob(modelId, sampleId)).to.not.be.reverted;
    });

    it("delegate with grantAccess can create a job", async function () {
      const [owner, researcher] = await ethers.getSigners();
      const { marketplace, modelId } = await deployPublicModel([1n, 2n], 2n, 2n);
      const { engine, registry, sampleId } = await deployEngine(await marketplace.getAddress(), owner.address);

      await registry.grantAccess(sampleId, researcher.address);
      await expect(engine.connect(researcher).createPRSJob(modelId, sampleId)).to.not.be.reverted;
    });

    it("stranger without access is rejected", async function () {
      const [owner, stranger] = await ethers.getSigners();
      const { marketplace, modelId } = await deployPublicModel([1n, 2n], 2n, 2n);
      const { engine, sampleId } = await deployEngine(await marketplace.getAddress(), owner.address);

      await expect(engine.connect(stranger).createPRSJob(modelId, sampleId))
        .to.be.revertedWith("No registry access");
    });

    it("revoked grantee is rejected", async function () {
      const [owner, researcher] = await ethers.getSigners();
      const { marketplace, modelId } = await deployPublicModel([1n, 2n], 2n, 2n);
      const { engine, registry, sampleId } = await deployEngine(await marketplace.getAddress(), owner.address);

      await registry.grantAccess(sampleId, researcher.address);
      await registry.revokeAccess(sampleId, researcher.address);
      await expect(engine.connect(researcher).createPRSJob(modelId, sampleId))
        .to.be.revertedWith("No registry access");
    });

    it("rejects an unregistered sampleId", async function () {
      const [owner] = await ethers.getSigners();
      const { marketplace, modelId } = await deployPublicModel([1n, 2n], 2n, 2n);
      const { engine } = await deployEngine(await marketplace.getAddress(), owner.address);

      await expect(engine.createPRSJob(modelId, 999n))
        .to.be.revertedWith("Invalid sample");
    });
  });

  describe("Private model per-requester authorization", function () {
    async function deployPrivateModel(weights: bigint[]) {
      const [owner] = await ethers.getSigners();
      const Marketplace = await ethers.getContractFactory("ModelMarketplace");
      const marketplace = await Marketplace.deploy();
      const mpAddr = await marketplace.getAddress();

      const modelId = await marketplace.createModelShell.staticCall(
        true, BigInt(weights.length), 2n, 2n, "ipfs://priv",
        ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
      );
      await marketplace.createModelShell(
        true, BigInt(weights.length), 2n, 2n, "ipfs://priv",
        ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
      );
      for (let i = 0; i < weights.length; i += 2) {
        const chunk = weights.slice(i, i + 2);
        const enc = await encryptUint64Array(mpAddr, owner.address, chunk);
        await marketplace.appendEncryptedModelChunk(modelId, enc.handles, enc.inputProof);
      }
      await marketplace.finalizeModel(modelId);
      return { marketplace, modelId, owner, mpAddr };
    }

    it("unauthorized requester is rejected even when engine is authorized", async function () {
      const [owner, stranger] = await ethers.getSigners();
      const { marketplace, modelId } = await deployPrivateModel([1n, 2n]);
      const { engine, registry, sampleId } = await deployEngine(
        await marketplace.getAddress(), owner.address
      );
      // Grant stranger registry access so the registry check passes
      await registry.grantAccess(sampleId, stranger.address);

      // Authorize the engine but NOT stranger
      await marketplace.setPrivateModelReader(modelId, await engine.getAddress(), true);

      await expect(engine.connect(stranger).createPRSJob(modelId, sampleId))
        .to.be.revertedWith("Requester not authorized for private model");
    });

    it("authorized requester can create a job after explicit allowlisting", async function () {
      const [owner, researcher] = await ethers.getSigners();
      const { marketplace, modelId } = await deployPrivateModel([1n, 2n]);
      const { engine, registry, sampleId } = await deployEngine(
        await marketplace.getAddress(), owner.address
      );
      await registry.grantAccess(sampleId, researcher.address);

      const engineAddr = await engine.getAddress();
      await marketplace.setPrivateModelReader(modelId, engineAddr, true);
      await marketplace.setPrivateModelReader(modelId, researcher.address, true);

      await expect(engine.connect(researcher).createPRSJob(modelId, sampleId))
        .to.not.be.reverted;
    });

    it("model owner can always run jobs on their own private model", async function () {
      const [owner] = await ethers.getSigners();
      const { marketplace, modelId } = await deployPrivateModel([1n, 2n]);
      const { engine, sampleId } = await deployEngine(
        await marketplace.getAddress(), owner.address
      );
      await marketplace.setPrivateModelReader(modelId, await engine.getAddress(), true);

      // Owner is auto-authorized at createModelShell time
      await expect(engine.createPRSJob(modelId, sampleId)).to.not.be.reverted;
    });
  });
});
