/**
 * Resumable public-weight Sepolia validation using the Streaming method.
 *
 * This process evaluates exactly one HEPRS size. It never deploys contracts and
 * never switches silently to a local network. A write run requires both:
 *
 *   SNP_COUNT=100|500|1000|5000
 *   CONFIRM_SEPOLIA_SWEEP=YES
 *
 * Optional controls:
 *
 *   GROUP_SIZE=20              calculation group size; integer from 1 through 20
 *   CAPACITY_ONLY=1            inspect contracts, progress, balance, and fee capacity only
 *   MAX_NEW_TRANSACTIONS=10    pause cleanly after this many new submissions (0 = unlimited)
 *   ALLOW_RESUMABLE_FUNDING=YES
 *                              fund only the explicitly limited current batch; requires
 *                              MAX_NEW_TRANSACTIONS greater than zero
 *   SWEEP_OUT_DIR=...          report/checkpoint directory (default: deployments/sweeps)
 *
 * The checkpoint is updated atomically. Before a transaction is sent, it stores
 * the intended nonce. After broadcast, it stores the hash. On resume, a mined
 * receipt is reconciled; a pending or uncertain transaction stops the process so
 * that it cannot be submitted twice.
 */

import fs from "fs";
import path from "path";

import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";

import {
  buildProvenance,
  contractIdentity,
  fixtureModelProvenance,
  hashedInput,
  heprsGenotypePath,
  heprsManifestPath,
  heprsReferencePath,
  heprsWeightsPath,
} from "./utils/provenance";
import { retryTransientRelayerOperation } from "./utils/relayer_retry";
import {
  HEPRS_FIXTURE_SIZES,
  HeprsFixtureSize,
  chunkBigIntVector,
  dotProductBigInt,
  getHeprsBalancedRecommendation,
  loadHeprsFixture,
  quantizeHeprsWeightsWithRecommendation,
  toBigIntVector,
} from "../test/utils/heprs";

const SEPOLIA_CHAIN_ID = 11155111n;
const DEFAULT_HARDHAT_DEPLOYER =
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const MODEL_UPLOAD_GROUP_SIZE = 32;
const DEFAULT_CALCULATION_GROUP_SIZE = 20;
const MAX_CALCULATION_GROUP_SIZE = 20;
const DEFAULT_HEADROOM_BPS = 15_000n;
const MIN_HEADROOM_BPS = 12_500n;
const DEFAULT_GAS_PRICE_FLOOR_WEI = 2_000_000_000n;
const DEFAULT_RESERVE_WEI = ethers.parseEther("0.01");

const GAS_BUDGET = {
  modelShell: 600_000n,
  modelGroup: 500_000n,
  modelFinalize: 300_000n,
  sampleRegistration: 250_000n,
  jobCreation: 500_000n,
  calculationGroup: 4_000_000n,
  resultFinalize: 500_000n,
} as const;

type CheckpointStatus =
  | "in-progress"
  | "paused"
  | "awaiting-receipt"
  | "manual-review"
  | "failed"
  | "complete";

interface SavedDeployment {
  network?: string;
  chainId?: string;
  contracts: {
    GenomicRegistry: string;
    ModelMarketplace: string;
    PRSComputeEngine: string;
    ResultOracle?: string;
  };
  provenance?: {
    contracts?: RuntimeCodeRecord[];
  };
}

interface RuntimeCodeRecord {
  name: string;
  address: string;
  bytecodeHash: string;
  bytecodeBytes: number;
}

export interface RecordedTransaction {
  label: string;
  hash: string;
  nonce: number;
  blockNumber: number;
  blockTimestamp: number;
  gasUsed: string;
  effectiveGasPrice: string | null;
  feePaidWei: string | null;
  status: number | null;
}

interface TransactionVerificationSummary {
  receiptCount: number;
  successfulReceiptCount: number;
  allSavedFieldsMatched: true;
  requiredSuccessfulTransactions: number;
  allRequiredActionsConfirmed: true;
}

interface PendingTransaction {
  label: string;
  nonce: number;
  intendedAt: string;
  hash?: string;
  submittedAt?: string;
}

interface SweepConfigurationRecord {
  chainId: string;
  signer: string;
  snpCount: number;
  vectorLength: number;
  leadingConstantIncluded: true;
  modelUploadGroupSize: number;
  calculationGroupSize: number;
  expectedCalculationGroups: number;
  manifestHash: string;
  sourceModelHash: string;
  genotypeManifestHash: string;
  expectedEncodedScore: string;
  independentReferenceEncodedScore: string;
  contracts: SavedDeployment["contracts"];
}

interface SweepProgress {
  modelId?: string;
  sampleId?: string;
  jobId?: string;
  scoreHandle?: string;
}

interface SweepCheckpoint {
  schema: "bioeth-prs/sepolia-streaming-sweep-checkpoint/1";
  status: CheckpointStatus;
  startedAt: string;
  updatedAt: string;
  configuration: SweepConfigurationRecord;
  runtimeCode: RuntimeCodeRecord[];
  progress: SweepProgress;
  transactions: RecordedTransaction[];
  pendingTransaction?: PendingTransaction;
  lastError?: { name: string; message: string };
}

interface ProgressSnapshot {
  modelExists: boolean;
  uploadedModelWeights: number;
  modelFinalized: boolean;
  sampleExists: boolean;
  jobExists: boolean;
  nextCalculationGroup: number;
  jobComplete: boolean;
  jobFinalized: boolean;
}

export interface RemainingPlan {
  modelShellTransactions: number;
  modelGroupTransactions: number;
  modelFinalizeTransactions: number;
  sampleRegistrationTransactions: number;
  jobCreationTransactions: number;
  calculationGroupTransactions: number;
  resultFinalizeTransactions: number;
  totalTransactions: number;
  gasUnits: bigint;
}

export type FundingCheckMode = "full-remaining-run" | "limited-current-batch";

interface BalanceAssessment {
  balanceWei: bigint;
  feeBasisWei: bigint;
  reserveWei: bigint;
  headroomBps: bigint;
  requiredWei: bigint;
  affordable: boolean;
  maximumCalculationGroupsAfterFixedCosts: number;
}

interface SweepInputs {
  size: HeprsFixtureSize;
  vectorLength: number;
  calculationGroupSize: number;
  snps: bigint[];
  quantized: ReturnType<typeof quantizeHeprsWeightsWithRecommendation>;
  recommendation: ReturnType<typeof getHeprsBalancedRecommendation>;
  expected: bigint;
  referenceEncodedScore: bigint;
  referencePath: string;
  provenance: ReturnType<typeof fixtureModelProvenance>;
}

class SweepPausedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SweepPausedError";
  }
}

class AwaitingReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwaitingReceiptError";
  }
}

class ManualReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualReviewError";
  }
}

function errorSummary(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "UnknownError", message: String(error) };
}

