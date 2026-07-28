import { ethers, fhevm } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { debugDecryptUint64, debugDecryptUint8 } from "../test/utils/fhevm-helpers";
import { loadHeprsFixture } from "../test/utils/heprs";
import {
  syntheticModelProvenance,
  buildProvenance,
  contractIdentity,
} from "./utils/provenance";

/**
 * Adversarial model-extraction evaluation (RTR action R1.4-E1).
 *
 * Reviewer 1, comment 4: the 2,800-hour extraction estimate "appears heuristic and does
 * not fully address adaptive querying, multiple-wallet attacks, threshold manipulation,
 * correlated SNP structure, or cross-sample probing."
 *
 * All five variations are evaluated here against REAL contracts on the mock coprocessor.
 * Nothing is simulated: every query below is an actual job — createPRSJob, one streaming
 * chunk, finalize or finalizeAndClassify — and every observation is a real decryption.
 *
 * THREAT MODEL. Extraction only threatens PRIVATE models. A public model's weights are
 * stored as plaintext `uint64` by design, so there is nothing to extract. Every arm here
 * therefore uses a private model with encrypted weights, and the attacker is an
 * authorised private-model reader: the model owner has called
 * `setPrivateModelReader(modelId, attacker, true)`. That is the realistic adversary — a
 * collaborator granted legitimate access — and it is also the strongest one, since an
 * unauthorised wallet cannot create a job against a private model at all.
 *
 * WHAT THE ATTACKER KNOWS. Everything in the public model header: N, the scale, the
 * weight zero-point z_w, and the score offset z_s. Each query therefore yields a linear
 * constraint on the hidden shifted weights u:
 *
 *     e(g) = sum_i g_i u_i + z_s - z_w * G,     G = sum_i g_i
 *
 * WHAT THE ATTACKER MAY SUBMIT. Arbitrary dosage vectors, including values outside
 * {0,1,2}. The contracts do not validate inputs — that is the trust boundary recorded by
 * R1.5-T1 — and this matters more than it first appears: see the correlated-SNP arm.
 *
 * SEPARATION OF CONCERNS. The extraction arms run with rate limiting DISABLED, so they
 * measure the INFORMATION cost of extraction in queries. The rate-limit arm then measures
 * how many queries a wallet or sample is permitted per window. Wall-clock cost is the
 * product of the two, stated with its assumptions, rather than a single unexplained
 * headline number. That is what replaces the 2,800-hour figure.
 *
 * Usage:
 *   npm run evaluate:anti-probing
 *   ATTACK_N=12 ATTACK_BUDGET=120 npm run evaluate:anti-probing   # faster
 */

const N = process.env.ATTACK_N ? Number(process.env.ATTACK_N) : 20;
const SCALE = 1_000_000;
const NOISE_BOUND = 128n;
// Per-weight query budget for the estimator-based arms.
const BUDGET_PER_WEIGHT = process.env.ATTACK_BUDGET
  ? Number(process.env.ATTACK_BUDGET) / N
  : 12;

const OUT_DIR = process.env.ATTACK_OUT_DIR
  ?? path.join(__dirname, "..", "evidence", "phase6");

// ---------------------------------------------------------------------------
// Model construction
// ---------------------------------------------------------------------------

/** Real GWAS effect sizes from the HEPRS fixture, so magnitudes are realistic. */
function realWeights(n: number): number[] {
  const { betas } = loadHeprsFixture(100);
  return betas.slice(1, n + 1); // skip the intercept column
}

function quantise(betas: number[], scale: number) {
  const q = betas.map((b) => Math.round(b * scale));
  const minQ = Math.min(...q);
  const weightZeroPoint = minQ < 0 ? BigInt(-minQ) : 0n;
  const rawMin = q.reduce((s, v) => s + 2 * Math.min(v, 0), 0);
  const scoreOffset = rawMin < 0 ? BigInt(-rawMin) : 0n;
  return {
    q,
    weightZeroPoint,
    scoreOffset,
    u: q.map((v) => BigInt(v) + weightZeroPoint), // hidden truth
  };
}

// ---------------------------------------------------------------------------
// Extraction quality metrics
// ---------------------------------------------------------------------------

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  if (saa === 0 || sbb === 0) return NaN;
  return sab / Math.sqrt(saa * sbb);
}

