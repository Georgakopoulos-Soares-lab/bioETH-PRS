import { expect } from "chai";
import { ethers } from "hardhat";
import { encryptUint64Array, debugDecryptUint64, debugDecryptUint8 } from "./utils/fhevm-helpers";

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += chunkSize) {
    chunks.push(values.slice(start, start + chunkSize));
  }
  return chunks;
}

describe("Registry / Marketplace / Oracle — fhEVM mock (Hardhat)", function () {
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
    it("computes correct dot product via public weights", async function () {
      const [signer] = await ethers.getSigners();
      const Marketplace = await ethers.getContractFactory("ModelMarketplace");
      const marketplace = await Marketplace.deploy();

      // weights = [1, 2, 3], snps = [4, 5, 6], chunkSize = 2
      // expected: 4*1 + 5*2 + 6*3 = 4 + 10 + 18 = 32
      const modelId = await marketplace.createModelShell.staticCall(
        false, 3n, 2n, "ipfs://manifest",
        ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
      );
      await marketplace.createModelShell(
        false, 3n, 2n, "ipfs://manifest",
        ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
      );
      await marketplace.appendPublicModelChunk(modelId, [1n, 2n]);
      await marketplace.appendPublicModelChunk(modelId, [3n]);
      await marketplace.finalizeModel(modelId);
      expect(await marketplace.modelCount()).to.equal(1n);

      const Registry = await ethers.getContractFactory("GenomicRegistry");
      const registry = await Registry.deploy();
      const sampleId = await registry.registerSample.staticCall("ipfs://sample");
      await registry.registerSample("ipfs://sample");

      const Engine = await ethers.getContractFactory("PRSComputeEngine");
      const engine = await Engine.deploy(await marketplace.getAddress(), await registry.getAddress());
      const engineAddr = await engine.getAddress();

      const snps = [4n, 5n, 6n];
      const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
      await engine.createPRSJob(modelId, sampleId);
      for (const chunk of chunkArray(snps, 2)) {
        const enc = await encryptUint64Array(engineAddr, signer.address, chunk);
        await engine.appendSnpChunk(jobId, enc.handles, enc.inputProof);
      }
      await engine.finalizeSnpUpload(jobId);
      expect(await engine.jobCount()).to.equal(1n);

      // Chunk 1: indices [0, 2) → 0 + 4*1 + 5*2 = 14
      await engine.computeChunk(jobId);
      const partialHandle = await engine.getPartialSum(jobId);
      expect(await debugDecryptUint64(partialHandle)).to.equal(14n);

      // Chunk 2: indices [2, 3) → 14 + 6*3 = 32
      await engine.computeChunk(jobId);
      const tx = await engine.finalize(jobId);
      const receipt = await tx.wait();
      const finalEvent = receipt!.logs.find(
        (log: any) => engine.interface.parseLog(log)?.name === "JobFinalized"
      );
      const scoreHandle = engine.interface.parseLog(finalEvent as any)!.args.encodedScore;
      expect(await debugDecryptUint64(scoreHandle)).to.equal(32n);
    });

    it("computes correct dot product via encrypted chunks after authorizing the engine", async function () {
      const [signer] = await ethers.getSigners();
      const Marketplace = await ethers.getContractFactory("ModelMarketplace");
      const marketplace = await Marketplace.deploy();
      const mpAddr = await marketplace.getAddress();

      const modelId = await marketplace.createModelShell.staticCall(
        true, 3n, 2n, "ipfs://private-manifest",
        ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
      );
      await marketplace.createModelShell(
        true, 3n, 2n, "ipfs://private-manifest",
        ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
      );

      const wEnc1 = await encryptUint64Array(mpAddr, signer.address, [2n, 3n]);
      await marketplace.appendEncryptedModelChunk(modelId, wEnc1.handles, wEnc1.inputProof);

      const wEnc2 = await encryptUint64Array(mpAddr, signer.address, [4n]);
      await marketplace.appendEncryptedModelChunk(modelId, wEnc2.handles, wEnc2.inputProof);

      const Registry = await ethers.getContractFactory("GenomicRegistry");
      const registry = await Registry.deploy();
      const sampleId = await registry.registerSample.staticCall("ipfs://sample");
      await registry.registerSample("ipfs://sample");

      const Engine = await ethers.getContractFactory("PRSComputeEngine");
      const engine = await Engine.deploy(mpAddr, await registry.getAddress());
      const engineAddr = await engine.getAddress();
      await marketplace.setPrivateModelReader(modelId, engineAddr, true);
      await marketplace.finalizeModel(modelId);

      const snps = [5n, 6n, 7n];
      const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
      await engine.createPRSJob(modelId, sampleId);
      for (const chunk of chunkArray(snps, 2)) {
        const enc = await encryptUint64Array(engineAddr, signer.address, chunk);
        await engine.appendSnpChunk(jobId, enc.handles, enc.inputProof);
      }
      await engine.finalizeSnpUpload(jobId);

      await engine.computeChunk(jobId);
      const partialHandle = await engine.getPartialSum(jobId);
      expect(await debugDecryptUint64(partialHandle)).to.equal(28n);

      await engine.computeChunk(jobId);
      const tx2 = await engine.finalize(jobId);
      const receipt2 = await tx2.wait();
      const finalEvent = receipt2!.logs.find(
        (log: any) => engine.interface.parseLog(log)?.name === "JobFinalized"
      );
      const scoreHandle = engine.interface.parseLog(finalEvent as any)!.args.encodedScore;
      expect(await debugDecryptUint64(scoreHandle)).to.equal(56n);
    });
  });

  describe("ResultOracle classification", function () {
    async function deployOracle() {
      const Oracle = await ethers.getContractFactory("ResultOracle");
      return Oracle.deploy();
    }

    async function classifyWithEncryption(
      oracle: Awaited<ReturnType<typeof deployOracle>>,
      score: bigint,
      noise: bigint,
      lowThreshold: bigint,
      highThreshold: bigint
    ) {
      const [signer] = await ethers.getSigners();
      const oracleAddr = await oracle.getAddress();

      // Encrypt score and noise in one batch
      const enc = await encryptUint64Array(oracleAddr, signer.address, [score, noise]);
      const tx = await oracle.classify(
        enc.handles[0], enc.handles[1], enc.inputProof, lowThreshold, highThreshold
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (log: any) => oracle.interface.parseLog(log)?.name === "ResultClassified"
      );
      const categoryHandle = oracle.interface.parseLog(event as any)!.args.category;
      return debugDecryptUint8(categoryHandle);
    }

    // low=10, high=20, noise=0 for all cases
    it("classifies score below low threshold as Low (0)", async function () {
      const oracle = await deployOracle();
      const category = await classifyWithEncryption(oracle, 5n, 0n, 10n, 20n);
      expect(category).to.equal(0n); // Low
    });

    it("classifies score between thresholds as Medium (1)", async function () {
      const oracle = await deployOracle();
      const category = await classifyWithEncryption(oracle, 15n, 0n, 10n, 20n);
      expect(category).to.equal(1n); // Medium
    });

    it("classifies score above high threshold as High (2)", async function () {
      const oracle = await deployOracle();
      const category = await classifyWithEncryption(oracle, 32n, 0n, 10n, 20n);
      expect(category).to.equal(2n); // High
    });

    it("noise shifts score into next bucket", async function () {
      const oracle = await deployOracle();
      // score=8 + noise=5 = 13, which is between 10 and 20 → Medium
      const category = await classifyWithEncryption(oracle, 8n, 5n, 10n, 20n);
      expect(category).to.equal(1n); // Medium
    });
  });
});
