import { expect } from "chai";
import { ethers, network } from "hardhat";
import { encryptUint64Array } from "./utils/fhevm-helpers";

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += chunkSize) {
    chunks.push(values.slice(start, start + chunkSize));
  }
  return chunks;
}

const NOISE_BOUND = 128n; // 2^7 — smallest valid power-of-two bound
const LOW_THRESHOLD = 0n;
const HIGH_THRESHOLD = 1_000_000n; // gap >> NOISE_BOUND

/**
 * Full stack: marketplace + registry + engine + oracle.
 * Public model with weights=[1,2], uploadChunkSize=2, computeChunkSize=2.
 */
async function deployFullStack() {
  const [owner, other] = await ethers.getSigners();

  const Marketplace = await ethers.getContractFactory("ModelMarketplace");
  const marketplace = await Marketplace.deploy();

  const modelId = await marketplace.createModelShell.staticCall(
    false, 2n, 2n, 2n, "ipfs://model",
    ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
  );
  await marketplace.createModelShell(
    false, 2n, 2n, 2n, "ipfs://model",
    ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
  );
  await marketplace.appendPublicModelChunk(modelId, [1n, 2n]);
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

  const Oracle = await ethers.getContractFactory("ResultOracle");
  const oracle = await Oracle.deploy(NOISE_BOUND);

  return { marketplace, registry, engine, oracle, modelId, sampleId, owner, other };
}

/** Run a complete streaming-path job and return its jobId. */
async function runCompleteJob(
  engine: any,
  modelId: bigint,
  sampleId: bigint,
  snps: bigint[],
  computeChunkSize: number,
  signer: any
) {
  const engineAddr = await engine.getAddress();
  const jobId = await engine.connect(signer).createPRSJob.staticCall(modelId, sampleId);
  await engine.connect(signer).createPRSJob(modelId, sampleId);

  for (const chunk of chunkArray(snps, computeChunkSize)) {
    const enc = await encryptUint64Array(engineAddr, signer.address, chunk);
    await engine.connect(signer).appendAndComputeChunk(jobId, enc.handles, enc.inputProof);
  }
  return jobId;
}

// ---------------------------------------------------------------------------
// Oracle Approval — finalizeAndClassify validation
// ---------------------------------------------------------------------------

describe("Oracle approval — finalizeAndClassify oracle validation", function () {
  it("passes when oracleRequired is false, regardless of approved oracle", async function () {
    const { engine, oracle, modelId, sampleId, owner } = await deployFullStack();
    // oracleRequired defaults to false — any oracle (or no approved oracle) is fine
    const jobId = await runCompleteJob(engine, modelId, sampleId, [1n, 1n], 2, owner);
    const oracleAddr = await oracle.getAddress();

    await expect(
      engine.finalizeAndClassify(jobId, oracleAddr, LOW_THRESHOLD, HIGH_THRESHOLD)
    ).to.not.be.reverted;
  });

  it("rejects finalizeAndClassify when oracleRequired but no approved oracle set", async function () {
    const { marketplace, engine, oracle, modelId, sampleId, owner } =
      await deployFullStack();

    await marketplace.setOracleRequired(modelId, true);
    // No setApprovedOracle call — approved oracle is address(0)

    const jobId = await runCompleteJob(engine, modelId, sampleId, [1n, 1n], 2, owner);
    const oracleAddr = await oracle.getAddress();

    await expect(
      engine.finalizeAndClassify(jobId, oracleAddr, LOW_THRESHOLD, HIGH_THRESHOLD)
    ).to.be.revertedWith("No approved oracle set for model");
  });

  it("rejects finalizeAndClassify when oracle does not match approved oracle", async function () {
    const { marketplace, engine, oracle, modelId, sampleId, owner, other } =
      await deployFullStack();

    await marketplace.setOracleRequired(modelId, true);
    await marketplace.setApprovedOracle(modelId, await oracle.getAddress());

    const jobId = await runCompleteJob(engine, modelId, sampleId, [1n, 1n], 2, owner);

    // Pass a different (non-approved) address — use `other` as a stand-in
    await expect(
      engine.finalizeAndClassify(jobId, other.address, LOW_THRESHOLD, HIGH_THRESHOLD)
    ).to.be.revertedWith("Oracle not approved for model");
  });

  it("accepts finalizeAndClassify when oracle matches approved oracle", async function () {
    const { marketplace, engine, oracle, modelId, sampleId, owner } =
      await deployFullStack();

    const oracleAddr = await oracle.getAddress();
    await marketplace.setOracleRequired(modelId, true);
    await marketplace.setApprovedOracle(modelId, oracleAddr);

    const jobId = await runCompleteJob(engine, modelId, sampleId, [1n, 1n], 2, owner);

    await expect(
      engine.finalizeAndClassify(jobId, oracleAddr, LOW_THRESHOLD, HIGH_THRESHOLD)
    ).to.not.be.reverted;
  });

  it("getApprovedOracle returns address(0) when not set", async function () {
    const { marketplace, modelId } = await deployFullStack();
    expect(await marketplace.getApprovedOracle(modelId)).to.equal(ethers.ZeroAddress);
  });

  it("setApprovedOracle rejects non-owner", async function () {
    const { marketplace, oracle, modelId, other } = await deployFullStack();
    await expect(
      marketplace.connect(other).setApprovedOracle(modelId, await oracle.getAddress())
    ).to.be.revertedWith("Not owner");
  });
});