/** Extraction metrics against the true quantised weights q (signed, pre-shift). */
function score(truth: number[], estimate: number[], weightZeroPoint: bigint) {
  const zw = Number(weightZeroPoint);
  // Estimates are of the shifted u; convert back to signed q for sign accuracy.
  const estQ = estimate.map((v) => v - zw);
  const signAcc =
    truth.filter((t, i) => Math.sign(t) === Math.sign(estQ[i])).length / truth.length;
  const maxAbs = Math.max(...truth.map((t) => Math.abs(t)));
  const meanRelErr =
    truth.reduce((s, t, i) => s + Math.abs(t - estQ[i]), 0) / truth.length / maxAbs;
  return {
    pearsonR: Number(pearson(truth, estQ).toFixed(6)),
    signAccuracy: Number(signAcc.toFixed(4)),
    meanRelativeError: Number(meanRelErr.toFixed(6)),
    // Fraction of weights recovered to within the noise bound — the sharpest
    // statement of "did the attacker actually learn the weight".
    withinNoiseBound:
      Number(
        (truth.filter((t, i) => Math.abs(t - estQ[i]) <= Number(NOISE_BOUND)).length /
          truth.length).toFixed(4)
      ),
  };
}

// ---------------------------------------------------------------------------
// Probe generation
// ---------------------------------------------------------------------------

/** Deterministic PRNG so the whole evaluation is reproducible. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function unitProbe(n: number, j: number, dosage: bigint): bigint[] {
  const g = new Array<bigint>(n).fill(0n);
  g[j] = dosage;
  return g;
}

/** Independent probes: each position drawn freely from {0,1,2}. */
function independentProbe(n: number, rng: () => number): bigint[] {
  return Array.from({ length: n }, () => BigInt(Math.floor(rng() * 3)));
}

/**
 * Correlated probes: positions in linkage blocks share a dosage, mimicking LD.
 * The resulting design matrix is rank-deficient — only block sums are identifiable.
 */
function correlatedProbe(n: number, blockSize: number, rng: () => number): bigint[] {
  const g = new Array<bigint>(n).fill(0n);
  for (let start = 0; start < n; start += blockSize) {
    const d = BigInt(Math.floor(rng() * 3));
    for (let k = start; k < Math.min(start + blockSize, n); k++) g[k] = d;
  }
  return g;
}

// ---------------------------------------------------------------------------
// Least-squares estimator over interval constraints
// ---------------------------------------------------------------------------

/**
 * Estimate u from constraints of the form  target_t ~= sum_i A[t][i] * u_i.
 *
 * Solved by Kaczmarz iteration (successive projection onto each constraint), which needs
 * no matrix library and degrades gracefully when the system is rank-deficient — exactly
 * the regime the correlated-probe arm produces.
 */
function solveLeastSquares(
  A: bigint[][],
  targets: number[],
  n: number,
  iterations = 400
): number[] {
  const x = new Array<number>(n).fill(0);
  for (let it = 0; it < iterations; it++) {
    for (let t = 0; t < A.length; t++) {
      const row = A[t].map(Number);
      const norm2 = row.reduce((s, v) => s + v * v, 0);
      if (norm2 === 0) continue;
      const dot = row.reduce((s, v, i) => s + v * x[i], 0);
      const corr = (targets[t] - dot) / norm2;
      for (let i = 0; i < n; i++) x[i] += corr * row[i];
    }
  }
  return x;
}

// ---------------------------------------------------------------------------
// Deployment helpers
// ---------------------------------------------------------------------------

interface Stack {
  marketplace: any;
  registry: any;
  engine: any;
  oracle: any;
  modelId: bigint;
  sampleIds: bigint[];
  prov: any;
}

async function encryptDosages(engineAddr: string, who: string, g: bigint[]) {
  const input = fhevm.createEncryptedInput(engineAddr, who);
  for (const v of g) input.add64(v);
  return input.encrypt();
}

/**
 * Deploy a private model, either on the live contracts (`variant: "hardened"`) or on the
 * frozen submitted design (`variant: "baseline"`).
 */
