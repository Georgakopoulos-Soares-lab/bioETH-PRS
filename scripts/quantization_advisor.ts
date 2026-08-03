import fs from "fs";
import path from "path";
import { roundHalfAwayFromZero } from "./utils/exact";

export type TargetMode = "public" | "private";
export type RecommendationTier = "baseline" | "balanced" | "max_precision";
export type GenotypeMode = "hardcall_0_1_2";

export interface EncodedThresholds {
  low: bigint;
  high: bigint;
}

export interface GasModel {
  weightBitCost: Record<number, number>;
  accumulatorBitCost: Record<number, number>;
}

export interface AdvisorInput {
  weights: number[];
  validationGenotypes?: number[][];
  genotypeMax?: number;
  candidateScales?: number[];
  safetyMarginRatio?: number;
  targetMode?: TargetMode;
  gasModel?: GasModel;
}

export interface ValidationMetrics {
  sampleCount: number;
  meanAbsoluteError: number;
  rootMeanSquaredError: number;
  maxAbsoluteError: number;
}

export interface QuantizationCandidate {
  scale: number;
  targetMode: TargetMode;
  quantizedWeights: bigint[];
  shiftedWeights: bigint[];
  weightZeroPoint: bigint;
  rawMin: bigint;
  rawMax: bigint;
  scoreOffset: bigint;
  encodedRange: bigint;
  weightedSumMax: bigint;
  correctionMax: bigint;
  maxIntermediate: bigint;
  requiredWeightBits: number;
  requiredAccumulatorBits: number;
  estimatedCostUnits: number;
  worstCaseErrorBound: number;
  validation?: ValidationMetrics;
}

export interface RejectedScale {
  scale: number;
  reason: string;
}

export interface AdvisorReport {
  inputSummary: {
    targetMode: TargetMode;
    weightCount: number;
    genotypeMax: number;
    safetyMarginRatio: number;
    evaluatedScaleCount: number;
  };
  validCandidates: QuantizationCandidate[];
  rejectedScales: RejectedScale[];
  recommendations: Partial<Record<RecommendationTier, QuantizationCandidate>>;
}

export interface QuantizationManifest {
  weightScale: number;
  weightZeroPoint: bigint;
  scoreOffset: bigint;
  rawMin: bigint;
  rawMax: bigint;
  encodedRange: bigint;
  maxIntermediate: bigint;
  genotypeMode: GenotypeMode;
  accumulatorBits: number;
  weightCount: number;
  thresholdsEncoded?: EncodedThresholds;
  sourceModelHash: string;
}

interface CliOptions {
  verbose: boolean;
  outPath?: string;
}

const UNSIGNED_BIT_WIDTHS = [8, 16, 32, 64, 128, 256] as const;

const DEFAULT_GAS_MODEL: GasModel = {
  // Heuristic cost units. These are not chain gas numbers; they are a stable
  // relative ranking so we can compare candidate encodings before wiring in a
  // more exact cost model.
  weightBitCost: {
    8: 1.0,
    16: 1.4,
    32: 2.1,
    64: 3.0,
    128: 5.6,
    256: 9.5
  },
  accumulatorBitCost: {
    8: 0.2,
    16: 0.3,
    32: 0.5,
    64: 0.8,
    128: 1.6,
    256: 3.2
  }
};

const DEFAULT_SCALES = [
  1e2,
  3e2,
  1e3,
  3e3,
  1e4,
  3e4,
  1e5,
  3e5,
  1e6,
  3e6,
  1e7
];

function assertFiniteNumber(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
}

export function loadNumericCsv(filePath: string): number[][] {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return [];
  }

  return raw.split(/\r?\n/).map((line) => (
    line.split(",").map((value) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid numeric value "${value}" in ${filePath}`);
      }
      return parsed;
    })
  ));
}

export function loadWeightsFromCsv(filePath: string): number[] {
  const rows = loadNumericCsv(filePath);
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one weight row in ${filePath}`);
  }
  return rows[0];
}

export function loadGenotypesFromCsv(filePath: string): number[][] {
  return loadNumericCsv(filePath);
}

function bigintAbs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function bigintMax(lhs: bigint, rhs: bigint): bigint {
  return lhs > rhs ? lhs : rhs;
}

function inferUnsignedBits(maxValue: bigint): number {
  for (const bits of UNSIGNED_BIT_WIDTHS) {
    if (maxValue <= ((1n << BigInt(bits)) - 1n)) {
      return bits;
    }
  }

  throw new Error(`Value ${maxValue.toString()} exceeds uint256`);
}

