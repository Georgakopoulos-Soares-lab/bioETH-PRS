import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  encryptUint64Array,
  debugDecryptUint64,
  debugDecryptUint8,
} from "./utils/fhevm-helpers";

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += chunkSize) {
    chunks.push(values.slice(start, start + chunkSize));
  }
  return chunks;
}

/**
 * Deploy a public model + engine + registry stack for testing.
 * Returns all contracts and IDs needed for job creation.
 */
async function deployStack(
  weights: bigint[],
  uploadChunkSize: bigint,
  computeChunkSize: bigint
) {
  const [owner] = await ethers.getSigners();
  const Marketplace = await ethers.getContractFactory("ModelMarketplace");
  const marketplace = await Marketplace.deploy();
  const modelId = await marketplace.createModelShell.staticCall(
    false,
    BigInt(weights.length),
    uploadChunkSize,
    computeChunkSize,
    "ipfs://model",
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
    "ipfs://model",
    ethers.ZeroHash,
    ethers.ZeroHash,
    0n,
    0n
  );
  for (const chunk of chunkArray(weights, Number(uploadChunkSize))) {
    await marketplace.appendPublicModelChunk(modelId, chunk);
  }
  await marketplace.finalizeModel(modelId);

  const Registry = await ethers.getContractFactory("GenomicRegistry");
  const registry = await Registry.deploy();
  const sampleId = await registry.registerSample.staticCall("ipfs://sample");
  await registry.registerSample("ipfs://sample");

  const Engine = await ethers.getContractFactory("PRSComputeEngine");
  const engine = await Engine.deploy(
    await marketplace.getAddress(),
    await registry.getAddress()
  );

  return { marketplace, registry, engine, modelId, sampleId, owner };
}

/**
 * Run a complete job (streaming path) and return the completed jobId.
 */
async function runCompleteJob(
  engine: any,
  marketplace: any,
  modelId: bigint,
  sampleId: bigint,
  snps: bigint[],
  computeChunkSize: number,
  signer: any
) {
  const engineAddr = await engine.getAddress();
  const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
  await engine.createPRSJob(modelId, sampleId);

  for (const chunk of chunkArray(snps, computeChunkSize)) {
    const enc = await encryptUint64Array(
      engineAddr,
      signer.address,
      chunk
    );
    await engine.appendAndComputeChunk(jobId, enc.handles, enc.inputProof);
  }
  return jobId;
}

// ---------- Rate Limiting Tests ----------