async function deployStack(opts: {
  variant: "hardened" | "baseline";
  quantised: ReturnType<typeof quantise>;
  oracleRequired: boolean;
  low?: bigint;
  high?: bigint;
  attackers: string[];
  sampleCount?: number;
  rateLimit?: { maxJobs: bigint; windowBlocks: bigint };
}): Promise<Stack> {
  const { variant, quantised, oracleRequired, attackers } = opts;
  const sampleCount = opts.sampleCount ?? 1;

  const prov = syntheticModelProvenance({
    purpose: `anti_probing_${variant}_${oracleRequired ? "oracle" : "raw"}`,
    spec: {
      weightCount: N,
      scale: SCALE,
      noiseUpperBound: Number(NOISE_BOUND),
      weightSource: "HEPRS 100-SNP fixture betas, positions 1..N (intercept excluded)",
      isPrivate: true,
      variant,
      oracleRequired,
      lowThreshold: (opts.low ?? 0n).toString(),
      highThreshold: (opts.high ?? 0n).toString(),
      deterministic: true,
    },
  });

  const Oracle = await ethers.getContractFactory("ResultOracle");
  const oracle = await Oracle.deploy(NOISE_BOUND);
  const oracleAddr = await oracle.getAddress();

  const Mkt = await ethers.getContractFactory(
    variant === "hardened" ? "ModelMarketplace" : "BaselineModelMarketplace"
  );
  const marketplace = await Mkt.deploy();

  const shell = [
    true, // isPrivate
    BigInt(N),
    BigInt(Math.min(N, 32)), // private upload capped by the input-proof budget
    BigInt(Math.min(N, 20)), // computeChunkSize, HCU-bounded
    `ipfs://anti-probing/${variant}`,
    prov.manifestHash,
    prov.sourceModelHash,
    quantised.weightZeroPoint,
    quantised.scoreOffset,
  ] as const;
  const modelId = await marketplace.createModelShell.staticCall(...shell);
  await marketplace.createModelShell(...shell);

  // Encrypted weight upload.
  const mktAddr = await marketplace.getAddress();
  const [owner] = await ethers.getSigners();
  const wInput = fhevm.createEncryptedInput(mktAddr, owner.address);
  for (const w of quantised.u) wInput.add64(w);
  const wEnc = await wInput.encrypt();
  await marketplace.appendEncryptedModelChunk(modelId, wEnc.handles, wEnc.inputProof);

  const Registry = await ethers.getContractFactory("GenomicRegistry");
  const registry = await Registry.deploy();
  const Eng = await ethers.getContractFactory(
    variant === "hardened" ? "PRSComputeEngine" : "BaselinePRSComputeEngine"
  );
  const engine = await Eng.deploy(mktAddr, await registry.getAddress());
  const engineAddr = await engine.getAddress();

  // The engine and every attacker wallet need explicit private-model reader access.
  await marketplace.setPrivateModelReader(modelId, engineAddr, true);
  for (const a of attackers) {
    await marketplace.setPrivateModelReader(modelId, a, true);
  }

  if (variant === "hardened") {
    if (oracleRequired) {
      await marketplace.setReleasePolicy(
        modelId, oracleAddr, opts.low!, opts.high!, true
      );
    }
    await marketplace.finalizeModel(modelId);
  } else {
    await marketplace.finalizeModel(modelId);
    if (oracleRequired) {
      await marketplace.setOracleRequired(modelId, true);
      await marketplace.setApprovedOracle(modelId, oracleAddr);
    }
  }

  if (opts.rateLimit) {
    await marketplace.setRateLimit(
      modelId, opts.rateLimit.maxJobs, opts.rateLimit.windowBlocks
    );
  }

  // One registered sample per requested sample slot, each granted to every attacker.
  const sampleIds: bigint[] = [];
  for (let s = 0; s < sampleCount; s++) {
    const uri = `ipfs://anti-probing/sample-${s}`;
    const id = await registry.registerSampleWithManifest.staticCall(
      uri, ethers.keccak256(ethers.toUtf8Bytes(uri))
    );
    await registry.registerSampleWithManifest(
      uri, ethers.keccak256(ethers.toUtf8Bytes(uri))
    );
    for (const a of attackers) await registry.grantAccess(id, a);
    sampleIds.push(id);
  }

  return { marketplace, registry, engine, oracle, modelId, sampleIds, prov };
}

// ---------------------------------------------------------------------------
// Query primitives — each is one real job
// ---------------------------------------------------------------------------

