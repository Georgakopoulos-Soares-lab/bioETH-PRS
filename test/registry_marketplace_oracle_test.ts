import { expect } from "chai";
import { ethers } from "hardhat";

// Mock-mode integration test: no fhEVM node, Docker, or fhevmjs needed.
// In the mock, euint64 is type-aliased to uint64 — pass plain bigint values.

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += chunkSize) {
    chunks.push(values.slice(start, start + chunkSize));
  }
  return chunks;
}

describe("Registry / Marketplace / Oracle — mock FHE (Hardhat)", function () {
  describe("GenomicRegistry ACL", function () {
    it("owner can read their own sample", async function () {
      const [owner] = await ethers.getSigners();
      const Registry = await ethers.getContractFactory("GenomicRegistry");
      const registry = await Registry.deploy();

      const sampleId = await registry.registerSample.staticCall("ipfs://sample");
      await registry.registerSample("ipfs://sample");
      expect(await registry.sampleCount()).to.equal(1n);

      const [uri, sampleOwner] = await registry.getSample(sampleId);
      expect(uri).to.equal("ipfs://sample");
      expect(sampleOwner).to.equal(owner.address);
    });

    it("stranger is denied before access is granted", async function () {
      const [, stranger] = await ethers.getSigners();
      const Registry = await ethers.getContractFactory("GenomicRegistry");
      const registry = await Registry.deploy();
      await registry.registerSample("ipfs://sample");

      await expect(registry.connect(stranger).getSample(0n))
        .to.be.revertedWith("Access denied");
    });

    it("grantAccess / revokeAccess work correctly", async function () {
      const [, researcher] = await ethers.getSigners();
      const Registry = await ethers.getContractFactory("GenomicRegistry");
      const registry = await Registry.deploy();
      await registry.registerSample("ipfs://sample");

      await registry.grantAccess(0n, researcher.address);
      const [uri] = await registry.connect(researcher).getSample(0n);
      expect(uri).to.equal("ipfs://sample");

      await registry.revokeAccess(0n, researcher.address);
      await expect(registry.connect(researcher).getSample(0n))
        .to.be.revertedWith("Access denied");
    });
  });

  describe("ModelMarketplace → PRSComputeEngine (public model)", function () {
    it("computes correct dot product via mulPlain", async function () {
      const Marketplace = await ethers.getContractFactory("ModelMarketplace");
      const marketplace = await Marketplace.deploy();

      // weights = [1, 2, 3], snps = [4, 5, 6], chunkSize = 2
      // expected (mulPlain path): 4*1 + 5*2 + 6*3 = 4 + 10 + 18 = 32
      const modelId = await marketplace.createModelShell.staticCall(
        false,
        3n,
        2n,
        "ipfs://manifest",
        ethers.ZeroHash,
        ethers.ZeroHash,
        0n,
        0n
      );
      await marketplace.createModelShell(
        false,
        3n,
        2n,
        "ipfs://manifest",
        ethers.ZeroHash,
        ethers.ZeroHash,
        0n,
        0n
      );
      await marketplace.appendPublicModelChunk(modelId, [1n, 2n]);
      await marketplace.appendPublicModelChunk(modelId, [3n]);
      await marketplace.finalizeModel(modelId);
      expect(await marketplace.modelCount()).to.equal(1n);

      const Engine = await ethers.getContractFactory("PRSComputeEngine");
      const engine = await Engine.deploy(await marketplace.getAddress());

      const snps = [4n, 5n, 6n];
      const jobId = await engine.createPRSJob.staticCall(modelId);
      await engine.createPRSJob(modelId);
      for (const chunk of chunkArray(snps, 2)) {
        await engine.appendSnpChunk(jobId, chunk);
      }
      await engine.finalizeSnpUpload(jobId);
      expect(await engine.jobCount()).to.equal(1n);

      // Chunk 1: indices [0, 2) → 0 + 4*1 + 5*2 = 14
      await engine.computeChunk(jobId);
      const partial = await engine.readPartial.staticCall(jobId);
      expect(partial).to.equal(14n);

      // Chunk 2: indices [2, 3) → 14 + 6*3 = 32
      await engine.computeChunk(jobId);
      const score = await engine.finalize.staticCall(jobId);
      expect(score).to.equal(32n);
    });

    it("computes correct dot product via encrypted chunks after authorizing the engine", async function () {
      const Marketplace = await ethers.getContractFactory("ModelMarketplace");
      const marketplace = await Marketplace.deploy();

      const modelId = await marketplace.createModelShell.staticCall(
        true,
        3n,
        2n,
        "ipfs://private-manifest",
        ethers.ZeroHash,
        ethers.ZeroHash,
        0n,
        0n
      );
      await marketplace.createModelShell(
        true,
        3n,
        2n,
        "ipfs://private-manifest",
        ethers.ZeroHash,
        ethers.ZeroHash,
        0n,
        0n
      );
      await marketplace.appendEncryptedModelChunk(modelId, [2n, 3n]);
      await marketplace.appendEncryptedModelChunk(modelId, [4n]);

      const Engine = await ethers.getContractFactory("PRSComputeEngine");
      const engine = await Engine.deploy(await marketplace.getAddress());
      await marketplace.setPrivateModelReader(
        modelId,
        await engine.getAddress(),
        true
      );
      await marketplace.finalizeModel(modelId);

      const snps = [5n, 6n, 7n];
      const jobId = await engine.createPRSJob.staticCall(modelId);
      await engine.createPRSJob(modelId);
      for (const chunk of chunkArray(snps, 2)) {
        await engine.appendSnpChunk(jobId, chunk);
      }
      await engine.finalizeSnpUpload(jobId);

      await engine.computeChunk(jobId);
      const partial = await engine.readPartial.staticCall(jobId);
      expect(partial).to.equal(28n);

      await engine.computeChunk(jobId);
      const score = await engine.finalize.staticCall(jobId);
      expect(score).to.equal(56n);
    });
  });

  describe("ResultOracle classification", function () {
    async function deployOracle() {
      const Oracle = await ethers.getContractFactory("ResultOracle");
      return Oracle.deploy();
    }

    // low=10, high=20, noise=0 for all cases
    it("classifies score below low threshold as Low (0)", async function () {
      const oracle = await deployOracle();
      const category = await oracle.classify.staticCall(5n, 0n, 10n, 20n);
      expect(category).to.equal(0n); // Low
    });

    it("classifies score between thresholds as Medium (1)", async function () {
      const oracle = await deployOracle();
      const category = await oracle.classify.staticCall(15n, 0n, 10n, 20n);
      expect(category).to.equal(1n); // Medium
    });

    it("classifies score above high threshold as High (2)", async function () {
      const oracle = await deployOracle();
      const category = await oracle.classify.staticCall(32n, 0n, 10n, 20n);
      expect(category).to.equal(2n); // High
    });

    it("noise shifts score into next bucket", async function () {
      const oracle = await deployOracle();
      // score=8 + noise=5 = 13, which is between 10 and 20 → Medium
      const category = await oracle.classify.staticCall(8n, 5n, 10n, 20n);
      expect(category).to.equal(1n); // Medium
    });
  });
});