describe("Rate Limiting — per-model per-wallet job limits", function () {
  it("default (no rate limit) allows unlimited job creation", async function () {
    const { engine, modelId, sampleId } = await deployStack(
      [1n, 2n],
      2n,
      2n
    );
    // Create 5 jobs with no rate limit set — all should succeed
    for (let i = 0; i < 5; i++) {
      await engine.createPRSJob(modelId, sampleId);
    }
    expect(await engine.jobCount()).to.equal(5n);
  });

  it("blocks job creation when window is exhausted", async function () {
    const { marketplace, engine, modelId, sampleId } = await deployStack(
      [1n, 2n],
      2n,
      2n
    );
    // Allow 2 jobs per 1000-block window
    await marketplace.setRateLimit(modelId, 2n, 1000n);

    await engine.createPRSJob(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);
    // Third job should be blocked
    await expect(engine.createPRSJob(modelId, sampleId)).to.be.revertedWith(
      "Rate limit exceeded"
    );
  });

  it("resets window after windowBlocks elapse", async function () {
    const { marketplace, engine, modelId, sampleId } = await deployStack(
      [1n, 2n],
      2n,
      2n
    );
    await marketplace.setRateLimit(modelId, 1n, 10n);

    await engine.createPRSJob(modelId, sampleId);
    await expect(engine.createPRSJob(modelId, sampleId)).to.be.revertedWith(
      "Rate limit exceeded"
    );

    // Mine enough blocks to expire the window
    await network.provider.send("hardhat_mine", ["0xA"]); // 10 blocks
    // Should succeed now — new window
    await engine.createPRSJob(modelId, sampleId);
    expect(await engine.jobCount()).to.equal(2n);
  });

  it("rate limits are independent across models", async function () {
    const [owner] = await ethers.getSigners();
    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Marketplace.deploy();

    // Create two models
    await marketplace.createModelShell(
      false, 2n, 2n, 2n, "ipfs://m1",
      ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
    );
    await marketplace.appendPublicModelChunk(0n, [1n, 2n]);
    await marketplace.finalizeModel(0n);

    await marketplace.createModelShell(
      false, 2n, 2n, 2n, "ipfs://m2",
      ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
    );
    await marketplace.appendPublicModelChunk(1n, [3n, 4n]);
    await marketplace.finalizeModel(1n);

    // Rate limit only model 0
    await marketplace.setRateLimit(0n, 1n, 1000n);

    const Registry = await ethers.getContractFactory("GenomicRegistry");
    const registry = await Registry.deploy();
    await registry.registerSample("ipfs://sample");

    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Engine.deploy(
      await marketplace.getAddress(),
      await registry.getAddress()
    );

    // Model 0: one job succeeds, second blocked
    await engine.createPRSJob(0n, 0n);
    await expect(engine.createPRSJob(0n, 0n)).to.be.revertedWith(
      "Rate limit exceeded"
    );

    // Model 1: unlimited — should succeed
    await engine.createPRSJob(1n, 0n);
    await engine.createPRSJob(1n, 0n);
  });

  it("rate limits are independent across requesters", async function () {
    const [owner, researcher] = await ethers.getSigners();
    const { marketplace, registry, engine, modelId, sampleId } =
      await deployStack([1n, 2n], 2n, 2n);

    await marketplace.setRateLimit(modelId, 1n, 1000n);
    // Grant researcher access to sample
    await registry.grantAccess(sampleId, researcher.address);

    // Owner uses their one slot
    await engine.createPRSJob(modelId, sampleId);
    await expect(engine.createPRSJob(modelId, sampleId)).to.be.revertedWith(
      "Rate limit exceeded"
    );

    // Researcher has their own independent window
    await engine.connect(researcher).createPRSJob(modelId, sampleId);
    await expect(
      engine.connect(researcher).createPRSJob(modelId, sampleId)
    ).to.be.revertedWith("Rate limit exceeded");
  });

  it("model owner can change rate limit at any time", async function () {
    const { marketplace, engine, modelId, sampleId } = await deployStack(
      [1n, 2n],
      2n,
      2n
    );
    // Start with limit of 1
    await marketplace.setRateLimit(modelId, 1n, 1000n);
    await engine.createPRSJob(modelId, sampleId);
    await expect(engine.createPRSJob(modelId, sampleId)).to.be.revertedWith(
      "Rate limit exceeded"
    );

    // Loosen to 5 — new window starts on next job
    await marketplace.setRateLimit(modelId, 5n, 1000n);
    // Mine a block to advance past the old window
    await network.provider.send("hardhat_mine", ["0x3E8"]); // 1000 blocks
    await engine.createPRSJob(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);
  });

  it("only model owner can set rate limit", async function () {
    const [, stranger] = await ethers.getSigners();
    const { marketplace, modelId } = await deployStack([1n, 2n], 2n, 2n);

    await expect(
      marketplace.connect(stranger).setRateLimit(modelId, 1n, 100n)
    ).to.be.revertedWith("Not owner");
  });

  it("rejects windowBlocks=0 when maxJobs > 0", async function () {
    const { marketplace, modelId } = await deployStack([1n, 2n], 2n, 2n);

    await expect(
      marketplace.setRateLimit(modelId, 5n, 0n)
    ).to.be.revertedWith("Window must be > 0 when limit is set");
  });

  it("emits RateLimitSet event", async function () {
    const { marketplace, modelId } = await deployStack([1n, 2n], 2n, 2n);

    await expect(marketplace.setRateLimit(modelId, 3n, 500n))
      .to.emit(marketplace, "RateLimitSet")
      .withArgs(modelId, 3n, 500n);
  });

  it("getRateLimitConfig returns defaults for unconfigured models", async function () {
    const { marketplace, modelId } = await deployStack([1n, 2n], 2n, 2n);

    const [maxJobs, windowBlocks] =
      await marketplace.getRateLimitConfig(modelId);
    expect(maxJobs).to.equal(0n);
    expect(windowBlocks).to.equal(0n);
  });
});

// ---------- DP Hardening Tests — Oracle-Required Mode ----------