function bigintJson(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function atomicWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, bigintJson, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function envFlag(name: string): boolean {
  return /^(1|true|yes)$/i.test(process.env[name] ?? "");
}

function parseInteger(
  name: string,
  value: string | undefined,
  options: { required?: boolean; minimum?: number; maximum?: number } = {}
): number {
  if (value === undefined || value.trim() === "") {
    if (options.required) throw new Error(`${name} is required`);
    throw new Error(`${name} is missing`);
  }
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${name} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} is too large`);
  if (options.minimum !== undefined && parsed < options.minimum) {
    throw new Error(`${name} must be at least ${options.minimum}`);
  }
  if (options.maximum !== undefined && parsed > options.maximum) {
    throw new Error(`${name} must be at most ${options.maximum}`);
  }
  return parsed;
}

function parseBigIntEnvironment(
  name: string,
  fallback: bigint,
  minimum: bigint
): bigint {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw.trim())) throw new Error(`${name} must be an integer`);
  const value = BigInt(raw.trim());
  if (value < minimum) {
    throw new Error(`${name} must be at least ${minimum}`);
  }
  return value;
}

export function parseSnpCount(value: string | undefined): HeprsFixtureSize {
  const parsed = parseInteger("SNP_COUNT", value, { required: true });
  if (!(HEPRS_FIXTURE_SIZES as readonly number[]).includes(parsed)) {
    throw new Error("SNP_COUNT must be exactly one of 100, 500, 1000, or 5000");
  }
  return parsed as HeprsFixtureSize;
}

export function parseCalculationGroupSize(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_CALCULATION_GROUP_SIZE;
  }
  return parseInteger("GROUP_SIZE", value, {
    minimum: 1,
    maximum: MAX_CALCULATION_GROUP_SIZE,
  });
}

export function streamingTransactionGeometry(
  vectorLength: number,
  calculationGroupSize: number
) {
  if (!Number.isInteger(vectorLength) || vectorLength < 1) {
    throw new Error("vectorLength must be a positive integer");
  }
  if (
    !Number.isInteger(calculationGroupSize) ||
    calculationGroupSize < 1 ||
    calculationGroupSize > MAX_CALCULATION_GROUP_SIZE
  ) {
    throw new Error(`calculationGroupSize must be between 1 and ${MAX_CALCULATION_GROUP_SIZE}`);
  }
  const modelGroups = Math.ceil(vectorLength / MODEL_UPLOAD_GROUP_SIZE);
  const calculationGroups = Math.ceil(vectorLength / calculationGroupSize);
  const modelPublication = 1 + modelGroups + 1;
  return {
    modelGroups,
    calculationGroups,
    modelPublication,
    total: modelPublication + 1 + 1 + calculationGroups + 1,
  };
}

export function fundingCheckMode(
  allowResumableFunding: string | undefined,
  maximumNewTransactions: number
): FundingCheckMode {
  if (allowResumableFunding !== "YES") return "full-remaining-run";
  if (maximumNewTransactions <= 0) {
    throw new Error(
      "ALLOW_RESUMABLE_FUNDING=YES requires MAX_NEW_TRANSACTIONS to be greater than zero"
    );
  }
  return "limited-current-batch";
}

const PLAN_TRANSACTION_ORDER: Array<{
  count: keyof Pick<
    RemainingPlan,
    | "modelShellTransactions"
    | "modelGroupTransactions"
    | "modelFinalizeTransactions"
    | "sampleRegistrationTransactions"
    | "jobCreationTransactions"
    | "calculationGroupTransactions"
    | "resultFinalizeTransactions"
  >;
  gas: bigint;
}> = [
  { count: "modelShellTransactions", gas: GAS_BUDGET.modelShell },
  { count: "modelGroupTransactions", gas: GAS_BUDGET.modelGroup },
  { count: "modelFinalizeTransactions", gas: GAS_BUDGET.modelFinalize },
  { count: "sampleRegistrationTransactions", gas: GAS_BUDGET.sampleRegistration },
  { count: "jobCreationTransactions", gas: GAS_BUDGET.jobCreation },
  { count: "calculationGroupTransactions", gas: GAS_BUDGET.calculationGroup },
  { count: "resultFinalizeTransactions", gas: GAS_BUDGET.resultFinalize },
];

export function limitPlanToCurrentBatch(
  fullPlan: RemainingPlan,
  maximumTransactions: number
): RemainingPlan {
  if (!Number.isSafeInteger(maximumTransactions) || maximumTransactions <= 0) {
    throw new Error("The current batch transaction limit must be a positive integer");
  }
  const limited: RemainingPlan = {
    modelShellTransactions: 0,
    modelGroupTransactions: 0,
    modelFinalizeTransactions: 0,
    sampleRegistrationTransactions: 0,
    jobCreationTransactions: 0,
    calculationGroupTransactions: 0,
    resultFinalizeTransactions: 0,
    totalTransactions: 0,
    gasUnits: 0n,
  };
  let availableSlots = maximumTransactions;
  for (const step of PLAN_TRANSACTION_ORDER) {
    const count = Math.min(fullPlan[step.count], availableSlots);
    limited[step.count] = count;
    limited.totalTransactions += count;
    limited.gasUnits += BigInt(count) * step.gas;
    availableSlots -= count;
    if (availableSlots === 0) break;
  }
  return limited;
}

function loadSweepInputs(
  size: HeprsFixtureSize,
  calculationGroupSize: number
): SweepInputs {
  const { genotypes, betas } = loadHeprsFixture(size);
  if (genotypes.length < 1) throw new Error(`The ${size}-SNP fixture has no individuals`);
  const snps = toBigIntVector(genotypes[0]);
  const recommendation = getHeprsBalancedRecommendation(size);
  const quantized = quantizeHeprsWeightsWithRecommendation(size, betas);
  const vectorLength = size + 1;

  if (snps.length !== vectorLength || quantized.weights.length !== vectorLength) {
    throw new Error(
      `${size}-SNP data must contain ${vectorLength} positions: ` +
        `${size} variants plus one leading constant`
    );
  }
  if (snps[0] !== 1n || betas[0] !== 0) {
    throw new Error("The leading constant must have dosage 1 and source weight 0");
  }
  for (const value of snps) {
    if (value < 0n || value > 2n) {
      throw new Error(`The selected individual contains an invalid dosage: ${value}`);
    }
  }

  const genoSum = snps.reduce((sum, value) => sum + value, 0n);
  const expected =
    dotProductBigInt(snps, quantized.weights) +
    quantized.scoreOffset -
    quantized.weightZeroPoint * genoSum;

  const referencePath = heprsReferencePath(size);
  const reference = JSON.parse(fs.readFileSync(referencePath, "utf8")) as {
    manifest?: { variantCount?: number; scale?: number };
    encoding?: { weightZeroPoint?: number; scoreOffset?: number };
    individuals?: Array<{ individual?: number; status?: string; encodedScore?: number | string }>;
  };
  const referenceIndividual = reference.individuals?.find((row) => row.individual === 0);
  if (!referenceIndividual || referenceIndividual.status !== "scored") {
    throw new Error(`Independent reference ${referencePath} has no scored individual 0`);
  }
  const referenceEncodedScore = BigInt(referenceIndividual.encodedScore ?? "-1");
  if (reference.manifest?.variantCount !== vectorLength) {
    throw new Error("Independent reference vector length does not match the fixture");
  }
  if (reference.manifest?.scale !== recommendation.scale) {
    throw new Error("Independent reference scale does not match the selected recommendation");
  }
  if (BigInt(reference.encoding?.weightZeroPoint ?? -1) !== quantized.weightZeroPoint) {
    throw new Error("Independent reference weight conversion does not match");
  }
  if (BigInt(reference.encoding?.scoreOffset ?? -1) !== quantized.scoreOffset) {
    throw new Error("Independent reference score offset does not match");
  }
  if (expected !== referenceEncodedScore) {
    throw new Error(
      `Independent reference mismatch: local exact calculation ${expected}, ` +
        `reference ${referenceEncodedScore}`
    );
  }

  const provenance = fixtureModelProvenance({
    manifestPath: heprsManifestPath(size),
    weightsPath: heprsWeightsPath(size),
    genotypePath: heprsGenotypePath(size),
    extra: {
      nominalSnpCount: size,
      vectorLength,
      leadingConstantIncluded: true,
      scale: recommendation.scale,
      modelUploadGroupSize: MODEL_UPLOAD_GROUP_SIZE,
      calculationGroupSize,
      individual: 0,
      modelVisibility: "public",
      method: "streaming",
    },
  });

  return {
    size,
    vectorLength,
    calculationGroupSize,
    snps,
    quantized,
    recommendation,
    expected,
    referenceEncodedScore,
    referencePath,
    provenance,
  };
}

export function validateSweepFixture(
  size: HeprsFixtureSize,
  calculationGroupSize = DEFAULT_CALCULATION_GROUP_SIZE
) {
  const inputs = loadSweepInputs(size, calculationGroupSize);
  return {
    snpCount: inputs.size,
    vectorLength: inputs.vectorLength,
    leadingConstantIncluded: true as const,
    expectedEncodedScore: inputs.expected.toString(),
    independentReferenceEncodedScore: inputs.referenceEncodedScore.toString(),
    exactReferenceMatch: inputs.expected === inputs.referenceEncodedScore,
  };
}

function loadDeployment(): { path: string; value: SavedDeployment } {
  const deploymentPath = process.env.SWEEP_DEPLOYMENT_FILE
    ? path.resolve(process.env.SWEEP_DEPLOYMENT_FILE)
    : path.resolve(__dirname, "../deployments/sepolia.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Existing Sepolia deployment is required: ${deploymentPath}`);
  }
  const value = JSON.parse(fs.readFileSync(deploymentPath, "utf8")) as SavedDeployment;
  if (value.chainId !== undefined && BigInt(value.chainId) !== SEPOLIA_CHAIN_ID) {
    throw new Error(`Deployment file has unexpected chainId ${value.chainId}`);
  }
  for (const name of ["GenomicRegistry", "ModelMarketplace", "PRSComputeEngine"] as const) {
    if (!ethers.isAddress(value.contracts?.[name])) {
      throw new Error(`Deployment file has no valid ${name} address`);
    }
  }
  return { path: deploymentPath, value };
}

function isTransientRpcError(error: unknown): boolean {
  const message = errorSummary(error).message;
  return /timeout|network|socket|fetch|ECONN|SERVER_ERROR|rate.?limit|\b429\b|\b50[234]\b/i.test(
    message
  );
}

async function retryRpcRead<T>(label: string, operation: () => Promise<T>): Promise<T> {
  const maximumAttempts = 6;
  for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientRpcError(error) || attempt === maximumAttempts) throw error;
      const delayMs = Math.min(1_000 * 2 ** (attempt - 1), 15_000);
      console.warn(
        `${label}: temporary RPC error; retry ${attempt + 1}/${maximumAttempts} ` +
          `in ${delayMs}ms`
      );
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`${label}: retry loop exhausted unexpectedly`);
}

