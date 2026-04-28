export interface ScaleCeilingRow {
  scale: bigint;
  genotypeMax: bigint;
  maxAbsQuantizedWeight: bigint;
  maxEncodedRangePerSnp: bigint;
  maxIntermediatePerSnp: bigint;
  maxIntermediateAt5000Snps: bigint;
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
    // Formal conservative bound for the contract's unsigned encoding:
    //   q_i = round(S * beta_i), assume |q_i| <= S
    //   z = max(0, -min(q_i))
    //   shifted_i = q_i + z
    //   encoded = sum(g_i * shifted_i) + scoreOffset - z * sum(g_i)
    //
    // With genotype dosage g_i <= M and mixed-sign weights, the largest
    // intermediate before the final subtraction is bounded by 2 * M * S per SNP.
    // The final encoded range itself is bounded by M * S per SNP.
    const maxAbsQuantizedWeight = scale;
    const maxEncodedRangePerSnp = genotypeMax * maxAbsQuantizedWeight;
    const maxIntermediatePerSnp = 2n * genotypeMax * maxAbsQuantizedWeight;
    return {
      scale,
      genotypeMax,
      maxAbsQuantizedWeight,
      maxEncodedRangePerSnp,
      maxIntermediatePerSnp,
      maxIntermediateAt5000Snps: 5000n * maxIntermediatePerSnp,
      safeSnpCeiling: UINT64_MAX / maxIntermediatePerSnp
    };
  });
}

export function renderScaleCeilingsMarkdown(
  rows: ScaleCeilingRow[]
): string {
  const lines = [
    "Assumptions:",
    "- max genotype dosage = 2",
    "- max absolute quantized signed weight per SNP ~= scaling factor",
    "- conservative unsigned-encoding intermediate bound = 2 × dosage max × scale × SNPs",
    `- uint64 max = ${formatBigInt(UINT64_MAX)}`,
    "",
    "| Scaling factor | Max intermediate at 5,000 SNPs | Safe SNP ceiling under uint64 |",
    "|---|---:|---:|"
  ];

  for (const row of rows) {
    const power = row.scale.toString().length - 1;
    lines.push(
      `| \`10^${power}\` | \`${formatBigInt(row.maxIntermediateAt5000Snps)}\` | \`${formatBigInt(row.safeSnpCeiling)}\` |`
    );
  }

  return lines.join("\n");
}

if (require.main === module) {
  const rows = computeScaleCeilings();
  console.log(renderScaleCeilingsMarkdown(rows));
}
