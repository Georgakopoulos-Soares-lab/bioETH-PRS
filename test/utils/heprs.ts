import fs from "fs";
import path from "path";

const HEPRS_FIXTURE_DIR = path.resolve(__dirname, "..", "fixtures", "heprs");
export const HEPRS_FIXTURE_SIZES = [100, 500, 1000, 5000] as const;
export type HeprsFixtureSize = typeof HEPRS_FIXTURE_SIZES[number];

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
  const offset = minWeight < 0 ? -minWeight : 0;

  return {
    scale,
    offset,
    weights: scaled.map((weight) => BigInt(weight + offset))
  };
}

export function toBigIntVector(values: number[]): bigint[] {
  return values.map((value) => BigInt(Math.round(value)));
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