// ---------------------------------------------------------------------------
// Double-finalize prevention
// ---------------------------------------------------------------------------

describe("Double-finalize prevention", function () {
  it("rejects a second call to finalize()", async function () {
    const { engine, modelId, sampleId, owner } = await deployFullStack();
    const jobId = await runCompleteJob(engine, modelId, sampleId, [1n, 1n], 2, owner);

    await engine.finalize(jobId);
    await expect(engine.finalize(jobId)).to.be.revertedWith("Job already finalized");
  });

  it("rejects a second call to finalizeTo()", async function () {
    const { engine, modelId, sampleId, owner, other } = await deployFullStack();
    const jobId = await runCompleteJob(engine, modelId, sampleId, [1n, 1n], 2, owner);

    await engine.finalizeTo(jobId, other.address);
    await expect(engine.finalizeTo(jobId, other.address)).to.be.revertedWith(
      "Job already finalized"
    );
  });

  it("rejects a second call to finalizeAndClassify()", async function () {
    const { engine, oracle, modelId, sampleId, owner } = await deployFullStack();
    const oracleAddr = await oracle.getAddress();
    const jobId = await runCompleteJob(engine, modelId, sampleId, [1n, 1n], 2, owner);

    await engine.finalizeAndClassify(jobId, oracleAddr, LOW_THRESHOLD, HIGH_THRESHOLD);
    await expect(
      engine.finalizeAndClassify(jobId, oracleAddr, LOW_THRESHOLD, HIGH_THRESHOLD)
    ).to.be.revertedWith("Job already finalized");
  });

  it("isJobFinalized() reflects state correctly", async function () {
    const { engine, modelId, sampleId, owner } = await deployFullStack();
    const jobId = await runCompleteJob(engine, modelId, sampleId, [1n, 1n], 2, owner);

    expect(await engine.isJobFinalized(jobId)).to.be.false;
    await engine.finalize(jobId);
    expect(await engine.isJobFinalized(jobId)).to.be.true;
  });
});

// ---------------------------------------------------------------------------
// Job cancellation
// ---------------------------------------------------------------------------

describe("Job cancellation", function () {
  it("allows requester to cancel an incomplete job", async function () {
    const { engine, modelId, sampleId, owner } = await deployFullStack();
    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);

    await expect(engine.cancelJob(jobId)).to.emit(engine, "JobCancelled");
    expect(await engine.isJobCancelled(jobId)).to.be.true;
  });

  it("blocks appendSnpChunk after cancellation", async function () {
    const { engine, modelId, sampleId, owner } = await deployFullStack();
    const engineAddr = await engine.getAddress();
    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);
    await engine.cancelJob(jobId);

    const enc = await encryptUint64Array(engineAddr, owner.address, [1n, 2n]);
    await expect(
      engine.appendSnpChunk(jobId, enc.handles, enc.inputProof)
    ).to.be.revertedWith("Job cancelled");
  });

  it("blocks appendAndComputeChunk after cancellation", async function () {
    const { engine, modelId, sampleId, owner } = await deployFullStack();
    const engineAddr = await engine.getAddress();
    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);
    await engine.cancelJob(jobId);

    const enc = await encryptUint64Array(engineAddr, owner.address, [1n, 2n]);
    await expect(
      engine.appendAndComputeChunk(jobId, enc.handles, enc.inputProof)
    ).to.be.revertedWith("Job cancelled");
  });

  it("cannot cancel a job twice", async function () {
    const { engine, modelId, sampleId } = await deployFullStack();
    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);
    await engine.cancelJob(jobId);

    await expect(engine.cancelJob(jobId)).to.be.revertedWith("Already cancelled");
  });

  it("cannot cancel a completed job", async function () {
    const { engine, modelId, sampleId, owner } = await deployFullStack();
    const jobId = await runCompleteJob(engine, modelId, sampleId, [1n, 1n], 2, owner);

    await expect(engine.cancelJob(jobId)).to.be.revertedWith("Job already complete");
  });

  it("non-requester cannot cancel", async function () {
    const { engine, modelId, sampleId, other } = await deployFullStack();
    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);

    await expect(engine.connect(other).cancelJob(jobId)).to.be.revertedWith(
      "Not requester"
    );
  });

  it("refunds rate limit slot when cancelled within the active window", async function () {
    const { marketplace, engine, modelId, sampleId } = await deployFullStack();

    // 1 job per 1000-block window
    await marketplace.setRateLimit(modelId, 1n, 1000n);

    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);

    // Second job should be blocked
    await expect(engine.createPRSJob(modelId, sampleId)).to.be.revertedWith(
      "Rate limit exceeded"
    );

    // Cancel the first job — slot is refunded
    await engine.cancelJob(jobId);

    // Now the second job can be created
    await expect(engine.createPRSJob(modelId, sampleId)).to.not.be.reverted;
  });

  it("does not refund rate limit slot after the window has expired", async function () {
    const { marketplace, engine, modelId, sampleId } = await deployFullStack();

    await marketplace.setRateLimit(modelId, 1n, 10n);

    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);

    // Advance past window expiry
    await network.provider.send("hardhat_mine", ["0x10"]);

    // Cancel after window — refund branch is skipped (window already expired)
    await engine.cancelJob(jobId);

    // New window starts on next createPRSJob anyway — so this should succeed
    await expect(engine.createPRSJob(modelId, sampleId)).to.not.be.reverted;
  });
});