function applySafetyMargin(value: bigint, ratio: number): bigint {
  assertFiniteNumber(ratio, "Safety margin ratio");
  if (ratio < 0) {
    throw new Error("Safety margin ratio must be >= 0");
  }

  const RATIO_SCALE = 1_000_000n;
  const scaledRatio = BigInt(Math.ceil(ratio * Number(RATIO_SCALE)));
  const margin = ((value * scaledRatio) + (RATIO_SCALE - 1n)) / RATIO_SCALE;
  return value + margin;
}

function computeValidationMetrics(
  weights: number[],
  quantizedWeights: bigint[],
  validationGenotypes: number[][],
  scale: number
): ValidationMetrics {
  let absSum = 0;
  let squaredSum = 0;
  let maxAbs = 0;

  for (const row of validationGenotypes) {
    if (row.length !== weights.length) {
      throw new Error("Validation genotype row length mismatch");
    }

    let floatScore = 0;
    let quantizedScore = 0;
    for (let i = 0; i < weights.length; i++) {
      floatScore += row[i] * weights[i];
      quantizedScore += row[i] * Number(quantizedWeights[i]);
    }

    const decodedScore = quantizedScore / scale;
    const absError = Math.abs(floatScore - decodedScore);
    absSum += absError;
    squaredSum += absError * absError;
    maxAbs = Math.max(maxAbs, absError);
  }

  const sampleCount = validationGenotypes.length;
  return {
    sampleCount,
    meanAbsoluteError: absSum / sampleCount,
    rootMeanSquaredError: Math.sqrt(squaredSum / sampleCount),
    maxAbsoluteError: maxAbs
  };
}

function estimateCostUnits(
  weightCount: number,
  weightBits: number,
  accumulatorBits: number,
  gasModel: GasModel
): number {
  return (
    (weightCount * gasModel.weightBitCost[weightBits]) +
    (weightCount * gasModel.accumulatorBitCost[accumulatorBits])
  );
}

function buildCandidate(
  weights: number[],
  scale: number,
  genotypeMax: number,
  safetyMarginRatio: number,
  targetMode: TargetMode,
  gasModel: GasModel,
  validationGenotypes?: number[][]
): QuantizationCandidate {
  const quantizedWeights = weights.map((weight) => {
    assertFiniteNumber(weight, "Weight");
    return BigInt(roundHalfAwayFromZero(weight * scale));
  });

  let minWeight = quantizedWeights[0];
  let maxWeight = quantizedWeights[0];
  let positiveContribution = 0n;
  let negativeContribution = 0n;

  for (const weight of quantizedWeights) {
    if (weight < minWeight) {
      minWeight = weight;
    }
    if (weight > maxWeight) {
      maxWeight = weight;
    }
    if (weight >= 0n) {
      positiveContribution += weight;
    } else {
      negativeContribution += weight;
    }
  }

  const gMax = BigInt(genotypeMax);
  const weightZeroPoint = minWeight < 0n ? -minWeight : 0n;
  const shiftedWeights = quantizedWeights.map((weight) => weight + weightZeroPoint);

  const rawMin = gMax * negativeContribution;
  const rawMax = gMax * positiveContribution;
  const scoreOffset = rawMin < 0n ? -rawMin : 0n;
  const encodedRange = rawMax - rawMin;

  const shiftedWeightSum = shiftedWeights.reduce((sum, weight) => sum + weight, 0n);
  const weightedSumMax = gMax * shiftedWeightSum;
  const correctionMax = weightZeroPoint * gMax * BigInt(weights.length);
  const maxIntermediate = bigintMax(weightedSumMax + scoreOffset, correctionMax);

  const boundedWeightMax = shiftedWeights.reduce((max, weight) => bigintMax(max, weight), 0n);
  const requiredWeightBits = inferUnsignedBits(
    applySafetyMargin(boundedWeightMax, safetyMarginRatio)
  );
  const requiredAccumulatorBits = inferUnsignedBits(
    applySafetyMargin(maxIntermediate, safetyMarginRatio)
  );

  const worstCaseErrorBound =
    (genotypeMax * weights.length * 0.5) / scale;

  const candidate: QuantizationCandidate = {
    scale,
    targetMode,
    quantizedWeights,
    shiftedWeights,
    weightZeroPoint,
    rawMin,
    rawMax,
    scoreOffset,
    encodedRange,
    weightedSumMax,
    correctionMax,
    maxIntermediate,
    requiredWeightBits,
    requiredAccumulatorBits,
    estimatedCostUnits: estimateCostUnits(
      weights.length,
      requiredWeightBits,
      requiredAccumulatorBits,
      gasModel
    ),
    worstCaseErrorBound
  };

  if (validationGenotypes && validationGenotypes.length > 0) {
    candidate.validation = computeValidationMetrics(
      weights,
      quantizedWeights,
      validationGenotypes,
      scale
    );
  }

  return candidate;
}

