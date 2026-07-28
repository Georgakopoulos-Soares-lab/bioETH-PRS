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
 *
 * The oracle is deployed BEFORE the model is finalized, because a release policy
 * names its oracle and can only be set while the model is still a draft
 * (R1.4-C1).  Ordering the deployment any other way makes the policy unsettable.
 *
 * @param configurePolicy  set a release policy before finalizing (default true).
 *                         Pass false to build a model with no protected
 *                         classification path at all.
 * @param requireOracle    value of the policy's oracleRequired flag.
 */
async function deployFullStack(
  { configurePolicy = true, requireOracle = false } = {}
) {
  const [owner, other] = await ethers.getSigners();

  const Oracle = await ethers.getContractFactory("ResultOracle");
  const oracle = await Oracle.deploy(NOISE_BOUND);
  const oracleAddr = await oracle.getAddress();

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

  // Draft-only window: after finalizeModel the policy is immutable.
  if (configurePolicy) {
    await marketplace.setReleasePolicy(
      modelId, oracleAddr, LOW_THRESHOLD, HIGH_THRESHOLD, requireOracle
    );
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

// R1.4-C1 / R1.4-T1. The requester no longer chooses the oracle or the
// classification thresholds; both come from an immutable per-model release policy.
// These tests exist to prove the adaptive threshold-shifting channel is closed by
// construction rather than by convention.
describe("Release policy — model-defined thresholds and oracle", function () {
  it("finalizeAndClassify succeeds using the model's policy, with no release arguments", async function () {
    const { engine, modelId, sampleId, owner } = await deployFullStack();
    const jobId = await runCompleteJob(engine, modelId, sampleId, [1n, 1n], 2, owner);

    await expect(engine.finalizeAndClassify(jobId)).to.not.be.reverted;
  });

  it("finalizeAndClassify works identically when the policy mandates the oracle path", async function () {
    const { engine, modelId, sampleId, owner } =
      await deployFullStack({ requireOracle: true });
    const jobId = await runCompleteJob(engine, modelId, sampleId, [1n, 1n], 2, owner);

    await expect(engine.finalizeAndClassify(jobId)).to.not.be.reverted;
  });

  it("finalizeAndClassify reverts when the model has no release policy", async function () {
    const { engine, modelId, sampleId, owner } =
      await deployFullStack({ configurePolicy: false });
    const jobId = await runCompleteJob(engine, modelId, sampleId, [1n, 1n], 2, owner);

    await expect(engine.finalizeAndClassify(jobId)).to.be.revertedWith(
      "Model has no release policy"
    );
  });

  // The central R1.4-T1 assertion: requester-supplied thresholds are not merely
  // rejected at runtime, they are absent from the interface. There is no argument to
  // shift, so a threshold-shifting binary search on the encrypted score cannot be
  // expressed against this contract at all.
  it("R1.4-T1: no protected classification entry point accepts requester thresholds", async function () {
    const { engine, marketplace } = await deployFullStack();

    const overloads = engine.interface.fragments.filter(
      (f: any) => f.type === "function" && f.name === "finalizeAndClassify"
    );
    expect(overloads, "exactly one finalizeAndClassify overload").to.have.lengthOf(1);

    const frag = engine.interface.getFunction("finalizeAndClassify");
    expect(frag!.inputs).to.have.lengthOf(1);
    expect(frag!.inputs[0].name).to.equal("jobId");

    // No entry point anywhere on the engine takes a threshold.
    const thresholdTakers = engine.interface.fragments.filter(
      (f: any) =>
        f.type === "function" &&
        (f.inputs ?? []).some((i: any) => /threshold/i.test(i.name ?? ""))
    );
    expect(thresholdTakers, "engine functions accepting a threshold").to.have.lengthOf(0);

    // The superseded mutable setters are gone, so a policy cannot be swapped after
    // a model starts serving jobs.
    for (const removed of ["setOracleRequired", "setApprovedOracle"]) {
      const present = marketplace.interface.fragments.some(
        (f: any) => f.type === "function" && f.name === removed
      );
      expect(present, `${removed} must no longer exist`).to.be.false;
    }
  });

  it("the policy is immutable once the model is finalized", async function () {
    const { marketplace, oracle, modelId } = await deployFullStack();

    await expect(
      marketplace.setReleasePolicy(
        modelId, await oracle.getAddress(), 0n, 5_000_000n, true
      )
    ).to.be.revertedWith("Model already finalized");
  });

  it("setReleasePolicy rejects a non-owner", async function () {
    const Oracle = await ethers.getContractFactory("ResultOracle");
    const oracle = await Oracle.deploy(NOISE_BOUND);
    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Marketplace.deploy();
    const [, other] = await ethers.getSigners();

    const modelId = await marketplace.createModelShell.staticCall(
      false, 2n, 2n, 2n, "ipfs://m", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
    );
    await marketplace.createModelShell(
      false, 2n, 2n, 2n, "ipfs://m", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
    );

    await expect(
      marketplace.connect(other).setReleasePolicy(
        modelId, await oracle.getAddress(), LOW_THRESHOLD, HIGH_THRESHOLD, false
      )
    ).to.be.revertedWith("Not owner");
  });

  it("setReleasePolicy validates the oracle and the thresholds at configuration time", async function () {
    const Oracle = await ethers.getContractFactory("ResultOracle");
    const oracle = await Oracle.deploy(NOISE_BOUND);
    const oracleAddr = await oracle.getAddress();
    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Marketplace.deploy();

    const modelId = await marketplace.createModelShell.staticCall(
      false, 2n, 2n, 2n, "ipfs://m", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
    );
    await marketplace.createModelShell(
      false, 2n, 2n, 2n, "ipfs://m", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
    );

    await expect(
      marketplace.setReleasePolicy(modelId, ethers.ZeroAddress, 0n, 1_000n, false)
    ).to.be.revertedWith("Invalid oracle");

    await expect(
      marketplace.setReleasePolicy(modelId, oracleAddr, 500n, 100n, false)
    ).to.be.revertedWith("lowThreshold must be less than highThreshold");

    await expect(
      marketplace.setReleasePolicy(modelId, oracleAddr, 200n, 200n, false)
    ).to.be.revertedWith("lowThreshold must be less than highThreshold");

    // Gap smaller than the oracle's own noise bound is caught here rather than on
    // first use, so a model cannot be published with a policy that always reverts.
    await expect(
      marketplace.setReleasePolicy(
        modelId, oracleAddr, 0n, NOISE_BOUND - 1n, false
      )
    ).to.be.revertedWith("Threshold gap must be >= noise bound");

    // Gap exactly equal to the bound is the documented minimum and is accepted.
    await expect(
      marketplace.setReleasePolicy(modelId, oracleAddr, 0n, NOISE_BOUND, false)
    ).to.not.be.reverted;
  });

  it("getReleasePolicy reports the fixed policy and getApprovedOracle mirrors it", async function () {
    const { marketplace, oracle, modelId } =
      await deployFullStack({ requireOracle: true });
    const oracleAddr = await oracle.getAddress();

    const [addr, low, high, requiresOracle, configured] =
      await marketplace.getReleasePolicy(modelId);

    expect(addr).to.equal(oracleAddr);
    expect(low).to.equal(LOW_THRESHOLD);
    expect(high).to.equal(HIGH_THRESHOLD);
    expect(requiresOracle).to.be.true;
    expect(configured).to.be.true;

    expect(await marketplace.getApprovedOracle(modelId)).to.equal(oracleAddr);
    expect(await marketplace.isOracleRequired(modelId)).to.be.true;
  });

  it("an unconfigured model reports an empty policy", async function () {
    const { marketplace, modelId } = await deployFullStack({ configurePolicy: false });

    const [addr, low, high, requiresOracle, configured] =
      await marketplace.getReleasePolicy(modelId);

    expect(addr).to.equal(ethers.ZeroAddress);
    expect(low).to.equal(0n);
    expect(high).to.equal(0n);
    expect(requiresOracle).to.be.false;
    expect(configured).to.be.false;
    expect(await marketplace.getApprovedOracle(modelId)).to.equal(ethers.ZeroAddress);
  });

  it("emits ReleasePolicySet", async function () {
    const Oracle = await ethers.getContractFactory("ResultOracle");
    const oracle = await Oracle.deploy(NOISE_BOUND);
    const oracleAddr = await oracle.getAddress();
    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Marketplace.deploy();

    const modelId = await marketplace.createModelShell.staticCall(
      false, 2n, 2n, 2n, "ipfs://m", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
    );
    await marketplace.createModelShell(
      false, 2n, 2n, 2n, "ipfs://m", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
    );

    await expect(
      marketplace.setReleasePolicy(
        modelId, oracleAddr, LOW_THRESHOLD, HIGH_THRESHOLD, true
      )
    )
      .to.emit(marketplace, "ReleasePolicySet")
      .withArgs(modelId, oracleAddr, LOW_THRESHOLD, HIGH_THRESHOLD, true);
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
    const { engine, modelId, sampleId, owner } = await deployFullStack();
    const jobId = await runCompleteJob(engine, modelId, sampleId, [1n, 1n], 2, owner);

    await engine.finalizeAndClassify(jobId);
    await expect(engine.finalizeAndClassify(jobId)).to.be.revertedWith(
      "Job already finalized"
    );
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