async function deployedRuntimeCode(
  contracts: SavedDeployment["contracts"]
): Promise<RuntimeCodeRecord[]> {
  const records: RuntimeCodeRecord[] = [];
  for (const [name, address] of Object.entries(contracts)) {
    if (!address) continue;
    const code = await retryRpcRead(`${name} runtime code`, () =>
      ethers.provider.getCode(address)
    );
    if (code === "0x") throw new Error(`${name} has no runtime code at ${address}`);
    records.push({
      name,
      address,
      bytecodeHash: ethers.keccak256(code),
      bytecodeBytes: (code.length - 2) / 2,
    });
  }
  return records;
}

function requireRecordedRuntimeCode(
  deployment: SavedDeployment,
  currentRuntimeCode: RuntimeCodeRecord[]
): void {
  const recorded = deployment.provenance?.contracts;
  if (!recorded || recorded.length === 0) {
    throw new Error("The Sepolia deployment file has no recorded runtime-code identities");
  }
  const recordedByName = new Map(recorded.map((item) => [item.name, item]));
  for (const current of currentRuntimeCode) {
    const expected = recordedByName.get(current.name);
    if (
      !expected ||
      expected.address.toLowerCase() !== current.address.toLowerCase() ||
      expected.bytecodeHash.toLowerCase() !== current.bytecodeHash.toLowerCase() ||
      expected.bytecodeBytes !== current.bytecodeBytes
    ) {
      throw new Error(`The deployed runtime code for ${current.name} does not match its record`);
    }
  }
}

function checkpointPaths(signer: string, size: number, groupSize: number) {
  const outputDirectory = process.env.SWEEP_OUT_DIR
    ? path.resolve(process.env.SWEEP_OUT_DIR)
    : path.resolve(__dirname, "../deployments/sweeps");
  const signerTag = signer.toLowerCase().slice(2, 10);
  const stem = `sepolia-streaming-public-${size}snp-g${groupSize}-${signerTag}`;
  return {
    outputDirectory,
    checkpoint: process.env.SWEEP_CHECKPOINT_PATH
      ? path.resolve(process.env.SWEEP_CHECKPOINT_PATH)
      : path.join(outputDirectory, `${stem}-checkpoint.json`),
    report: path.join(outputDirectory, `${stem}-report.json`),
    capacity: path.join(outputDirectory, `${stem}-capacity.json`),
    lock: path.join(outputDirectory, `${stem}.lock`),
  };
}

function acquireWriteLock(lockPath: string): void {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let descriptor: number;
  try {
    descriptor = fs.openSync(lockPath, "wx");
  } catch (error) {
    throw new ManualReviewError(
      `Another process may be using this sweep: ${lockPath}. ` +
        "If no process is active, inspect the checkpoint before removing the stale lock."
    );
  }
  fs.writeSync(
    descriptor,
    `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`
  );
  fs.closeSync(descriptor);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // A missing lock at process exit requires no further action.
    }
  };
  process.once("exit", release);
}

function validateCheckpoint(
  checkpoint: SweepCheckpoint,
  expected: SweepConfigurationRecord,
  currentRuntimeCode: RuntimeCodeRecord[]
): void {
  if (checkpoint.schema !== "bioeth-prs/sepolia-streaming-sweep-checkpoint/1") {
    throw new Error("Checkpoint schema is not supported");
  }
  const actual = checkpoint.configuration;
  const fields: Array<keyof SweepConfigurationRecord> = [
    "chainId",
    "signer",
    "snpCount",
    "vectorLength",
    "modelUploadGroupSize",
    "calculationGroupSize",
    "expectedCalculationGroups",
    "manifestHash",
    "sourceModelHash",
    "genotypeManifestHash",
    "expectedEncodedScore",
    "independentReferenceEncodedScore",
  ];
  for (const field of fields) {
    if (actual[field] !== expected[field]) {
      throw new Error(`Checkpoint ${String(field)} does not match this process`);
    }
  }
  for (const name of ["GenomicRegistry", "ModelMarketplace", "PRSComputeEngine"] as const) {
    if (
      actual.contracts[name].toLowerCase() !== expected.contracts[name].toLowerCase()
    ) {
      throw new Error(`Checkpoint ${name} address does not match the deployment file`);
    }
  }
  const recordedRuntime = new Map(
    (checkpoint.runtimeCode ?? []).map((record) => [record.name, record])
  );
  for (const current of currentRuntimeCode) {
    const recorded = recordedRuntime.get(current.name);
    if (
      !recorded ||
      recorded.address.toLowerCase() !== current.address.toLowerCase() ||
      recorded.bytecodeHash.toLowerCase() !== current.bytecodeHash.toLowerCase() ||
      recorded.bytecodeBytes !== current.bytecodeBytes
    ) {
      throw new Error(`Checkpoint runtime code for ${current.name} has changed`);
    }
  }
}

function writeCheckpoint(filePath: string, checkpoint: SweepCheckpoint): void {
  checkpoint.updatedAt = new Date().toISOString();
  atomicWriteJson(filePath, checkpoint);
}

function recordReceipt(
  checkpoint: SweepCheckpoint,
  pending: PendingTransaction,
  receipt: any,
  blockTimestamp: number
): RecordedTransaction {
  const gasUsed = BigInt(receipt.gasUsed ?? 0);
  const gasPriceValue = receipt.gasPrice ?? receipt.effectiveGasPrice ?? null;
  const effectiveGasPrice = gasPriceValue === null ? null : BigInt(gasPriceValue);
  const record: RecordedTransaction = {
    label: pending.label,
    hash: receipt.hash,
    nonce: pending.nonce,
    blockNumber: receipt.blockNumber,
    blockTimestamp,
    gasUsed: gasUsed.toString(),
    effectiveGasPrice: effectiveGasPrice?.toString() ?? null,
    feePaidWei:
      effectiveGasPrice === null ? null : (gasUsed * effectiveGasPrice).toString(),
    status: receipt.status,
  };
  if (!checkpoint.transactions.some((item) => item.hash === record.hash)) {
    checkpoint.transactions.push(record);
  }
  return record;
}

function sameText(left: unknown, right: unknown): boolean {
  return String(left).toLowerCase() === String(right).toLowerCase();
}

function receiptMismatch(
  record: RecordedTransaction,
  field: string,
  saved: unknown,
  live: unknown
): never {
  throw new ManualReviewError(
    `${record.label} (${record.hash}) has a different ${field} on Sepolia: ` +
      `saved ${String(saved)}, live ${String(live)}`
  );
}

export function expectedTransactionTarget(
  label: string,
  contracts: SavedDeployment["contracts"]
): string {
  if (
    label === "model.createShell" ||
    label === "model.finalize" ||
    /^model\.appendPublicGroup\.\d+$/.test(label)
  ) {
    return contracts.ModelMarketplace;
  }
  if (label === "sample.register") return contracts.GenomicRegistry;
  if (
    label === "job.create" ||
    label === "job.finalize" ||
    /^job\.appendAndComputeGroup\.\d+$/.test(label)
  ) {
    return contracts.PRSComputeEngine;
  }
  throw new ManualReviewError(`Checkpoint contains an unknown transaction label: ${label}`);
}

/**
 * Compare one saved transaction with fresh Sepolia transaction, receipt, and block reads.
 * The returned record is rebuilt from those live values so the final report does not rely
 * on unchecked checkpoint totals.
 */
