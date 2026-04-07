# Quantization and Signed-Weight Encoding

PRS weights are signed floats. fhEVM uses unsigned integer types. This document explains how to bridge that gap safely.

---

## The Problem

Three things are true simultaneously:
1. PRS weights (`beta_i`) are typically signed floats (can be negative)
2. fhEVM arithmetic operates on unsigned encrypted integers (`euint64`)
3. On-chain arithmetic must stay inside safe bounds or it silently overflows

A naive "just multiply by a scale factor" approach fails because negative weights produce negative integers, which can't be stored in `euint64`.

---

## V1 Solution: Three-Step Unsigned Encoding

### Step 1 — Scale to integers

Convert floating-point weights using a per-model scale factor:

```
q_i = round(scale × beta_i)
```

The scale is chosen per model based on weight distribution and SNP count (see [Choosing a Scale](#choosing-a-scale)).

### Step 2 — Shift to unsigned (weightZeroPoint)

Find the most-negative quantized weight and shift everything up:

```
weightZeroPoint = -min(q_i)
u_i = q_i + weightZeroPoint       # u_i ≥ 0 for all i
```

The contract stores `u_i`. The raw dot-product of `g_i × u_i` is no longer the true PRS — it includes a constant contribution from the shift. The contract also tracks the sum of all genotype dosages to correct for this:

```
geno_sum = Σ g_i
raw_score_q = Σ(g_i × u_i) - weightZeroPoint × geno_sum
```

### Step 3 — Shift score to unsigned (scoreOffset)

The recovered `raw_score_q` can still be negative (for a user with many risk-decreasing alleles). To keep the final result in unsigned space for comparison against thresholds:

```
scoreOffset = -raw_min    where raw_min = Σ(2 × min(q_i, 0))
encoded_score = raw_score_q + scoreOffset
```

The encoded score is always non-negative and lives in `[0, encoded_range]`.

To recover the human-readable score after decryption:

```
raw_score_q = encoded_score - scoreOffset
final_score  = raw_score_q / scale
```

### On-chain implementation

```solidity
// In PRSComputeEngine.finalize():
euint64 withOffset  = FHE.add(job.partialSum, FHE.asEuint64(job.scoreOffset));
euint64 correction  = FHE.mul(job.genoSum, FHE.asEuint64(job.weightZeroPoint));
euint64 encodedScore = FHE.sub(withOffset, correction);
```

The rearrangement `(partialSum + scoreOffset) - (weightZeroPoint × genoSum)` avoids an unsigned underflow that would occur if `raw_score_q` were computed as an intermediate step.

---

## Worked Example

**Setup:** 3 SNPs, weights `[-0.30, 0.10, 0.25]`, scale = 100

**Step 1 — quantize:**
```
q = [-30, 10, 25]
```

**Step 2 — shift weights:**
```
weightZeroPoint = 30
u = [0, 40, 55]
```

**Step 3 — compute for user with genotypes [0, 2, 1]:**
```
Σ(g_i × u_i) = 0×0 + 2×40 + 1×55 = 135
geno_sum      = 0 + 2 + 1 = 3
raw_score_q   = 135 - 30×3 = 45
```

**Step 4 — encode:**
```
raw_min     = 2×min(-30,0) + 2×min(10,0) + 2×min(25,0) = -60
scoreOffset = 60
encoded     = 45 + 60 = 105
```

**Decode after decryption:**
```
raw_score_q = 105 - 60 = 45
final_score = 45 / 100 = 0.45   ✓  (matches plain dot-product: 0×-0.30 + 2×0.10 + 1×0.25)
```

---

## Overflow Safety

The safe uint64 bound is:

```
encoded_range = raw_max - raw_min ≤ 2^64 - 1  (~1.8 × 10^19)

where:
  raw_max = Σ(2 × max(q_i, 0))
  raw_min = Σ(2 × min(q_i, 0))
```

At scale 10^8 and 5,000 SNPs with max single-weight magnitude 1.0:
- `raw_max ≈ 2 × 10^8 × 5,000 = 10^12`
- Well within `uint64` range ✓

Do not use `scale × 2 × N_snps` as your only check — compute exact bounds from the actual quantized weight vector. The quantization advisor (`npm run advisor:quantization`) does this automatically.

---

## Choosing a Scale

Run the advisor before publishing any model:

```bash
npm run advisor:quantization BETA_FILE.csv GENOTYPE_FILE.csv
```

The advisor outputs three recommendations:
- **baseline** — small scale (~10²), lowest gas, highest quantization error (~15% MAE for HEPRS fixtures)
- **balanced** — scale ~10⁶, effectively machine-epsilon error on HEPRS fixtures, recommended default
- **max_precision** — larger scale, no observed quality improvement over balanced on current fixtures

Use **balanced** as your default. The bottleneck on gas cost is SNP upload count, not scale choice.

---

## Manifest Metadata

Every published model should include these fields in its `manifestURI` document:

| Field | Purpose |
|---|---|
| `weightScale` | Scale factor used |
| `weightZeroPoint` | Shift applied to weights |
| `scoreOffset` | Shift applied to final score |
| `rawMin` / `rawMax` | Exact encoded score bounds |
| `encodedRange` | `raw_max - raw_min` |
| `genotypeMode` | `hardcall_0_1_2` (v1) |
| `accumulatorBits` | 64 (v1) |
| `thresholdsEncoded` | Oracle thresholds in encoded domain |
| `sourceModelHash` | Hash of upstream GWAS file |

The contract stores `weightZeroPoint` and `scoreOffset` in `ModelHeader` — they are passed through to `PRSComputeEngine` at job creation and applied in `finalize()`.

---

## V2 Extensions (not yet implemented)

- **Private encrypted weights:** same encoding, weights stored as `euint64` instead of `uint64`
- **Smaller storage types:** `euint16` intermediates where safe, wider accumulator only when needed
- **Decimal dosages:** imputed genotypes (e.g., 1.73) require quantizing dosages too, folding bounds into overflow analysis
- **DP threshold alignment:** encoded thresholds must account for the DP noise upward bias of `noiseUpperBound / 2`

---

## References

- PGS Catalog scoring conventions: https://www.pgscatalog.org/downloads/
- PLINK 2.0 scoring: https://www.cog-genomics.org/plink/2.0/score
- Zama supported encrypted types: https://docs.zama.org/protocol/solidity-guides/smart-contract/types
- Zama HCU cost guide: https://docs.zama.org/protocol/solidity-guides/development-guide/hcu
- HEPRS reference paper: `docs/PIIS2667237525003078.pdf`