function chooseBalancedCandidate(
  candidates: QuantizationCandidate[]
): QuantizationCandidate | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  const minCost = Math.min(...candidates.map((candidate) => candidate.estimatedCostUnits));
  const maxCost = Math.max(...candidates.map((candidate) => candidate.estimatedCostUnits));
  const minScale = Math.min(...candidates.map((candidate) => candidate.scale));
  const maxScale = Math.max(...candidates.map((candidate) => candidate.scale));

  let best: QuantizationCandidate | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const normalizedCost =
      maxCost === minCost
        ? 0
        : (candidate.estimatedCostUnits - minCost) / (maxCost - minCost);
    const normalizedScale =
      maxScale === minScale
        ? 1
        : (candidate.scale - minScale) / (maxScale - minScale);

    const distance = Math.sqrt(
      Math.pow(normalizedCost - 0.5, 2) +
      Math.pow(normalizedScale - 0.5, 2)
    );

    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

export function adviseQuantization(input: AdvisorInput): AdvisorReport {
  const genotypeMax = input.genotypeMax ?? 2;
  const safetyMarginRatio = input.safetyMarginRatio ?? 0.10;
  const candidateScales = input.candidateScales ?? DEFAULT_SCALES;
  const targetMode = input.targetMode ?? "public";
  const gasModel = input.gasModel ?? DEFAULT_GAS_MODEL;

  if (input.weights.length === 0) {
    throw new Error("Advisor requires at least one weight");
  }

  const validCandidates: QuantizationCandidate[] = [];
  const rejectedScales: RejectedScale[] = [];

  for (const scale of candidateScales) {
    try {
      if (!(scale > 0)) {
        throw new Error("Scale must be positive");
      }

      const candidate = buildCandidate(
        input.weights,
        scale,
        genotypeMax,
        safetyMarginRatio,
        targetMode,
        gasModel,
        input.validationGenotypes
      );

      validCandidates.push(candidate);
    } catch (error) {
      rejectedScales.push({
        scale,
        reason: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  validCandidates.sort((lhs, rhs) => lhs.scale - rhs.scale);

  return {
    inputSummary: {
      targetMode,
      weightCount: input.weights.length,
      genotypeMax,
      safetyMarginRatio,
      evaluatedScaleCount: candidateScales.length
    },
    validCandidates,
    rejectedScales,
    recommendations: {
      baseline: validCandidates[0],
      balanced: chooseBalancedCandidate(validCandidates),
      max_precision: validCandidates[validCandidates.length - 1]
    }
  };
}

export function buildQuantizationManifest(
  candidate: QuantizationCandidate,
  sourceModelHash: string,
  thresholdsEncoded?: EncodedThresholds
): QuantizationManifest {
  return {
    weightScale: candidate.scale,
    weightZeroPoint: candidate.weightZeroPoint,
    scoreOffset: candidate.scoreOffset,
    rawMin: candidate.rawMin,
    rawMax: candidate.rawMax,
    encodedRange: candidate.encodedRange,
    maxIntermediate: candidate.maxIntermediate,
    genotypeMode: "hardcall_0_1_2",
    accumulatorBits: candidate.requiredAccumulatorBits,
    weightCount: candidate.quantizedWeights.length,
    thresholdsEncoded,
    sourceModelHash
  };
}

export function validateQuantizationManifest(
  manifest: QuantizationManifest
): void {
  if (manifest.genotypeMode !== "hardcall_0_1_2") {
    throw new Error("V1 manifests must declare genotypeMode=hardcall_0_1_2");
  }
  if (!(manifest.weightScale > 0)) {
    throw new Error("Manifest weightScale must be > 0");
  }
  if (manifest.weightCount <= 0) {
    throw new Error("Manifest weightCount must be > 0");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(manifest.sourceModelHash)) {
    throw new Error("Manifest sourceModelHash must be a 32-byte hex string");
  }
  if (manifest.rawMin > manifest.rawMax) {
    throw new Error("Manifest rawMin must be <= rawMax");
  }

  const expectedScoreOffset = manifest.rawMin < 0n ? -manifest.rawMin : 0n;
  if (manifest.scoreOffset !== expectedScoreOffset) {
    throw new Error("Manifest scoreOffset does not match rawMin");
  }

  const expectedEncodedRange = manifest.rawMax - manifest.rawMin;
  if (manifest.encodedRange !== expectedEncodedRange) {
    throw new Error("Manifest encodedRange does not match rawMin/rawMax");
  }

  const accumulatorLimit = (1n << BigInt(manifest.accumulatorBits)) - 1n;
  if (manifest.encodedRange > accumulatorLimit) {
    throw new Error("Manifest encodedRange exceeds accumulatorBits");
  }
  if (manifest.maxIntermediate > accumulatorLimit) {
    throw new Error("Manifest maxIntermediate exceeds accumulatorBits");
  }

  if (manifest.thresholdsEncoded) {
    const { low, high } = manifest.thresholdsEncoded;
    if (!(0n <= low && low < high && high <= manifest.encodedRange)) {
      throw new Error(
        "Encoded thresholds must satisfy 0 <= low < high <= encodedRange"
      );
    }
  }
}

function printUsage() {
  console.log(
    "Usage: ts-node scripts/quantization_advisor.ts <weights.csv> [genotypes.csv] [--verbose] [--out <file>]"
  );
}

export function stringifyReport(report: AdvisorReport): string {
  return JSON.stringify(
    report,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2
  );
}

function formatCandidateLine(
  label: string,
  candidate?: QuantizationCandidate
): string[] {
  if (!candidate) {
    return [`${label}: unavailable`];
  }

  const validationSummary = candidate.validation
    ? `, mae=${candidate.validation.meanAbsoluteError.toExponential(3)}, rmse=${candidate.validation.rootMeanSquaredError.toExponential(3)}`
    : "";

  return [
    `${label}:`,
    `  scale=${candidate.scale}`,
    `  weightBits=${candidate.requiredWeightBits}, accumulatorBits=${candidate.requiredAccumulatorBits}`,
    `  estCost=${candidate.estimatedCostUnits.toFixed(1)}, worstCaseErrorBound=${candidate.worstCaseErrorBound.toExponential(3)}${validationSummary}`
  ];
}

export function summarizeReport(report: AdvisorReport): string {
  const lines = [
    "Quantization advisor summary",
    `weights=${report.inputSummary.weightCount}, genotypeMax=${report.inputSummary.genotypeMax}, mode=${report.inputSummary.targetMode}`,
    `evaluated=${report.inputSummary.evaluatedScaleCount}, valid=${report.validCandidates.length}, rejected=${report.rejectedScales.length}`,
    ""
  ];

  lines.push(...formatCandidateLine("baseline", report.recommendations.baseline));
  lines.push("");
  lines.push(...formatCandidateLine("balanced", report.recommendations.balanced));
  lines.push("");
  lines.push(...formatCandidateLine("max_precision", report.recommendations.max_precision));

  if (report.rejectedScales.length > 0) {
    lines.push("");
    lines.push("Rejected scales:");
    for (const rejected of report.rejectedScales) {
      lines.push(`  scale=${rejected.scale}: ${rejected.reason}`);
    }
  }

  return lines.join("\n");
}

function parseCliArgs(argv: string[]): {
  weightsPath?: string;
  genotypesPath?: string;
  options: CliOptions;
} {
  const positional: string[] = [];
  const options: CliOptions = { verbose: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }

    if (arg === "--out") {
      const outPath = argv[i + 1];
      if (!outPath) {
        throw new Error("Missing value for --out");
      }
      options.outPath = outPath;
      i += 1;
      continue;
    }

    positional.push(arg);
  }

  return {
    weightsPath: positional[0],
    genotypesPath: positional[1],
    options
  };
}

if (require.main === module) {
  let parsed;
  try {
    parsed = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid CLI arguments");
    printUsage();
    process.exit(1);
  }

  const { weightsPath, genotypesPath, options } = parsed;

  if (!weightsPath) {
    printUsage();
    process.exit(1);
  }

  const resolvedWeights = path.resolve(process.cwd(), weightsPath);
  const resolvedGenotypes = genotypesPath
    ? path.resolve(process.cwd(), genotypesPath)
    : undefined;

  const report = adviseQuantization({
    weights: loadWeightsFromCsv(resolvedWeights),
    validationGenotypes: resolvedGenotypes
      ? loadGenotypesFromCsv(resolvedGenotypes)
      : undefined
  });

  const fullReport = stringifyReport(report);
  if (options.outPath) {
    const resolvedOut = path.resolve(process.cwd(), options.outPath);
    fs.writeFileSync(resolvedOut, `${fullReport}\n`, "utf8");
  }

  console.log(options.verbose ? fullReport : summarizeReport(report));
}