export function verifyRecordedTransaction(
  record: RecordedTransaction,
  transaction: any,
  receipt: any,
  block: any,
  signerAddress: string,
  contracts: SavedDeployment["contracts"]
): RecordedTransaction {
  if (!transaction) {
    throw new ManualReviewError(`Transaction ${record.hash} is not available from Sepolia`);
  }
  if (!receipt) {
    throw new ManualReviewError(`Receipt ${record.hash} is not available from Sepolia`);
  }
  if (!block) {
    throw new ManualReviewError(`Block ${record.blockNumber} is not available from Sepolia`);
  }

  const expectedTarget = expectedTransactionTarget(record.label, contracts);
  for (const [source, hash] of [
    ["transaction hash", transaction.hash],
    ["receipt hash", receipt.hash],
  ] as const) {
    if (!sameText(hash, record.hash)) receiptMismatch(record, source, record.hash, hash);
  }
  for (const [source, from] of [
    ["transaction sender", transaction.from],
    ["receipt sender", receipt.from],
  ] as const) {
    if (!sameText(from, signerAddress)) receiptMismatch(record, source, signerAddress, from);
  }
  for (const [source, to] of [
    ["transaction target", transaction.to],
    ["receipt target", receipt.to],
  ] as const) {
    if (!sameText(to, expectedTarget)) receiptMismatch(record, source, expectedTarget, to);
  }

  const liveNonce = Number(transaction.nonce);
  if (liveNonce !== record.nonce) {
    receiptMismatch(record, "nonce", record.nonce, liveNonce);
  }
  const liveBlockNumber = Number(receipt.blockNumber);
  if (
    Number(transaction.blockNumber) !== liveBlockNumber ||
    Number(block.number) !== liveBlockNumber ||
    record.blockNumber !== liveBlockNumber
  ) {
    receiptMismatch(
      record,
      "block number",
      record.blockNumber,
      `${String(transaction.blockNumber)}/${String(receipt.blockNumber)}/${String(block.number)}`
    );
  }
  if (
    !sameText(transaction.blockHash, receipt.blockHash) ||
    !sameText(receipt.blockHash, block.hash)
  ) {
    receiptMismatch(
      record,
      "block hash",
      transaction.blockHash,
      `${String(receipt.blockHash)}/${String(block.hash)}`
    );
  }

  const liveStatus = receipt.status === null ? null : Number(receipt.status);
  if (liveStatus === null || liveStatus !== record.status) {
    receiptMismatch(record, "receipt status", record.status, liveStatus);
  }
  const liveGasUsed = BigInt(receipt.gasUsed ?? 0).toString();
  if (liveGasUsed !== record.gasUsed) {
    receiptMismatch(record, "gas used", record.gasUsed, liveGasUsed);
  }
  const gasPriceValue = receipt.gasPrice ?? receipt.effectiveGasPrice ?? null;
  const liveEffectiveGasPrice =
    gasPriceValue === null ? null : BigInt(gasPriceValue).toString();
  if (liveEffectiveGasPrice !== record.effectiveGasPrice) {
    receiptMismatch(
      record,
      "effective gas price",
      record.effectiveGasPrice,
      liveEffectiveGasPrice
    );
  }
  const liveFeePaidWei =
    liveEffectiveGasPrice === null
      ? null
      : (BigInt(liveGasUsed) * BigInt(liveEffectiveGasPrice)).toString();
  if (liveFeePaidWei !== record.feePaidWei) {
    receiptMismatch(record, "fee paid", record.feePaidWei, liveFeePaidWei);
  }
  const liveBlockTimestamp = Number(block.timestamp);
  if (liveBlockTimestamp !== record.blockTimestamp) {
    receiptMismatch(
      record,
      "block timestamp",
      record.blockTimestamp,
      liveBlockTimestamp
    );
  }

  return {
    label: record.label,
    hash: String(receipt.hash),
    nonce: liveNonce,
    blockNumber: liveBlockNumber,
    blockTimestamp: liveBlockTimestamp,
    gasUsed: liveGasUsed,
    effectiveGasPrice: liveEffectiveGasPrice,
    feePaidWei: liveFeePaidWei,
    status: liveStatus,
  };
}

export function expectedSweepTransactionLabels(
  vectorLength: number,
  calculationGroupSize: number
): string[] {
  const geometry = streamingTransactionGeometry(vectorLength, calculationGroupSize);
  return [
    "model.createShell",
    ...Array.from(
      { length: geometry.modelGroups },
      (_, index) => `model.appendPublicGroup.${index}`
    ),
    "model.finalize",
    "sample.register",
    "job.create",
    ...Array.from(
      { length: geometry.calculationGroups },
      (_, index) => `job.appendAndComputeGroup.${index}`
    ),
    "job.finalize",
  ];
}

export function verifyCompletedTransactionCoverage(
  transactions: RecordedTransaction[],
  vectorLength: number,
  calculationGroupSize: number
): void {
  for (const label of expectedSweepTransactionLabels(vectorLength, calculationGroupSize)) {
    const successful = transactions.filter(
      (transaction) => transaction.label === label && transaction.status === 1
    );
    if (successful.length !== 1) {
      throw new ManualReviewError(
        `Expected one successful Sepolia receipt for ${label}, found ${successful.length}`
      );
    }
  }
}

async function verifySavedTransactionsOnSepolia(
  checkpoint: SweepCheckpoint
): Promise<{
  transactions: RecordedTransaction[];
  summary: TransactionVerificationSummary;
}> {
  const verified: RecordedTransaction[] = [];
  const seenHashes = new Set<string>();
  console.log(`Re-reading ${checkpoint.transactions.length} Sepolia transaction receipts...`);

  for (const record of checkpoint.transactions) {
    const normalizedHash = record.hash.toLowerCase();
    if (seenHashes.has(normalizedHash)) {
      throw new ManualReviewError(`Checkpoint repeats transaction ${record.hash}`);
    }
    seenHashes.add(normalizedHash);
    const [transaction, receipt] = await Promise.all([
      retryRpcRead(`transaction ${record.hash}`, () =>
        ethers.provider.getTransaction(record.hash)
      ),
      retryRpcRead(`transaction receipt ${record.hash}`, () =>
        ethers.provider.getTransactionReceipt(record.hash)
      ),
    ]);
    if (!receipt) {
      throw new ManualReviewError(`Receipt ${record.hash} is not available from Sepolia`);
    }
    const block = await retryRpcRead(`block ${receipt.blockNumber}`, () =>
      ethers.provider.getBlock(receipt.blockNumber)
    );
    verified.push(
      verifyRecordedTransaction(
        record,
        transaction,
        receipt,
        block,
        checkpoint.configuration.signer,
        checkpoint.configuration.contracts
      )
    );
  }

  verifyCompletedTransactionCoverage(
    verified,
    checkpoint.configuration.vectorLength,
    checkpoint.configuration.calculationGroupSize
  );
  return {
    transactions: verified,
    summary: {
      receiptCount: verified.length,
      successfulReceiptCount: verified.filter((transaction) => transaction.status === 1)
        .length,
      allSavedFieldsMatched: true,
      requiredSuccessfulTransactions: expectedSweepTransactionLabels(
        checkpoint.configuration.vectorLength,
        checkpoint.configuration.calculationGroupSize
      ).length,
      allRequiredActionsConfirmed: true,
    },
  };
}

async function receiptOrPending(hash: string): Promise<any | null> {
  return retryRpcRead(`transaction receipt ${hash}`, () =>
    ethers.provider.getTransactionReceipt(hash)
  );
}

async function waitForReceipt(hash: string): Promise<any> {
  const maximumAttempts = parseInteger(
    "RECEIPT_MAX_ATTEMPTS",
    process.env.RECEIPT_MAX_ATTEMPTS ?? "80",
    { minimum: 1, maximum: 500 }
  );
  for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
    const receipt = await receiptOrPending(hash);
    if (receipt) return receipt;
    if (attempt === maximumAttempts) break;
    const delayMs = Math.min(5_000 * 2 ** Math.min(attempt - 1, 3), 30_000);
    console.log(`  ${hash}: receipt pending; checking again in ${delayMs}ms`);
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }
  throw new AwaitingReceiptError(
    `Transaction ${hash} still has no receipt. Resume later; no replacement was submitted.`
  );
}

async function reconcilePendingTransaction(
  checkpoint: SweepCheckpoint,
  checkpointPath: string
): Promise<void> {
  const pending = checkpoint.pendingTransaction;
  if (!pending) return;
  if (!pending.hash) {
    checkpoint.status = "manual-review";
    writeCheckpoint(checkpointPath, checkpoint);
    throw new ManualReviewError(
      `${pending.label} reserved nonce ${pending.nonce}, but its hash was not recorded. ` +
        "Inspect that nonce before changing the checkpoint; the runner will not resubmit it."
    );
  }

  const receipt = await receiptOrPending(pending.hash);
  if (!receipt) {
    const transaction = await retryRpcRead(`transaction ${pending.hash}`, () =>
      ethers.provider.getTransaction(pending.hash!)
    );
    checkpoint.status = transaction ? "awaiting-receipt" : "manual-review";
    writeCheckpoint(checkpointPath, checkpoint);
    if (transaction) {
      throw new AwaitingReceiptError(
        `${pending.label} (${pending.hash}) is still pending. Resume after it is mined.`
      );
    }
    throw new ManualReviewError(
      `${pending.label} (${pending.hash}) is not visible through this RPC endpoint. ` +
        "The runner will not replace it automatically."
    );
  }

  const block = await retryRpcRead(`block ${receipt.blockNumber}`, () =>
    ethers.provider.getBlock(receipt.blockNumber)
  );
  recordReceipt(checkpoint, pending, receipt, Number(block?.timestamp ?? 0));
  checkpoint.pendingTransaction = undefined;
  if (receipt.status !== 1) {
    checkpoint.status = "failed";
    writeCheckpoint(checkpointPath, checkpoint);
    throw new Error(`${pending.label} reverted in ${pending.hash}`);
  }
  checkpoint.status = "in-progress";
  writeCheckpoint(checkpointPath, checkpoint);
}

