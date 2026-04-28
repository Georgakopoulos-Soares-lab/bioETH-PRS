# Quantization Advisor Results

**Date:** 5 April 2026
**Fixtures:** HEPRS 100 / 500 / 1,000 / 5,000 SNP beta files
**Method:** `npm run advisor:quantization` — sweeps candidate float-to-uint64 scale values and reports precision loss and overflow risk

---

## What the Advisor Does

GWAS beta weights are signed floating-point values (~−0.5 to +0.5). TFHE operates on unsigned `uint64`. The advisor:

1. Loads the real HEPRS beta file for a given fixture size
2. Evaluates candidate scale values (10², 10⁴, 10⁶, 10⁸, 10¹⁰, 10¹²…)
3. For each scale, computes the quantized dot product against all 50 individuals in the fixture
4. Reports mean absolute error (MAE) vs the plaintext float dot product
5. Checks whether the contract's largest unsigned intermediate overflows
   `uint64` (max ~1.8×10¹⁹)
6. Recommends `baseline` / `balanced` / `max_precision` tiers

Runtime: 0.2-0.26 s across all fixture sizes. Safe to run before every model publication.

---

## Scale Tier Recommendations

Consistent across all four fixture sizes:

| Tier | Scale | Error vs plaintext | Recommended for |
|------|-------|-------------------|-----------------|
| `baseline` | ~10² | 1-15% MAE | Proof-of-concept only; too lossy for clinical use |
| `balanced` | ~10⁶ (3×10⁶ for 100/500 SNP; 10⁶ for 1,000/5,000 SNP) | Machine epsilon | **Default for all production models** |
| `max_precision` | ~10⁸-10¹⁰ | Machine epsilon | No improvement over `balanced` on HEPRS fixtures |

**Use `balanced`.** The bottleneck is SNP upload transaction count and gas cost — not scale precision. Increasing beyond `balanced` adds no clinical benefit and raises the risk of approaching overflow ceilings.

### Per-fixture balanced recommendations

| SNPs | Scale | Required weight bits | Required accumulator bits |
|------|-------|---------------------|--------------------------|
| 100 | 3,000,000 | 16 | 32 |
| 500 | 3,000,000 | 16 | 32 |
| 1,000 | 1,000,000 | 16 | 32 |
| 5,000 | 1,000,000 | 16 | 32 |

All within `uint64` budget (64 bits). No overflow risk at these scales and SNP counts.

---

## Overflow Safety

All 11 evaluated scale candidates pass the overflow check for all fixture sizes. The `uint64` ceiling (~1.8×10¹⁹) is not the limiting factor.

### Formal overflow bound

The contract does not accumulate signed values directly. It uses:

```text
q_i = round(S × beta_i)
z = max(0, -min_i(q_i))
shifted_i = q_i + z
partialSum = Σ g_i × shifted_i
genoSum = Σ g_i
encoded = partialSum + scoreOffset - z × genoSum
```

For genotype dosage `0 ≤ g_i ≤ M` and `|q_i| ≤ Q`, the final encoded score is
bounded by `M × N × Q`, while the largest intermediate
`partialSum + scoreOffset` is conservatively bounded by `2 × M × N × Q`.

Using `Q = S` for a quick screen, `M = 2`, and `uint64_max = 2^64 - 1`:

```text
safe_N = floor(uint64_max / (2 × M × S))
       = floor(uint64_max / (4 × S))
```

This is deliberately conservative. The advisor computes the exact
`maxIntermediate` from the actual quantized weight distribution and should be
used for production manifests.

| Scale | Safe SNP ceiling |
|-------|-----------------|
| 10² | 4.6 × 10¹⁶ |
| 10⁴ | 4.6 × 10¹⁴ |
| 10⁶ | 4.6 × 10¹² |
| 10⁸ | 4.6 × 10¹⁰ |
| 10¹⁰ | 4.6 × 10⁸ |
| 10¹² | 4,611,686 |

At `balanced` scale 10⁶ and 5,000 SNPs, the conservative intermediate bound is
`2 × 2 × 10^6 × 5,000 = 2 × 10^10`, far below `uint64_max`.
At `max_precision` scale 10¹⁰ and 5,000 SNPs, the bound is `2 × 10^14`, still
well within `uint64`.

The 5,000-SNP fixture is therefore not the theoretical overflow ceiling. It is
the largest bundled HEPRS fixture we validate end to end. Gas/HCU cost is the
practical ceiling in this prototype, not `uint64` arithmetic capacity.

---

## V1 Quantization Correction Verification

The encoded score formula is `(partialSum + scoreOffset) − (weightZeroPoint × genoSum)`. The advisor verifies this correction is overflow-safe for all 50 individuals in each fixture:

| Fixture | Individuals checked | Negative encoded scores | Overflow (> uint64_max) |
|---------|--------------------|--------------------------|-----------------------|
| 100 SNP | 50 | 0 | 0 |
| 500 SNP | 50 | 0 | 0 |
| 1,000 SNP | 50 | 0 | 0 |
| 5,000 SNP | 50 | 0 | 0 |

All 200 individual-fixture combinations pass. The V1 correction formula is validated.

---

## Notes

- The `baseline` tier is intentionally low to illustrate information loss. It is never appropriate for clinical use — 15% MAE is equivalent to misclassifying borderline patients.
- `max_precision` adds no benefit because the HEPRS fixture betas are already representable at `balanced` precision; the limiting factor is the number of significant digits in the source data, not the scale.
- Advisor runtime is effectively flat (~0.2 s) because the computation is pure TypeScript with no contract calls.
