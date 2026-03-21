export interface ScaleCeilingRow {
  scale: bigint;
  genotypeMax: bigint;
  maxPerSnpContribution: bigint;
  accumulationAt5000Snps: bigint;
  safeSnpCeiling: bigint;
}

const UINT64_MAX = (1n << 64n) - 1n;
const DEFAULT_GENOTYPE_MAX = 2n;
const DEFAULT_SCALES = [
  10n ** 2n,
  10n ** 3n,
  10n ** 4n,
  10n ** 5n,
  10n ** 6n,
  10n ** 7n,
  10n ** 8n,
  10n ** 9n,
  10n ** 10n,
  10n ** 11n,
  10n ** 12n
];

function formatBigInt(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function computeScaleCeilings(
  scales: bigint[] = DEFAULT_SCALES,
  genotypeMax: bigint = DEFAULT_GENOTYPE_MAX
): ScaleCeilingRow[] {
  return scales.map((scale) => {
    const maxPerSnpContribution = scale * genotypeMax;
    return {
      scale,
      genotypeMax,
      maxPerSnpContribution,
      accumulationAt5000Snps: 5000n * maxPerSnpContribution,
      safeSnpCeiling: UINT64_MAX / maxPerSnpContribution
    };
  });
}

export function renderScaleCeilingsMarkdown(
  rows: ScaleCeilingRow[]
): string {
  const lines = [
    "Assumptions:",
    "- max genotype dosage = 2",
    "- max quantized weight per SNP ~= scaling factor",
    `- uint64 max = ${formatBigInt(UINT64_MAX)}`,
    "",
    "| Scaling factor | Max accumulation at 5,000 SNPs | Safe SNP ceiling under uint64 |",
    "|---|---:|---:|"
  ];

  for (const row of rows) {
    const power = row.scale.toString().length - 1;
    lines.push(
      `| \`10^${power}\` | \`${formatBigInt(row.accumulationAt5000Snps)}\` | \`${formatBigInt(row.safeSnpCeiling)}\` |`
    );
  }

  return lines.join("\n");
}

if (require.main === module) {
  const rows = computeScaleCeilings();
  console.log(renderScaleCeilingsMarkdown(rows));
}