function calculateRemainingPlan(
  vectorLength: number,
  calculationGroupSize: number,
  progress: ProgressSnapshot
): RemainingPlan {
  const totalCalculationGroups = Math.ceil(vectorLength / calculationGroupSize);
  const remainingModelWeights = progress.modelExists
    ? Math.max(0, vectorLength - progress.uploadedModelWeights)
    : vectorLength;
  const modelShellTransactions = progress.modelExists ? 0 : 1;
  const modelGroupTransactions = Math.ceil(
    remainingModelWeights / MODEL_UPLOAD_GROUP_SIZE
  );
  const modelFinalizeTransactions = progress.modelFinalized ? 0 : 1;
  const sampleRegistrationTransactions = progress.sampleExists ? 0 : 1;
  const jobCreationTransactions = progress.jobExists ? 0 : 1;
  const calculationGroupTransactions = progress.jobComplete
    ? 0
    : Math.max(0, totalCalculationGroups - progress.nextCalculationGroup);
  const resultFinalizeTransactions = progress.jobFinalized ? 0 : 1;
  const totalTransactions =
    modelShellTransactions +
    modelGroupTransactions +
    modelFinalizeTransactions +
    sampleRegistrationTransactions +
    jobCreationTransactions +
    calculationGroupTransactions +
    resultFinalizeTransactions;
  const gasUnits =
    BigInt(modelShellTransactions) * GAS_BUDGET.modelShell +
    BigInt(modelGroupTransactions) * GAS_BUDGET.modelGroup +
    BigInt(modelFinalizeTransactions) * GAS_BUDGET.modelFinalize +
    BigInt(sampleRegistrationTransactions) * GAS_BUDGET.sampleRegistration +
    BigInt(jobCreationTransactions) * GAS_BUDGET.jobCreation +
    BigInt(calculationGroupTransactions) * GAS_BUDGET.calculationGroup +
    BigInt(resultFinalizeTransactions) * GAS_BUDGET.resultFinalize;
  return {
    modelShellTransactions,
    modelGroupTransactions,
    modelFinalizeTransactions,
    sampleRegistrationTransactions,
    jobCreationTransactions,
    calculationGroupTransactions,
    resultFinalizeTransactions,
    totalTransactions,
    gasUnits,
  };
}

async function assessBalance(
  signerAddress: string,
  plan: RemainingPlan
): Promise<BalanceAssessment> {
  const [balanceWei, feeData] = await Promise.all([
    retryRpcRead("signer balance", () => ethers.provider.getBalance(signerAddress)),
    retryRpcRead("network fee data", () => ethers.provider.getFeeData()),
  ]);
  const feeCandidates = [feeData.maxFeePerGas, feeData.gasPrice]
    .filter((value): value is bigint => value !== null)
    .map((value) => BigInt(value));
  if (feeCandidates.length === 0) {
    throw new Error("The provider returned no usable gas-price information");
  }
  const configuredFloor = parseBigIntEnvironment(
    "SWEEP_GAS_PRICE_FLOOR_WEI",
    DEFAULT_GAS_PRICE_FLOOR_WEI,
    DEFAULT_GAS_PRICE_FLOOR_WEI
  );
  const feeBasisWei = feeCandidates.reduce(
    (maximum, value) => (value > maximum ? value : maximum),
    configuredFloor
  );
  const headroomBps = parseBigIntEnvironment(
    "SWEEP_HEADROOM_BPS",
    DEFAULT_HEADROOM_BPS,
    MIN_HEADROOM_BPS
  );
  const reserveWei = parseBigIntEnvironment(
    "SWEEP_RESERVE_WEI",
    DEFAULT_RESERVE_WEI,
    DEFAULT_RESERVE_WEI
  );
  const transactionCostWithHeadroom =
    (plan.gasUnits * feeBasisWei * headroomBps + 9_999n) / 10_000n;
  const requiredWei = transactionCostWithHeadroom + reserveWei;

  const fixedGas =
    plan.gasUnits -
    BigInt(plan.calculationGroupTransactions) * GAS_BUDGET.calculationGroup;
  const spendableGas =
    balanceWei > reserveWei
      ? ((balanceWei - reserveWei) * 10_000n) / (feeBasisWei * headroomBps)
      : 0n;
  const affordableGroupGas = spendableGas > fixedGas ? spendableGas - fixedGas : 0n;
  const maximumCalculationGroupsAfterFixedCosts = Number(
    affordableGroupGas / GAS_BUDGET.calculationGroup
  );

  return {
    balanceWei,
    feeBasisWei,
    reserveWei,
    headroomBps,
    requiredWei,
    affordable: balanceWei >= requiredWei,
    maximumCalculationGroupsAfterFixedCosts,
  };
}

async function assertBalanceForPlan(
  signerAddress: string,
  plan: RemainingPlan
): Promise<BalanceAssessment> {
  const assessment = await assessBalance(signerAddress, plan);
  if (!assessment.affordable) {
    throw new Error(
      "Balance preflight refused the next transaction. " +
        `Remaining balance ${ethers.formatEther(assessment.balanceWei)} ETH; ` +
        `required with reserve and headroom ${ethers.formatEther(assessment.requiredWei)} ETH. ` +
        `The estimate covers all ${plan.totalTransactions} transaction(s) included in this ` +
        "balance check, not only the next transaction."
    );
  }
  return assessment;
}

async function recoverCreatedIdentifiers(
  checkpoint: SweepCheckpoint,
  checkpointPath: string,
  registry: any,
  marketplace: any,
  engine: any
): Promise<void> {
  const recover = async (
    label: string,
    eventName: string,
    argumentName: string
  ): Promise<string | undefined> => {
    const record = [...checkpoint.transactions].reverse().find((item) => item.label === label);
    if (!record) return undefined;
    const receipt = await receiptOrPending(record.hash);
    if (!receipt) throw new ManualReviewError(`Receipt ${record.hash} disappeared`);
    const contract =
      label === "model.createShell" ? marketplace : label === "sample.register" ? registry : engine;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === eventName) return BigInt(parsed.args[argumentName]).toString();
      } catch {
        // Ignore logs emitted by the other contracts called during the transaction.
      }
    }
    throw new ManualReviewError(`${eventName} was not found in ${record.hash}`);
  };

  let changed = false;
  if (checkpoint.progress.modelId === undefined) {
    const value = await recover("model.createShell", "ModelShellCreated", "modelId");
    if (value !== undefined) {
      checkpoint.progress.modelId = value;
      changed = true;
    }
  }
  if (checkpoint.progress.sampleId === undefined) {
    const value = await recover("sample.register", "SampleRegistered", "sampleId");
    if (value !== undefined) {
      checkpoint.progress.sampleId = value;
      changed = true;
    }
  }
  if (checkpoint.progress.jobId === undefined) {
    const value = await recover("job.create", "JobCreated", "jobId");
    if (value !== undefined) {
      checkpoint.progress.jobId = value;
      changed = true;
    }
  }
  if (changed) writeCheckpoint(checkpointPath, checkpoint);
}

