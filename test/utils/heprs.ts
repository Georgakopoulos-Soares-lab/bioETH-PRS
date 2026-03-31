import fs from "fs";
import path from "path";

const HEPRS_FIXTURE_DIR = path.resolve(__dirname, "..", "fixtures", "heprs");
export const HEPRS_FIXTURE_SIZES = [100, 500, 1000, 5000] as const;
export type HeprsFixtureSize = typeof HEPRS_FIXTURE_SIZES[number];

export interface HeprsAdvisorRecommendation {
  tier: "balanced";
  scale: number;
  requiredWeightBits: number;
  requiredAccumulatorBits: number;
}

// Static recommendations copied from reports/advisor-findings.md so tests do
// not rerun the advisor. These correspond to the current "balanced" default.
export const HEPRS_BALANCED_RECOMMENDATIONS = {
  100: {
    tier: "balanced",
    scale: 3_000_000,
    requiredWeightBits: 16,
    requiredAccumulatorBits: 32
  },
  500: {
    tier: "balanced",
    scale: 3_000_000,
    requiredWeightBits: 16,
    requiredAccumulatorBits: 32
  },
  1000: {
    tier: "balanced",
    scale: 1_000_000,
    requiredWeightBits: 16,
    requiredAccumulatorBits: 32
  },
  5000: {
    tier: "balanced",
    scale: 1_000_000,
    requiredWeightBits: 16,
    requiredAccumulatorBits: 32
  }
} as const satisfies Record<HeprsFixtureSize, HeprsAdvisorRecommendation>;

function parseNumericCsv(filePath: string): number[][] {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return [];
  }

  return raw.split(/\r?\n/).map((line) => (
    line.split(",").map((value) => Number(value))
  ));
}

export function loadHeprsFixture(size: HeprsFixtureSize) {
  const genotypePath = path.join(
    HEPRS_FIXTURE_DIR,
    `genotype_${size}SNP_50individual.csv`
  );
  const betaPath = path.join(
    HEPRS_FIXTURE_DIR,
    `beta_${size}SNP_phenotype0.csv`
  );

  const genotypes = parseNumericCsv(genotypePath);
  const betaRows = parseNumericCsv(betaPath);
  if (betaRows.length !== 1) {
    throw new Error("Expected exactly one beta row in HEPRS fixture");
  }

  return {
    genotypes,
    betas: betaRows[0]
  };
}

export function quantizeSignedWeightsToUint64(
  weights: number[],
  scale = 1_000_000
) {
  const scaled = weights.map((weight) => Math.round(weight * scale));
  const minWeight = Math.min(...scaled);
  const weightZeroPoint = minWeight < 0 ? BigInt(-minWeight) : 0n;

  // Exact worst-case minimum score: all SNPs at max dosage (2), only negative
  // weights contribute. scoreOffset = -rawMin lifts the score into [0, encodedRange].
  const rawMin = scaled.reduce((sum, q) => sum + 2 * Math.min(q, 0), 0);
  const scoreOffset = rawMin < 0 ? BigInt(-rawMin) : 0n;

  return {
    scale,
    weightZeroPoint,
    scoreOffset,
    weights: scaled.map((weight) => BigInt(weight) + weightZeroPoint)
  };
}

export function getHeprsBalancedRecommendation(
  size: HeprsFixtureSize
): HeprsAdvisorRecommendation {
  return HEPRS_BALANCED_RECOMMENDATIONS[size];
}

export function quantizeHeprsWeightsWithRecommendation(
  size: HeprsFixtureSize,
  weights: number[]
) {
  const recommendation = getHeprsBalancedRecommendation(size);

  return {
    recommendation,
    ...quantizeSignedWeightsToUint64(weights, recommendation.scale)
  };
}

export function toBigIntVector(values: number[]): bigint[] {
  return values.map((value) => BigInt(Math.round(value)));
}

export function chunkBigIntVector(
  values: bigint[],
  chunkLength: number
): bigint[][] {
  if (!Number.isInteger(chunkLength) || chunkLength <= 0) {
    throw new Error("Chunk length must be a positive integer");
  }

  const chunks: bigint[][] = [];
  for (let start = 0; start < values.length; start += chunkLength) {
    chunks.push(values.slice(start, start + chunkLength));
  }
  return chunks;
}

export function dotProductBigInt(
  lhs: bigint[],
  rhs: bigint[]
): bigint {
  if (lhs.length !== rhs.length) {
    throw new Error("Dot product length mismatch");
  }

  return lhs.reduce((sum, value, index) => sum + (value * rhs[index]), 0n);
}