describe("DP Hardening — oracle-required mode", function () {
  it("finalize() works when oracleRequired is false (default)", async function () {
    const [signer] = await ethers.getSigners();
    const { marketplace, engine, modelId, sampleId } = await deployStack(
      [1n, 2n],
      2n,
      2n
    );

    const jobId = await runCompleteJob(
      engine, marketplace, modelId, sampleId,
      [4n, 5n], 2, signer
    );
    // Should succeed — default is oracleRequired=false
    await engine.finalize(jobId);
  });

  it("finalize() reverts when oracleRequired is true", async function () {
    const [signer] = await ethers.getSigners();
    const { marketplace, engine, modelId, sampleId } = await deployStack(
      [1n, 2n],
      2n,
      2n
    );

    await marketplace.setOracleRequired(modelId, true);

    const jobId = await runCompleteJob(
      engine, marketplace, modelId, sampleId,
      [4n, 5n], 2, signer
    );
    await expect(engine.finalize(jobId)).to.be.revertedWith(
      "Model requires oracle finalization"
    );
  });

  it("finalizeTo() reverts when oracleRequired is true", async function () {
    const [signer, grantee] = await ethers.getSigners();
    const { marketplace, engine, modelId, sampleId } = await deployStack(
      [1n, 2n],
      2n,
      2n
    );

    await marketplace.setOracleRequired(modelId, true);

    const jobId = await runCompleteJob(
      engine, marketplace, modelId, sampleId,
      [4n, 5n], 2, signer
    );
    await expect(
      engine.finalizeTo(jobId, grantee.address)
    ).to.be.revertedWith("Model requires oracle finalization");
  });

  it("readPartial() reverts when oracleRequired is true", async function () {
    const [signer] = await ethers.getSigners();
    const { marketplace, engine, modelId, sampleId } = await deployStack(
      [1n, 2n],
      2n,
      2n
    );

    await marketplace.setOracleRequired(modelId, true);

    // Create job and compute one chunk (not complete yet)
    const engineAddr = await engine.getAddress();
    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);
    const enc = await encryptUint64Array(engineAddr, signer.address, [4n, 5n]);
    await engine.appendAndComputeChunk(jobId, enc.handles, enc.inputProof);

    await expect(engine.readPartial(jobId)).to.be.revertedWith(
      "Model requires oracle finalization"
    );
  });

  it("finalizeAndClassify() works when oracleRequired is true", async function () {
    const [signer] = await ethers.getSigners();
    const { marketplace, engine, modelId, sampleId } = await deployStack(
      [1n, 2n],
      2n,
      2n
    );

    await marketplace.setOracleRequired(modelId, true);

    // Deploy oracle with noise bound 128
    const Oracle = await ethers.getContractFactory("ResultOracle");
    const oracle = await Oracle.deploy(128n);
    const oracleAddr = await oracle.getAddress();

    const jobId = await runCompleteJob(
      engine, marketplace, modelId, sampleId,
      [4n, 5n], 2, signer
    );

    // expected raw: 4*1 + 5*2 = 14 (no quantization correction in this test)
    // finalizeAndClassify should work — it's the oracle path
    // Use thresholds that respect the noise bound gap (>= 128)
    const noiseBias = await oracle.expectedNoiseBias();
    const low = 10n + noiseBias; // 10 + 64 = 74
    const high = low + 128n; // 74 + 128 = 202
    const tx = await engine.finalizeAndClassify(jobId, oracleAddr, low, high);
    const receipt = await tx.wait();

    // Verify we got a classified result (euint8 event)
    const oracleEvent = receipt!.logs.find((log: any) => {
      try {
        return oracle.interface.parseLog(log)?.name === "ResultClassified";
      } catch {
        return false;
      }
    });
    expect(oracleEvent).to.not.be.undefined;
  });

  it("only model owner can set oracleRequired", async function () {
    const [, stranger] = await ethers.getSigners();
    const { marketplace, modelId } = await deployStack([1n, 2n], 2n, 2n);

    await expect(
      marketplace.connect(stranger).setOracleRequired(modelId, true)
    ).to.be.revertedWith("Not owner");
  });

  it("emits OracleRequirementSet event", async function () {
    const { marketplace, modelId } = await deployStack([1n, 2n], 2n, 2n);

    await expect(marketplace.setOracleRequired(modelId, true))
      .to.emit(marketplace, "OracleRequirementSet")
      .withArgs(modelId, true);
  });

  it("isOracleRequired returns false by default", async function () {
    const { marketplace, modelId } = await deployStack([1n, 2n], 2n, 2n);
    expect(await marketplace.isOracleRequired(modelId)).to.equal(false);
  });
});

// ---------- DP Hardening Tests — Minimum Threshold Gap ----------

describe("DP Hardening — minimum threshold gap", function () {
  it("rejects threshold gap smaller than noiseUpperBound", async function () {
    const [signer] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("ResultOracle");
    const oracle = await Oracle.deploy(128n); // noiseUpperBound = 128
    const oracleAddr = await oracle.getAddress();

    // Encrypt a dummy score
    const enc = await encryptUint64Array(oracleAddr, signer.address, [500n]);
    // Gap = 100 - 50 = 50, which is < 128
    await expect(
      oracle.classify(enc.handles[0], enc.inputProof, 50n, 100n)
    ).to.be.revertedWith("Threshold gap must be >= noise bound");
  });

  it("accepts threshold gap exactly equal to noiseUpperBound", async function () {
    const [signer] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("ResultOracle");
    const oracle = await Oracle.deploy(128n);
    const oracleAddr = await oracle.getAddress();

    const enc = await encryptUint64Array(oracleAddr, signer.address, [500n]);
    // Gap = 228 - 100 = 128, which is == noiseUpperBound — should succeed
    await oracle.classify(enc.handles[0], enc.inputProof, 100n, 228n);
  });

  it("accepts threshold gap larger than noiseUpperBound", async function () {
    const [signer] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("ResultOracle");
    const oracle = await Oracle.deploy(128n);
    const oracleAddr = await oracle.getAddress();

    const enc = await encryptUint64Array(oracleAddr, signer.address, [500n]);
    // Gap = 1000 - 100 = 900, which is >> noiseUpperBound
    await oracle.classify(enc.handles[0], enc.inputProof, 100n, 1000n);
  });

  it("threshold gap check also applies via classify with different noise bound", async function () {
    const [signer] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("ResultOracle");
    const oracle = await Oracle.deploy(256n); // noiseUpperBound = 256
    const oracleAddr = await oracle.getAddress();

    const enc = await encryptUint64Array(oracleAddr, signer.address, [500n]);
    // Gap = 200 - 100 = 100, which is < 256
    await expect(
      oracle.classify(enc.handles[0], enc.inputProof, 100n, 200n)
    ).to.be.revertedWith("Threshold gap must be >= noise bound");
  });
});