async function readProgress(
  checkpoint: SweepCheckpoint,
  signerAddress: string,
  inputs: SweepInputs,
  registry: any,
  marketplace: any,
  engine: any
): Promise<ProgressSnapshot> {
  const progress: ProgressSnapshot = {
    modelExists: false,
    uploadedModelWeights: 0,
    modelFinalized: false,
    sampleExists: false,
    jobExists: false,
    nextCalculationGroup: 0,
    jobComplete: false,
    jobFinalized: false,
  };

  if (checkpoint.progress.modelId !== undefined) {
    const modelId = BigInt(checkpoint.progress.modelId);
    const modelCount = BigInt(
      await retryRpcRead("model count", () => marketplace.modelCount())
    );
    if (modelId >= modelCount) throw new Error(`Checkpoint model ${modelId} does not exist`);
    const header: any = await retryRpcRead<any>(`model ${modelId} header`, () =>
      marketplace.getModelHeader(modelId)
    );
    const owner = String(header[0]);
    const isPrivate = Boolean(header[1]);
    const finalized = Boolean(header[2]);
    const weightCount = Number(header[3]);
    const uploadGroupSize = Number(header[4]);
    const calculationGroupSize = Number(header[5]);
    const uploadedWeightCount = Number(header[7]);
    const manifestHash = String(header[9]);
    const sourceModelHash = String(header[10]);
    const weightZeroPoint = BigInt(header[11]);
    const scoreOffset = BigInt(header[12]);
    if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
      throw new Error(`Model ${modelId} is not owned by the configured signer`);
    }
    if (isPrivate) throw new Error(`Model ${modelId} is private; this runner is public-only`);
    if (
      weightCount !== inputs.vectorLength ||
      uploadGroupSize !== MODEL_UPLOAD_GROUP_SIZE ||
      calculationGroupSize !== inputs.calculationGroupSize
    ) {
      throw new Error(`Model ${modelId} has incompatible group geometry`);
    }
    if (
      manifestHash.toLowerCase() !== inputs.provenance.manifestHash.toLowerCase() ||
      sourceModelHash.toLowerCase() !== inputs.provenance.sourceModelHash.toLowerCase()
    ) {
      throw new Error(`Model ${modelId} does not match the selected source files`);
    }
    if (
      weightZeroPoint !== inputs.quantized.weightZeroPoint ||
      scoreOffset !== inputs.quantized.scoreOffset
    ) {
      throw new Error(`Model ${modelId} has incompatible score conversion values`);
    }
    if (uploadedWeightCount < 0 || uploadedWeightCount > inputs.vectorLength) {
      throw new Error(`Model ${modelId} has an invalid uploaded-weight count`);
    }
    if (
      uploadedWeightCount !== inputs.vectorLength &&
      uploadedWeightCount % MODEL_UPLOAD_GROUP_SIZE !== 0
    ) {
      throw new Error(`Model ${modelId} stopped at a non-resumable publication boundary`);
    }
    progress.modelExists = true;
    progress.uploadedModelWeights = uploadedWeightCount;
    progress.modelFinalized = finalized;
  }

  if (checkpoint.progress.sampleId !== undefined) {
    const sampleId = BigInt(checkpoint.progress.sampleId);
    const sampleCount = BigInt(
      await retryRpcRead("sample count", () => registry.sampleCount())
    );
    if (sampleId >= sampleCount) throw new Error(`Checkpoint sample ${sampleId} does not exist`);
    const manifestHash = String(
      await retryRpcRead(`sample ${sampleId} manifest`, () =>
        registry.getSampleManifestHash(sampleId)
      )
    );
    const hasAccess = Boolean(
      await retryRpcRead(`sample ${sampleId} access`, () =>
        registry.hasAccess(sampleId, signerAddress)
      )
    );
    if (manifestHash.toLowerCase() !== inputs.provenance.genotypeManifestHash.toLowerCase()) {
      throw new Error(`Sample ${sampleId} does not match the selected genotype file`);
    }
    if (!hasAccess) throw new Error(`The configured signer cannot use sample ${sampleId}`);
    progress.sampleExists = true;
  }

  if (checkpoint.progress.jobId !== undefined) {
    if (checkpoint.progress.modelId === undefined || checkpoint.progress.sampleId === undefined) {
      throw new Error("Checkpoint job has no associated model or sample");
    }
    const jobId = BigInt(checkpoint.progress.jobId);
    const jobCount = BigInt(await retryRpcRead("job count", () => engine.jobCount()));
    if (jobId >= jobCount) throw new Error(`Checkpoint job ${jobId} does not exist`);
    const state: any = await retryRpcRead<any>(`job ${jobId} state`, () =>
      engine.getJobState(jobId)
    );
    const modelId = BigInt(state[0]);
    const requester = String(state[1]);
    const weightCount = Number(state[2]);
    const calculationGroupSize = Number(state[4]);
    const chunkCount = Number(state[5]);
    const uploadedSnpCount = Number(state[6]);
    const snpsFinalized = Boolean(state[7]);
    const nextChunkIndex = Number(state[8]);
    const processedWeights = Number(state[9]);
    const isPrivate = Boolean(state[10]);
    const complete = Boolean(state[11]);
    const sampleId = BigInt(state[12]);
    const expectedProcessed = Math.min(
      nextChunkIndex * inputs.calculationGroupSize,
      inputs.vectorLength
    );
    if (
      modelId !== BigInt(checkpoint.progress.modelId) ||
      sampleId !== BigInt(checkpoint.progress.sampleId) ||
      requester.toLowerCase() !== signerAddress.toLowerCase() ||
      weightCount !== inputs.vectorLength ||
      calculationGroupSize !== inputs.calculationGroupSize ||
      chunkCount !== Math.ceil(inputs.vectorLength / inputs.calculationGroupSize) ||
      isPrivate
    ) {
      throw new Error(`Job ${jobId} does not match this public-weight sweep`);
    }
    if (uploadedSnpCount !== 0 || snpsFinalized) {
      throw new Error(`Job ${jobId} used the Classic method, not the Streaming method`);
    }
    if (processedWeights !== expectedProcessed) {
      throw new Error(`Job ${jobId} has inconsistent calculation progress`);
    }
    const cancelled = Boolean(
      await retryRpcRead(`job ${jobId} cancellation`, () => engine.isJobCancelled(jobId))
    );
    if (cancelled) throw new Error(`Job ${jobId} was cancelled`);
    progress.jobExists = true;
    progress.nextCalculationGroup = nextChunkIndex;
    progress.jobComplete = complete;
    progress.jobFinalized = Boolean(
      await retryRpcRead(`job ${jobId} finalization`, () => engine.isJobFinalized(jobId))
    );
  }
  return progress;
}

async function verifyPublicWeights(
  modelId: bigint,
  inputs: SweepInputs,
  marketplace: any
): Promise<void> {
  const groups = chunkBigIntVector(inputs.quantized.weights, inputs.calculationGroupSize);
  for (let index = 0; index < groups.length; index++) {
    const onChain: any = await retryRpcRead<any>(
      `model ${modelId} weight group ${index}`,
      () => marketplace.getPublicWeightChunk(modelId, index)
    );
    const expected = groups[index];
    if (onChain.length !== expected.length) {
      throw new Error(`Model ${modelId} weight group ${index} has the wrong length`);
    }
    for (let offset = 0; offset < expected.length; offset++) {
      if (BigInt(onChain[offset]) !== expected[offset]) {
        throw new Error(
          `Model ${modelId} differs from the source at position ` +
            `${index * inputs.calculationGroupSize + offset}`
        );
      }
    }
  }
}

async function recoverScoreHandle(
  checkpoint: SweepCheckpoint,
  checkpointPath: string,
  engine: any
): Promise<string> {
  if (checkpoint.progress.scoreHandle) return checkpoint.progress.scoreHandle;
  if (checkpoint.progress.jobId === undefined) throw new Error("No job is available");
  const jobId = BigInt(checkpoint.progress.jobId);
  const finalizeRecord = [...checkpoint.transactions]
    .reverse()
    .find((item) => item.label === "job.finalize");

  if (finalizeRecord) {
    const receipt = await receiptOrPending(finalizeRecord.hash);
    if (receipt) {
      for (const log of receipt.logs) {
        try {
          const parsed = engine.interface.parseLog(log);
          if (parsed?.name === "JobFinalized" && BigInt(parsed.args.jobId) === jobId) {
            checkpoint.progress.scoreHandle = String(parsed.args.encodedScore);
            writeCheckpoint(checkpointPath, checkpoint);
            return checkpoint.progress.scoreHandle;
          }
        } catch {
          // Ignore unrelated logs.
        }
      }
    }
  }

  const fromBlock = checkpoint.transactions.find((item) => item.label === "job.create")
    ?.blockNumber ?? 0;
  const filter = engine.filters.JobFinalized(jobId, checkpoint.configuration.signer);
  const events: any[] = await retryRpcRead<any[]>(
    `JobFinalized event for job ${jobId}`,
    () => engine.queryFilter(filter, fromBlock, "latest")
  );
  if (events.length !== 1) {
    throw new ManualReviewError(
      `Expected one JobFinalized event for job ${jobId}, found ${events.length}`
    );
  }
  checkpoint.progress.scoreHandle = String(events[0].args.encodedScore);
  writeCheckpoint(checkpointPath, checkpoint);
  return checkpoint.progress.scoreHandle;
}

