import { expect } from "chai";
import { ethers } from "hardhat";

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
      ethers.ZeroHash
    );
    await marketplace.createModelShell(
      false,
      BigInt(weights.length),
      chunkSize,
      "ipfs://public-model",
      ethers.ZeroHash,
      ethers.ZeroHash
    );
    for (const chunk of chunkArray(weights, Number(chunkSize))) {
      await marketplace.appendPublicModelChunk(modelId, chunk);
    }
    await marketplace.finalizeModel(modelId);
    return { marketplace, modelId };
  }

  it("creates a job shell using finalized model geometry", async function () {
    const [jobOwner] = await ethers.getSigners();
    const { marketplace, modelId } = await deployPublicModel([1n, 2n, 3n], 2n);
    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Engine.deploy(await marketplace.getAddress());

    const expectedJobId = await engine.createPRSJob.staticCall(modelId);
    await expect(engine.createPRSJob(modelId))
      .to.emit(engine, "JobCreated")
      .withArgs(expectedJobId, modelId, jobOwner.address, 3n, 2n);

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
      complete
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
  });

  it("rejects job creation for invalid or unfinalized models", async function () {
    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Marketplace.deploy();
    await marketplace.createModelShell(
      false,
      3n,
      2n,
      "ipfs://draft-model",
      ethers.ZeroHash,
      ethers.ZeroHash
    );

    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Engine.deploy(await marketplace.getAddress());

    await expect(engine.createPRSJob(0n)).to.be.revertedWith("Model not finalized");
    await expect(engine.createPRSJob(99n)).to.be.revertedWith("Invalid model");
  });

  it("appends SNP chunks sequentially and finalizes upload", async function () {
    const [jobOwner] = await ethers.getSigners();
    const { marketplace, modelId } = await deployPublicModel([1n, 2n, 3n], 2n);
    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Engine.deploy(await marketplace.getAddress());

    const jobId = await engine.createPRSJob.staticCall(modelId);
    await engine.createPRSJob(modelId);

    await expect(engine.appendSnpChunk(jobId, [4n, 5n]))
      .to.emit(engine, "SnpChunkAppended")
      .withArgs(jobId, 0n, 2n);

    let state = await engine.getJobState(jobId);
    expect(state[5]).to.equal(2n);
    expect(state[6]).to.equal(false);

    await engine.appendSnpChunk(jobId, [6n]);
    await expect(engine.finalizeSnpUpload(jobId))
      .to.emit(engine, "SnpUploadFinalized")
      .withArgs(jobId, jobOwner.address);

    state = await engine.getJobState(jobId);
    expect(state[5]).to.equal(3n);
    expect(state[6]).to.equal(true);
  });

  it("rejects invalid SNP chunk lengths, extra chunks, and non-requester uploads", async function () {
    const [, stranger] = await ethers.getSigners();
    const { marketplace, modelId } = await deployPublicModel([1n, 2n, 3n], 2n);
    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Engine.deploy(await marketplace.getAddress());

    const jobId = await engine.createPRSJob.staticCall(modelId);
    await engine.createPRSJob(modelId);

    await expect(engine.appendSnpChunk(jobId, [4n]))
      .to.be.revertedWith("Invalid SNP chunk length");
    await expect(engine.connect(stranger).appendSnpChunk(jobId, [4n, 5n]))
      .to.be.revertedWith("Not requester");

    await engine.appendSnpChunk(jobId, [4n, 5n]);
    await engine.appendSnpChunk(jobId, [6n]);
    await expect(engine.appendSnpChunk(jobId, [7n]))
      .to.be.revertedWith("All SNP chunks uploaded");

    await engine.finalizeSnpUpload(jobId);
    await expect(engine.appendSnpChunk(jobId, [7n]))
      .to.be.revertedWith("SNP upload finalized");
  });

  it("rejects compute before SNP upload is finalized", async function () {
    const { marketplace, modelId } = await deployPublicModel([1n, 2n, 3n], 2n);
    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Engine.deploy(await marketplace.getAddress());

    const jobId = await engine.createPRSJob.staticCall(modelId);
    await engine.createPRSJob(modelId);
    await engine.appendSnpChunk(jobId, [4n, 5n]);
    await engine.appendSnpChunk(jobId, [6n]);

    await expect(engine.computeChunk(jobId))
      .to.be.revertedWith("SNP upload not finalized");
  });

  it("computes a public-model dot product and allows permissionless compute relays", async function () {
    const [, relayer] = await ethers.getSigners();
    const { marketplace, modelId } = await deployPublicModel([1n, 2n, 3n], 2n);
    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Engine.deploy(await marketplace.getAddress());

    const jobId = await engine.createPRSJob.staticCall(modelId);
    await engine.createPRSJob(modelId);
    await engine.appendSnpChunk(jobId, [4n, 5n]);
    await engine.appendSnpChunk(jobId, [6n]);
    await engine.finalizeSnpUpload(jobId);

    await engine.connect(relayer).computeChunk(jobId);
    const partial = await engine.readPartial.staticCall(jobId);
    expect(partial).to.equal(14n);

    await engine.connect(relayer).computeChunk(jobId);
    const score = await engine.finalize.staticCall(jobId);
    expect(score).to.equal(32n);
  });

  it("requires the requester for readPartial and finalize", async function () {
    const [, stranger] = await ethers.getSigners();
    const { marketplace, modelId } = await deployPublicModel([1n, 2n], 2n);
    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Engine.deploy(await marketplace.getAddress());

    const jobId = await engine.createPRSJob.staticCall(modelId);
    await engine.createPRSJob(modelId);
    await engine.appendSnpChunk(jobId, [3n, 4n]);
    await engine.finalizeSnpUpload(jobId);
    await engine.computeChunk(jobId);

    await expect(engine.connect(stranger).readPartial(jobId))
      .to.be.revertedWith("Not requester");
    await expect(engine.connect(stranger).finalize(jobId))
      .to.be.revertedWith("Not requester");
  });

  it("requires private-model authorization and computes after authorization", async function () {
    const Engine = await ethers.getContractFactory("PRSComputeEngine");

    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Marketplace.deploy();
    const engine = await Engine.deploy(await marketplace.getAddress());

    const modelId = await marketplace.createModelShell.staticCall(
      true,
      3n,
      2n,
      "ipfs://private-model",
      ethers.ZeroHash,
      ethers.ZeroHash
    );
    await marketplace.createModelShell(
      true,
      3n,
      2n,
      "ipfs://private-model",
      ethers.ZeroHash,
      ethers.ZeroHash
    );
    await marketplace.appendEncryptedModelChunk(modelId, [2n, 3n]);
    await marketplace.appendEncryptedModelChunk(modelId, [4n]);
    await marketplace.finalizeModel(modelId);

    await expect(engine.createPRSJob(modelId))
      .to.be.revertedWith("Engine not authorized");

    await marketplace.setPrivateModelReader(
      modelId,
      await engine.getAddress(),
      true
    );

    const jobId = await engine.createPRSJob.staticCall(modelId);
    await engine.createPRSJob(modelId);
    await engine.appendSnpChunk(jobId, [5n, 6n]);
    await engine.appendSnpChunk(jobId, [7n]);
    await engine.finalizeSnpUpload(jobId);

    await engine.computeChunk(jobId);
    await engine.computeChunk(jobId);
    const score = await engine.finalize.staticCall(jobId);
    expect(score).to.equal(56n);
  });
});