/** Unprotected: finalize and read the raw encoded score. */
async function queryRawScore(
  stack: Stack, g: bigint[], signer: any, sampleId: bigint
): Promise<bigint> {
  const engine = stack.engine.connect(signer);
  const engineAddr = await stack.engine.getAddress();
  const jobId = await engine.createPRSJob.staticCall(stack.modelId, sampleId);
  await engine.createPRSJob(stack.modelId, sampleId);
  const enc = await encryptDosages(engineAddr, signer.address, g);
  await engine.appendAndComputeChunk(jobId, enc.handles, enc.inputProof);
  const tx = await engine.finalize(jobId);
  const receipt = await tx.wait();
  const evt = receipt!.logs.find((l: any) => {
    try { return stack.engine.interface.parseLog(l)?.name === "JobFinalized"; }
    catch { return false; }
  });
  const handle = stack.engine.interface.parseLog(evt as any)!.args.encodedScore;
  return debugDecryptUint64(handle);
}

/** Protected: classify and read only the ternary category. */
async function queryCategory(
  stack: Stack,
  g: bigint[],
  signer: any,
  sampleId: bigint,
  thresholds?: { low: bigint; high: bigint }
): Promise<bigint> {
  const engine = stack.engine.connect(signer);
  const engineAddr = await stack.engine.getAddress();
  const jobId = await engine.createPRSJob.staticCall(stack.modelId, sampleId);
  await engine.createPRSJob(stack.modelId, sampleId);
  const enc = await encryptDosages(engineAddr, signer.address, g);
  await engine.appendAndComputeChunk(jobId, enc.handles, enc.inputProof);

  const tx = thresholds
    ? await engine.finalizeAndClassify(
        jobId, await stack.oracle.getAddress(), thresholds.low, thresholds.high
      )
    : await engine.finalizeAndClassify(jobId);
  const receipt = await tx.wait();
  const evt = receipt!.logs.find((l: any) => {
    try { return stack.oracle.interface.parseLog(l)?.name === "ResultClassified"; }
    catch { return false; }
  });
  const handle = stack.oracle.interface.parseLog(evt as any)!.args.category;
  return debugDecryptUint8(handle);
}

// ---------------------------------------------------------------------------
// The evaluation
// ---------------------------------------------------------------------------