async function runSweep(): Promise<void> {
  const size = parseSnpCount(process.env.SNP_COUNT);
  const calculationGroupSize = parseCalculationGroupSize(process.env.GROUP_SIZE);
  const capacityOnly = envFlag("CAPACITY_ONLY");
  const maximumNewTransactions = parseInteger(
    "MAX_NEW_TRANSACTIONS",
    process.env.MAX_NEW_TRANSACTIONS ?? "0",
    { minimum: 0, maximum: 10_000 }
  );
  const balanceCheckMode = fundingCheckMode(
    process.env.ALLOW_RESUMABLE_FUNDING,
    maximumNewTransactions
  );
  const inputs = loadSweepInputs(size, calculationGroupSize);
  const geometry = streamingTransactionGeometry(
    inputs.vectorLength,
    calculationGroupSize
  );

  const network = await retryRpcRead("network", () => ethers.provider.getNetwork());
  if (network.chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(
      `This runner requires Sepolia chainId ${SEPOLIA_CHAIN_ID}; connected to ${network.chainId}`
    );
  }
  if (!capacityOnly) {
    await fhevm.initializeCLIApi();
    if (fhevm.isMock) throw new Error("This runner refuses mock FHE mode");
  }

  const [signer] = await ethers.getSigners();
  const deployment = loadDeployment();
  const runtimeCode = await deployedRuntimeCode(deployment.value.contracts);
  requireRecordedRuntimeCode(deployment.value, runtimeCode);
  const registry: any = await ethers.getContractAt(
    "GenomicRegistry",
    deployment.value.contracts.GenomicRegistry,
    signer
  );
  const marketplace: any = await ethers.getContractAt(
    "ModelMarketplace",
    deployment.value.contracts.ModelMarketplace,
    signer
  );
  const engine: any = await ethers.getContractAt(
    "PRSComputeEngine",
    deployment.value.contracts.PRSComputeEngine,
    signer
  );

  const [engineMarketplace, engineRegistry] = await Promise.all([
    retryRpcRead("engine marketplace", () => engine.marketplace()),
    retryRpcRead("engine registry", () => engine.registry()),
  ]);
  if (
    String(engineMarketplace).toLowerCase() !==
      deployment.value.contracts.ModelMarketplace.toLowerCase() ||
    String(engineRegistry).toLowerCase() !==
      deployment.value.contracts.GenomicRegistry.toLowerCase()
  ) {
    throw new Error("The deployed engine does not reference the recorded registry and marketplace");
  }

  const configuration: SweepConfigurationRecord = {
    chainId: network.chainId.toString(),
    signer: signer.address,
    snpCount: size,
    vectorLength: inputs.vectorLength,
    leadingConstantIncluded: true,
    modelUploadGroupSize: MODEL_UPLOAD_GROUP_SIZE,
    calculationGroupSize,
    expectedCalculationGroups: geometry.calculationGroups,
    manifestHash: inputs.provenance.manifestHash,
    sourceModelHash: inputs.provenance.sourceModelHash,
    genotypeManifestHash: inputs.provenance.genotypeManifestHash,
    expectedEncodedScore: inputs.expected.toString(),
    independentReferenceEncodedScore: inputs.referenceEncodedScore.toString(),
    contracts: deployment.value.contracts,
  };
  const paths = checkpointPaths(signer.address, size, calculationGroupSize);
  let checkpoint: SweepCheckpoint;
  if (fs.existsSync(paths.checkpoint)) {
    checkpoint = JSON.parse(fs.readFileSync(paths.checkpoint, "utf8")) as SweepCheckpoint;
    validateCheckpoint(checkpoint, configuration, runtimeCode);
  } else {
    checkpoint = {
      schema: "bioeth-prs/sepolia-streaming-sweep-checkpoint/1",
      status: "in-progress",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      configuration,
      runtimeCode,
      progress: {},
      transactions: [],
    };
  }

  if (!capacityOnly) {
    if (signer.address.toLowerCase() === DEFAULT_HARDHAT_DEPLOYER) {
      throw new Error(
        "Refusing a Sepolia write with the public Hardhat mnemonic. Configure a funded private mnemonic."
      );
    }
    if (process.env.CONFIRM_SEPOLIA_SWEEP !== "YES") {
      throw new Error(
        "No transaction was submitted. Set CONFIRM_SEPOLIA_SWEEP=YES after reviewing CAPACITY_ONLY=1 output."
      );
    }
    acquireWriteLock(paths.lock);
    const failedReceipt = checkpoint.transactions.find(
      (transaction) => transaction.status === 0
    );
    if (failedReceipt && process.env.ACK_FAILED_TRANSACTION !== "YES") {
      throw new ManualReviewError(
        `${failedReceipt.label} reverted in ${failedReceipt.hash}. ` +
          "Inspect the cause before setting ACK_FAILED_TRANSACTION=YES for a deliberate resume."
      );
    }
  }

  console.log(`Network             : Sepolia (${network.chainId})`);
  console.log(`Signer              : ${signer.address}`);
  console.log(`Fixture             : ${size} variants + one leading constant`);
  console.log(`Model publication   : groups of ${MODEL_UPLOAD_GROUP_SIZE}`);
  console.log(`Streaming calculation: groups of ${calculationGroupSize}`);
  console.log(`Expected score      : ${inputs.expected}`);
  console.log(`Transactions (fresh): ${geometry.total}`);
  console.log(
    `Funding check       : ${
      balanceCheckMode === "limited-current-batch"
        ? `current batch (maximum ${maximumNewTransactions} transactions)`
        : "all remaining transactions"
    }`
  );
  console.log(`Checkpoint          : ${paths.checkpoint}`);

  if (!capacityOnly && !fs.existsSync(paths.checkpoint)) {
    writeCheckpoint(paths.checkpoint, checkpoint);
  }

  let submittedThisProcess = 0;
  const ensureSubmissionAllowed = () => {
    if (
      maximumNewTransactions > 0 &&
      submittedThisProcess >= maximumNewTransactions
    ) {
      throw new SweepPausedError(
        `Reached MAX_NEW_TRANSACTIONS=${maximumNewTransactions}; resume with the same configuration.`
      );
    }
  };

  const submitTransaction = async (
    label: string,
    snapshot: ProgressSnapshot,
    send: (nonce: number) => Promise<any>
  ): Promise<any> => {
    ensureSubmissionAllowed();
    const fullPlan = calculateRemainingPlan(
      inputs.vectorLength,
      inputs.calculationGroupSize,
      snapshot
    );
    const submissionsLeftInBatch = maximumNewTransactions - submittedThisProcess;
    const balancePlan =
      balanceCheckMode === "limited-current-batch"
        ? limitPlanToCurrentBatch(fullPlan, submissionsLeftInBatch)
        : fullPlan;
    const assessment = await assertBalanceForPlan(signer.address, balancePlan);
    console.log(
      `  Balance preflight: ${ethers.formatEther(assessment.balanceWei)} ETH available; ` +
        `${ethers.formatEther(assessment.requiredWei)} ETH required for ${
          balanceCheckMode === "limited-current-batch"
            ? `the ${balancePlan.totalTransactions} transaction(s) left in this batch`
            : "all remaining work"
        }`
    );
    const [latestNonce, pendingNonce] = await Promise.all([
      retryRpcRead("latest signer nonce", () =>
        ethers.provider.getTransactionCount(signer.address, "latest")
      ),
      retryRpcRead("pending signer nonce", () =>
        ethers.provider.getTransactionCount(signer.address, "pending")
      ),
    ]);
    if (latestNonce !== pendingNonce) {
      throw new ManualReviewError(
        `Signer has an unrelated pending transaction (latest nonce ${latestNonce}, ` +
          `pending nonce ${pendingNonce}); refusing concurrent submission.`
      );
    }

    checkpoint.pendingTransaction = {
      label,
      nonce: pendingNonce,
      intendedAt: new Date().toISOString(),
    };
    checkpoint.status = "in-progress";
    writeCheckpoint(paths.checkpoint, checkpoint);

    let transaction: any;
    try {
      // Submission itself is intentionally not retried: an RPC failure after
      // broadcast can be ambiguous, and retrying could duplicate a paid action.
      transaction = await send(pendingNonce);
    } catch (error) {
      checkpoint.status = "manual-review";
      checkpoint.lastError = errorSummary(error);
      writeCheckpoint(paths.checkpoint, checkpoint);
      throw new ManualReviewError(
        `${label} submission did not return a transaction hash. Nonce ${pendingNonce} ` +
          "must be inspected before resuming."
      );
    }
    checkpoint.pendingTransaction.hash = transaction.hash;
    checkpoint.pendingTransaction.submittedAt = new Date().toISOString();
    writeCheckpoint(paths.checkpoint, checkpoint);
    submittedThisProcess++;

    const receipt = await waitForReceipt(transaction.hash);
    const block = await retryRpcRead(`block ${receipt.blockNumber}`, () =>
      ethers.provider.getBlock(receipt.blockNumber)
    );
    recordReceipt(
      checkpoint,
      checkpoint.pendingTransaction,
      receipt,
      Number(block?.timestamp ?? 0)
    );
    checkpoint.pendingTransaction = undefined;
    if (receipt.status !== 1) {
      checkpoint.status = "failed";
      writeCheckpoint(paths.checkpoint, checkpoint);
      throw new Error(`${label} reverted in ${transaction.hash}`);
    }
    checkpoint.status = "in-progress";
    checkpoint.lastError = undefined;
    writeCheckpoint(paths.checkpoint, checkpoint);
    return receipt;
  };

  try {
    if (!capacityOnly) {
      await reconcilePendingTransaction(checkpoint, paths.checkpoint);
      await recoverCreatedIdentifiers(
        checkpoint,
        paths.checkpoint,
        registry,
        marketplace,
        engine
      );
    }

    let snapshot = await readProgress(
      checkpoint,
      signer.address,
      inputs,
      registry,
      marketplace,
      engine
    );
    const initialPlan = calculateRemainingPlan(
      inputs.vectorLength,
      inputs.calculationGroupSize,
      snapshot
    );
    const initialBalancePlan =
      balanceCheckMode === "limited-current-batch"
        ? limitPlanToCurrentBatch(initialPlan, maximumNewTransactions)
        : initialPlan;
    const initialAssessment = await assessBalance(signer.address, initialBalancePlan);

    if (capacityOnly) {
      const capacityReport = {
        mode: "capacity-only",
        checkedAt: new Date().toISOString(),
        network: { name: "sepolia", chainId: network.chainId.toString() },
        signer: signer.address,
        publicHardhatMnemonicDetected:
          signer.address.toLowerCase() === DEFAULT_HARDHAT_DEPLOYER,
        deploymentFile: deployment.path,
        configuration,
        geometry,
        progress: snapshot,
        remainingPlan: initialPlan,
        fundingCheck: {
          mode: balanceCheckMode,
          maximumNewTransactions:
            balanceCheckMode === "limited-current-batch"
              ? maximumNewTransactions
              : null,
          balancePlan: initialBalancePlan,
        },
        balance: {
          balanceWei: initialAssessment.balanceWei,
          balanceEth: ethers.formatEther(initialAssessment.balanceWei),
          feeBasisWei: initialAssessment.feeBasisWei,
          reserveWei: initialAssessment.reserveWei,
          headroomBps: initialAssessment.headroomBps,
          requiredWei: initialAssessment.requiredWei,
          requiredEth: ethers.formatEther(initialAssessment.requiredWei),
          affordable: initialAssessment.affordable,
          maximumCalculationGroupsAfterFixedCosts:
            initialAssessment.maximumCalculationGroupsAfterFixedCosts,
        },
        pendingTransaction: checkpoint.pendingTransaction ?? null,
        runtimeCode,
        transactionSubmissionEnabled: false,
      };
      atomicWriteJson(paths.capacity, capacityReport);
      console.log(`Capacity report      : ${paths.capacity}`);
      console.log(
        `Balance assessment   : ${initialAssessment.affordable ? "sufficient" : "insufficient"}`
      );
      return;
    }

    if (!snapshot.modelExists) {
      await submitTransaction("model.createShell", snapshot, (nonce) =>
        marketplace.createModelShell(
          false,
          BigInt(inputs.vectorLength),
          BigInt(MODEL_UPLOAD_GROUP_SIZE),
          BigInt(inputs.calculationGroupSize),
          `ipfs://heprs/${size}`,
          inputs.provenance.manifestHash,
          inputs.provenance.sourceModelHash,
          inputs.quantized.weightZeroPoint,
          inputs.quantized.scoreOffset,
          { nonce }
        )
      );
      await recoverCreatedIdentifiers(
        checkpoint,
        paths.checkpoint,
        registry,
        marketplace,
        engine
      );
      snapshot = await readProgress(
        checkpoint,
        signer.address,
        inputs,
        registry,
        marketplace,
        engine
      );
    }

    const modelId = BigInt(checkpoint.progress.modelId!);
    const modelGroups = chunkBigIntVector(
      inputs.quantized.weights,
      MODEL_UPLOAD_GROUP_SIZE
    );
    while (snapshot.uploadedModelWeights < inputs.vectorLength) {
      const groupIndex = Math.floor(
        snapshot.uploadedModelWeights / MODEL_UPLOAD_GROUP_SIZE
      );
      await submitTransaction(`model.appendPublicGroup.${groupIndex}`, snapshot, (nonce) =>
        marketplace.appendPublicModelChunk(modelId, modelGroups[groupIndex], { nonce })
      );
      snapshot = await readProgress(
        checkpoint,
        signer.address,
        inputs,
        registry,
        marketplace,
        engine
      );
    }

    if (!snapshot.modelFinalized) {
      await submitTransaction("model.finalize", snapshot, (nonce) =>
        marketplace.finalizeModel(modelId, { nonce })
      );
      snapshot = await readProgress(
        checkpoint,
        signer.address,
        inputs,
        registry,
        marketplace,
        engine
      );
    }
    console.log("Verifying all published public weights by read-only calls...");
    await verifyPublicWeights(modelId, inputs, marketplace);

    if (!snapshot.sampleExists) {
      await submitTransaction("sample.register", snapshot, (nonce) =>
        registry.registerSampleWithManifest(
          `ipfs://heprs/${size}/individual/0`,
          inputs.provenance.genotypeManifestHash,
          { nonce }
        )
      );
      await recoverCreatedIdentifiers(
        checkpoint,
        paths.checkpoint,
        registry,
        marketplace,
        engine
      );
      snapshot = await readProgress(
        checkpoint,
        signer.address,
        inputs,
        registry,
        marketplace,
        engine
      );
    }

    const sampleId = BigInt(checkpoint.progress.sampleId!);
    if (!snapshot.jobExists) {
      await submitTransaction("job.create", snapshot, (nonce) =>
        engine.createPRSJob(modelId, sampleId, { nonce })
      );
      await recoverCreatedIdentifiers(
        checkpoint,
        paths.checkpoint,
        registry,
        marketplace,
        engine
      );
      snapshot = await readProgress(
        checkpoint,
        signer.address,
        inputs,
        registry,
        marketplace,
        engine
      );
    }

    const jobId = BigInt(checkpoint.progress.jobId!);
    const snpGroups = chunkBigIntVector(inputs.snps, inputs.calculationGroupSize);
    while (!snapshot.jobComplete) {
      ensureSubmissionAllowed();
      const groupIndex = snapshot.nextCalculationGroup;
      const values = snpGroups[groupIndex];
      const encrypted = await retryTransientRelayerOperation(
        `SNP input group ${groupIndex + 1}/${snpGroups.length}`,
        async () => {
          const input = fhevm.createEncryptedInput(
            deployment.value.contracts.PRSComputeEngine,
            signer.address
          );
          for (const value of values) input.add64(value);
          return input.encrypt({ timeout: 300_000 });
        },
        {
          onRetry: ({ attempt, maxAttempts, delayMs, errorName }) => {
            console.warn(
              `  input group ${groupIndex}: temporary ${errorName}; retry ` +
                `${attempt + 1}/${maxAttempts} in ${delayMs}ms`
            );
          },
        }
      );
      await submitTransaction(`job.appendAndComputeGroup.${groupIndex}`, snapshot, (nonce) =>
        engine.appendAndComputeChunk(jobId, encrypted.handles, encrypted.inputProof, {
          nonce,
        })
      );
      snapshot = await readProgress(
        checkpoint,
        signer.address,
        inputs,
        registry,
        marketplace,
        engine
      );
      console.log(`  calculation group ${groupIndex + 1}/${snpGroups.length} confirmed`);
    }

    if (!snapshot.jobFinalized) {
      await submitTransaction("job.finalize", snapshot, (nonce) =>
        engine.finalize(jobId, { nonce })
      );
      snapshot = await readProgress(
        checkpoint,
        signer.address,
        inputs,
        registry,
        marketplace,
        engine
      );
    }
    const scoreHandle = await recoverScoreHandle(
      checkpoint,
      paths.checkpoint,
      engine
    );
    const decrypted = await retryTransientRelayerOperation(
      "score user decryption",
      () =>
        fhevm.userDecryptEuint(
          FhevmType.euint64,
          scoreHandle,
          deployment.value.contracts.PRSComputeEngine,
          signer
        ),
      {
        onRetry: ({ attempt, maxAttempts, delayMs, errorName }) => {
          console.warn(
            `  score decryption: temporary ${errorName}; retry ` +
              `${attempt + 1}/${maxAttempts} in ${delayMs}ms`
          );
        },
      }
    );
    if (decrypted !== inputs.expected || decrypted !== inputs.referenceEncodedScore) {
      throw new Error(
        `Decoded score ${decrypted} does not match the exact independent result ` +
          `${inputs.referenceEncodedScore}`
      );
    }

    const verifiedTransactions = await verifySavedTransactionsOnSepolia(checkpoint);
    const totalGas = verifiedTransactions.transactions.reduce(
      (sum, transaction) => sum + BigInt(transaction.gasUsed),
      0n
    );
    const report = {
      schema: "bioeth-prs/sepolia-streaming-sweep-report/1",
      status: "complete",
      network: { name: "sepolia", chainId: network.chainId.toString() },
      startedAt: checkpoint.startedAt,
      completedAt: new Date().toISOString(),
      configuration,
      progress: checkpoint.progress,
      result: {
        expectedEncodedScore: inputs.expected,
        independentReferenceEncodedScore: inputs.referenceEncodedScore,
        decodedEncodedScore: decrypted,
        exactMatch: true,
        decryptionMethod: "userDecryptEuint",
      },
      transactionCount: verifiedTransactions.transactions.length,
      totalGas,
      transactionVerification: verifiedTransactions.summary,
      transactions: verifiedTransactions.transactions,
      existingDeployment: {
        sourceFile: deployment.path,
        runtimeCode,
      },
      runnerSource: hashedInput("sepolia_streaming_sweep", __filename),
      provenance: await buildProvenance({
        model: inputs.provenance,
        contracts: [
          await contractIdentity("GenomicRegistry", registry),
          await contractIdentity("ModelMarketplace", marketplace),
          await contractIdentity("PRSComputeEngine", engine),
        ],
        referenceOutputPath: inputs.referencePath,
      }),
    };
    atomicWriteJson(paths.report, report);
    checkpoint.status = "complete";
    checkpoint.lastError = undefined;
    writeCheckpoint(paths.checkpoint, checkpoint);
    console.log(`Decoded score        : ${decrypted}`);
    console.log(`Report               : ${paths.report}`);
  } catch (error) {
    if (capacityOnly) throw error;
    checkpoint.lastError = errorSummary(error);
    if (error instanceof SweepPausedError) checkpoint.status = "paused";
    else if (error instanceof AwaitingReceiptError) checkpoint.status = "awaiting-receipt";
    else if (error instanceof ManualReviewError) checkpoint.status = "manual-review";
    else checkpoint.status = "failed";
    writeCheckpoint(paths.checkpoint, checkpoint);
    if (error instanceof SweepPausedError) {
      console.log(error.message);
      return;
    }
    throw error;
  }
}

export async function main(): Promise<void> {
  await runSweep();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