describe("Anti-probing adversarial evaluation (R1.4-E1)", function () {
  this.timeout(3_600_000);

  const betas = realWeights(N);
  const quantised = quantise(betas, SCALE);
  const zs = Number(quantised.scoreOffset);
  const zw = Number(quantised.weightZeroPoint);
  const results: any[] = [];

  before(function () {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log(`\n  N=${N} private weights, scale=${SCALE}, B=${NOISE_BOUND}`);
    console.log(`  z_w=${zw}  z_s=${zs}`);
    const maxAbsQ = Math.max(...quantised.q.map(Math.abs));
    console.log(
      `  max |q_i|=${maxAbsQ}; noise bound is ${(100 * Number(NOISE_BOUND) / maxAbsQ).toFixed(2)}% ` +
        `of the largest weight magnitude`
    );
  });

  // ── Variation 3, part 1: no output protection at all ─────────────────────
  it("arm 1 — unprotected raw score release: exact extraction in N queries", async function () {
    const [owner, attacker] = await ethers.getSigners();
    const stack = await deployStack({
      variant: "hardened", quantised, oracleRequired: false,
      attackers: [attacker.address],
    });

    // g = e_j with dosage 1 gives e = u_j + z_s - z_w, so u_j follows directly.
    const estimate: number[] = [];
    let queries = 0;
    for (let j = 0; j < N; j++) {
      const e = await queryRawScore(stack, unitProbe(N, j, 1n), attacker, stack.sampleIds[0]);
      queries++;
      estimate.push(Number(e) - zs + zw);
    }
    const m = score(quantised.q, estimate, quantised.weightZeroPoint);
    console.log(`  arm 1 (raw score):        queries=${queries}  ${JSON.stringify(m)}`);
    results.push({
      arm: "unprotected_raw_score", variation: "threshold design (no oracle)",
      adaptive: false, queries, ...m,
      note: "Each query is one linear equation and the attacker sees it exactly. " +
        "N queries suffice for complete, exact recovery. This is the reference point " +
        "the oracle path exists to avoid.",
    });
    if (m.pearsonR !== 1 || m.signAccuracy !== 1) {
      throw new Error("arm 1 should recover weights exactly; got " + JSON.stringify(m));
    }
    void owner;
  });

  // ── Variation 3, part 2 + variation 1: caller-selected thresholds ─────────
  it("arm 2 — BASELINE caller-selected thresholds, adaptive binary search", async function () {
    const [, attacker] = await ethers.getSigners();
    const stack = await deployStack({
      variant: "baseline", quantised, oracleRequired: true,
      low: 0n, high: 0n, attackers: [attacker.address],
    });

    // Adaptive: for each weight, bisect the attacker-chosen low threshold until the
    // category flips. Each step is one job. The noise blurs the crossing by at most B.
    // Run the bisection to the full budget while recording the estimate after every
    // step, so one pass yields the whole extraction-cost curve rather than one point.
    // That curve is what replaces the 2,800-hour headline: cost as a function of
    // queries, measured rather than asserted.
    const steps = Math.ceil(BUDGET_PER_WEIGHT);
    const perStepEstimates: number[][] = Array.from({ length: steps }, () => []);
    let queries = 0;
    for (let j = 0; j < N; j++) {
      const g = unitProbe(N, j, 1n);
      let lo = 0n;
      let hi = BigInt(zs + zw + 4 * Math.max(...quantised.q.map(Math.abs)) + 1000);
      for (let s = 0; s < steps; s++) {
        const mid = (lo + hi) / 2n;
        // A gap of exactly B is the policy minimum the oracle enforces.
        const cat = await queryCategory(stack, g, attacker, stack.sampleIds[0], {
          low: mid, high: mid + NOISE_BOUND,
        });
        queries++;
        if (cat === 0n) hi = mid; else lo = mid;
        perStepEstimates[s].push(Number((lo + hi) / 2n) - zs + zw);
      }
    }

    const curve = perStepEstimates.map((est, i) => ({
      queriesPerWeight: i + 1,
      totalQueries: (i + 1) * N,
      ...score(quantised.q, est, quantised.weightZeroPoint),
    }));
    const m = curve[curve.length - 1];
    console.log(`  arm 2 (baseline, adaptive): queries=${queries}  ${JSON.stringify({
      pearsonR: m.pearsonR, signAccuracy: m.signAccuracy,
      meanRelativeError: m.meanRelativeError, withinNoiseBound: m.withinNoiseBound })}`);
    console.log("  arm 2 extraction-cost curve (queries -> recovery):");
    for (const c of curve) {
      console.log(
        `    ${String(c.totalQueries).padStart(5)} queries  r=${c.pearsonR.toFixed(4)}` +
          `  sign=${(100 * c.signAccuracy).toFixed(0)}%` +
          `  relErr=${c.meanRelativeError.toFixed(4)}` +
          `  withinB=${(100 * c.withinNoiseBound).toFixed(0)}%`
      );
    }
    results.push({
      arm: "baseline_caller_selected_thresholds", variation: "threshold design + adaptive",
      adaptive: true, queries, queriesPerWeight: steps,
      pearsonR: m.pearsonR, signAccuracy: m.signAccuracy,
      meanRelativeError: m.meanRelativeError, withinNoiseBound: m.withinNoiseBound,
      extractionCostCurve: curve,
      note: "The requester chooses both thresholds per call, so a binary search on the " +
        "encrypted score is directly expressible. Cost is N * log2(range/B) queries. " +
        "The curve gives recovery quality as a function of query count, measured.",
    });
  });

  it("arm 3 — BASELINE caller-selected thresholds, NON-adaptive at equal budget", async function () {
    const [, attacker] = await ethers.getSigners();
    const stack = await deployStack({
      variant: "baseline", quantised, oracleRequired: true,
      low: 0n, high: 0n, attackers: [attacker.address],
    });

    // Non-adaptive: probe set and thresholds fixed in advance, no use of prior answers.
    const rng = makeRng(20260728);
    const total = N * Math.ceil(BUDGET_PER_WEIGHT);
    const range = zs + zw + 4 * Math.max(...quantised.q.map(Math.abs));
    const A: bigint[][] = [];
    const targets: number[] = [];
    let queries = 0;
    for (let t = 0; t < total; t++) {
      const g = independentProbe(N, rng);
      const low = BigInt(Math.floor(rng() * range));
      const cat = await queryCategory(stack, g, attacker, stack.sampleIds[0], {
        low, high: low + NOISE_BOUND,
      });
      queries++;
      // Convert the bin into a point estimate of e for least squares.
      const eGuess = cat === 0n ? Number(low) / 2 : Number(low) + (range - Number(low)) / 2;
      const G = g.reduce((s, v) => s + Number(v), 0);
      A.push(g);
      targets.push(eGuess - zs + zw * G);
    }
    const est = solveLeastSquares(A, targets, N);
    const m = score(quantised.q, est.map((v) => v + zw), quantised.weightZeroPoint);
    console.log(`  arm 3 (baseline, non-adapt): queries=${queries}  ${JSON.stringify(m)}`);
    results.push({
      arm: "baseline_caller_selected_thresholds", variation: "threshold design, non-adaptive",
      adaptive: false, queries, ...m,
      note: "Same interface and same budget as arm 2, but the query set is fixed in " +
        "advance. Isolates the value of adaptivity from the value of threshold control.",
    });
  });

  // ── Variation 3, part 3 + variation 1: fixed model-defined thresholds ─────
  it("arm 4 — HARDENED fixed thresholds, adaptive, equal budget", async function () {
    const [, attacker] = await ethers.getSigners();
    // Thresholds placed inside the reachable score range so the channel is informative;
    // a policy that never fires would flatter the defence.
    const mid = BigInt(zs + zw);
    const stack = await deployStack({
      variant: "hardened", quantised, oracleRequired: true,
      low: mid, high: mid + NOISE_BOUND * 8n, attackers: [attacker.address],
    });

    const rng = makeRng(20260729);
    const total = N * Math.ceil(BUDGET_PER_WEIGHT);
    const A: bigint[][] = [];
    const targets: number[] = [];
    let queries = 0;
    // Adaptive within the constraint that thresholds cannot move: steer each probe
    // toward the fixed decision boundary using the running estimate.
    let running = new Array<number>(N).fill(0);
    for (let t = 0; t < total; t++) {
      const g = independentProbe(N, rng);
      if (t > N) {
        // Nudge one coordinate to push the predicted score across the boundary.
        const predicted = g.reduce((s, v, i) => s + Number(v) * running[i], 0);
        const j = t % N;
        if (predicted < Number(mid) - zs && g[j] < 2n) g[j] = g[j] + 1n;
        else if (predicted > Number(mid) - zs && g[j] > 0n) g[j] = g[j] - 1n;
      }
      const cat = await queryCategory(stack, g, attacker, stack.sampleIds[0]);
      queries++;
      const lowN = Number(mid), highN = Number(mid + NOISE_BOUND * 8n);
      const eGuess = cat === 0n ? lowN / 2 : cat === 1n ? (lowN + highN) / 2 : highN * 1.5;
      const G = g.reduce((s, v) => s + Number(v), 0);
      A.push(g);
      targets.push(eGuess - zs + zw * G);
      if (t % N === 0 && A.length > 2) running = solveLeastSquares(A, targets, N, 40);
    }
    const est = solveLeastSquares(A, targets, N);
    const m = score(quantised.q, est.map((v) => v + zw), quantised.weightZeroPoint);
    console.log(`  arm 4 (hardened, adaptive): queries=${queries}  ${JSON.stringify(m)}`);
    results.push({
      arm: "hardened_fixed_thresholds", variation: "threshold design + adaptive",
      adaptive: true, queries, ...m,
      note: "Thresholds are model-defined and immutable, so the attacker can only move " +
        "the score, never the decision boundary. Adaptivity is reduced to probe " +
        "steering, which is far weaker than bisection.",
    });
  });

  // ── Variation 4: independent vs correlated SNP structure ─────────────────
  it("arm 5 — HARDENED fixed thresholds with CORRELATED probes (LD blocks)", async function () {
    const [, attacker] = await ethers.getSigners();
    const mid = BigInt(zs + zw);
    const stack = await deployStack({
      variant: "hardened", quantised, oracleRequired: true,
      low: mid, high: mid + NOISE_BOUND * 8n, attackers: [attacker.address],
    });

    const rng = makeRng(20260730);
    const total = N * Math.ceil(BUDGET_PER_WEIGHT);
    const blockSize = 5;
    const A: bigint[][] = [];
    const targets: number[] = [];
    let queries = 0;
    for (let t = 0; t < total; t++) {
      const g = correlatedProbe(N, blockSize, rng);
      const cat = await queryCategory(stack, g, attacker, stack.sampleIds[0]);
      queries++;
      const lowN = Number(mid), highN = Number(mid + NOISE_BOUND * 8n);
      const eGuess = cat === 0n ? lowN / 2 : cat === 1n ? (lowN + highN) / 2 : highN * 1.5;
      const G = g.reduce((s, v) => s + Number(v), 0);
      A.push(g);
      targets.push(eGuess - zs + zw * G);
    }
    const est = solveLeastSquares(A, targets, N);
    const m = score(quantised.q, est.map((v) => v + zw), quantised.weightZeroPoint);
    console.log(`  arm 5 (hardened, correlated): queries=${queries}  ${JSON.stringify(m)}`);
    results.push({
      arm: "hardened_fixed_thresholds", variation: "correlated SNP structure",
      adaptive: false, queries, blockSize, ...m,
      note: `Probes constrained to LD-like blocks of ${blockSize} identical dosages. The ` +
        "design matrix is rank-deficient, so only block sums are identifiable and " +
        "per-weight recovery collapses. CRITICAL CAVEAT: nothing forces an attacker to " +
        "use correlated probes. The contracts do not validate inputs (R1.5), so this " +
        "constraint is self-imposed and provides no defence — arm 4 is the honest " +
        "measure of what an attacker can do.",
    });
  });

  // ── Variations 2 and 5: wallets and samples under rate limiting ───────────
  it("arm 6 — rate limiting across wallets and samples (variations 2 and 5)", async function () {
    const signers = await ethers.getSigners();
    const attackers = signers.slice(1, 4); // three wallets
    const maxJobs = 3n;
    const windowBlocks = 1000n;

    const stack = await deployStack({
      variant: "hardened", quantised, oracleRequired: false,
      attackers: attackers.map((a) => a.address),
      sampleCount: 3,
      rateLimit: { maxJobs, windowBlocks },
    });

    // (a) one wallet, one sample — the quota
    let oneWalletOneSample = 0;
    try {
      for (let i = 0; i < 20; i++) {
        await stack.engine.connect(attackers[0]).createPRSJob(stack.modelId, stack.sampleIds[0]);
        oneWalletOneSample++;
      }
    } catch { /* rate limit reached */ }

    // (b) other wallets, SAME sample — per-sample window is already exhausted
    let otherWalletsSameSample = 0;
    try {
      for (const a of attackers.slice(1)) {
        await stack.engine.connect(a).createPRSJob(stack.modelId, stack.sampleIds[0]);
        otherWalletsSameSample++;
      }
    } catch { /* sample window exhausted across wallets */ }

    // (c) other wallets, DIFFERENT samples — independent windows
    let otherWalletsOtherSamples = 0;
    try {
      for (let k = 1; k < attackers.length; k++) {
        for (let i = 0; i < 20; i++) {
          await stack.engine.connect(attackers[k]).createPRSJob(stack.modelId, stack.sampleIds[k]);
          otherWalletsOtherSamples++;
        }
      }
    } catch { /* each pair has its own quota */ }

    console.log(
      `  arm 6 (rate limits): quota=${maxJobs}/window; ` +
        `1 wallet+1 sample=${oneWalletOneSample}, ` +
        `other wallets on the SAME sample=${otherWalletsSameSample}, ` +
        `other wallets on OTHER samples=${otherWalletsOtherSamples}`
    );
    results.push({
      arm: "rate_limiting", variation: "multiple wallets and multiple samples",
      maxJobsPerWindow: Number(maxJobs), windowBlocks: Number(windowBlocks),
      oneWalletOneSample, otherWalletsSameSample, otherWalletsOtherSamples,
      privateModelReaderRequired: true,
      note: "Per-sample windows mean a registered sample stays throttled across wallets, " +
        "so the same-sample multi-wallet bypass is closed. Distinct wallets holding " +
        "distinct registered samples do receive independent quotas — the remaining Sybil " +
        "boundary. For a PRIVATE model each additional wallet must also be authorised by " +
        "the model owner via setPrivateModelReader, so Sybil expansion is gated by an " +
        "explicit allowlist and not merely by rate limits.",
    });
  });

  after(async function () {
    if (results.length === 0) return;
    const maxAbsQ = Math.max(...quantised.q.map(Math.abs));
    const doc = {
      report: "anti_probing_evaluation",
      action: "R1.4-E1",
      evidenceClass: "Hardhat mock",
      note:
        "Every query is a real job against real contracts on the mock coprocessor; " +
        "nothing is simulated. Extraction arms run with rate limiting disabled so they " +
        "measure the INFORMATION cost in queries; arm 6 measures the permitted query " +
        "rate. Wall-clock cost is the product, stated with assumptions, replacing the " +
        "unexplained 2,800-hour figure.",
      configuration: {
        weightCount: N,
        scale: SCALE,
        noiseUpperBound: Number(NOISE_BOUND),
        weightZeroPoint: zw,
        scoreOffset: zs,
        maxAbsQuantisedWeight: maxAbsQ,
        noiseAsPercentOfLargestWeight: Number(
          ((100 * Number(NOISE_BOUND)) / maxAbsQ).toFixed(3)
        ),
        modelVisibility: "private (encrypted weights) — extraction is meaningless for a public model",
        attackerIsAuthorisedPrivateModelReader: true,
        budgetPerWeight: Math.ceil(BUDGET_PER_WEIGHT),
        baselineContractsFrom: "2d6f21d (frozen submitted design, CD-005)",
      },
      arms: results,
      // Wall-clock derivation replacing the 2,800-hour headline (R1.4-M1).
      //
      // Queries and time are deliberately separated. The extraction arms measure the
      // INFORMATION cost in queries with rate limiting off; the rate-limit arm measures
      // the permitted rate. Multiplying them, with the block time stated as an
      // assumption rather than buried, is what makes the resulting figure checkable.
      wallClockDerivation: (() => {
        const rl = results.find((r) => r.arm === "rate_limiting");
        const baseline = results.find(
          (r) => r.arm === "baseline_caller_selected_thresholds" && r.adaptive
        );
        if (!rl || !baseline?.extractionCostCurve) return null;
        // Cheapest point on the measured curve at which every weight is recovered to
        // within the noise bound.
        const full = baseline.extractionCostCurve.find(
          (c: any) => c.withinNoiseBound >= 1
        );
        const perWeight = full ? full.queriesPerWeight : null;
        const scenarios = [
          { label: "Ethereum mainnet-like", secondsPerBlock: 12 },
          { label: "L2 / app-chain-like", secondsPerBlock: 2 },
        ].map((sc) => {
          const windowSeconds = rl.windowBlocks * sc.secondsPerBlock;
          const secondsPerQuery = windowSeconds / rl.maxJobsPerWindow;
          return {
            ...sc,
            windowSeconds,
            secondsPerQuery,
            hoursForFullRecoveryOneSample:
              full ? Number(((full.totalQueries * secondsPerQuery) / 3600).toFixed(1)) : null,
          };
        });
        return {
          measuredQueriesPerWeightForFullRecovery: perWeight,
          measuredTotalQueriesForFullRecovery: full ? full.totalQueries : null,
          weightCount: N,
          rateLimitAssumed: {
            maxJobsPerWindow: rl.maxJobsPerWindow,
            windowBlocks: rl.windowBlocks,
          },
          scenarios,
          caveats: [
            "Applies to the BASELINE caller-selected-threshold design, i.e. the submitted " +
              "system. The hardened design did not reach full recovery within the budget " +
              "evaluated here.",
            "Scales with a single registered sample. An attacker holding S registered " +
              "samples divides the wall clock by roughly S; for a private model each " +
              "additional wallet must also be authorised via setPrivateModelReader.",
            "Block time is an assumption, not a measurement. No live-network timing was used.",
            "This is a lower bound on attacker effort under the strategies evaluated. A " +
              "better attack may exist; absence of one here is not a security proof.",
          ],
        };
      })(),
      provenance: await buildProvenance({
        model: syntheticModelProvenance({
          purpose: "anti_probing_evaluation",
          spec: { weightCount: N, scale: SCALE, noiseUpperBound: Number(NOISE_BOUND) },
        }),
        contracts: [],
      }),
    };
    const out = path.join(OUT_DIR, "anti_probing_results.json");
    fs.writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
    console.log(`\n  results written to ${path.relative(process.cwd(), out)}`);
  });
});
