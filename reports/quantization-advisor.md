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
5. Checks whether `scale × 2 × N_snps` overflows `uint64` (max ~1.8×10¹⁹)
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

### Quick-screen formula

Simplified bound: `scale × 2 × N_snps ≤ uint64_max`. Assumes all weights have magnitude ≤ 1 (conservative; actual HEPRS weights are much smaller).

| Scale | Safe SNP ceiling |
|-------|-----------------|
| 10² | 9.2 × 10¹⁶ |
| 10⁴ | 9.2 × 10¹⁴ |
| 10⁶ | 9.2 × 10¹² |
| 10⁸ | 9.2 × 10¹⁰ |
| 10¹⁰ | 9.2 × 10⁸ |
| 10¹² | 921,000 |

At `balanced` scale 10⁶ and 5,000 SNPs: max accumulation ~10¹³. Comfortable margin.
At `max_precision` scale 10¹⁰ and 5,000 SNPs: max accumulation ~10¹⁴. Still within bounds.

Use the advisor's exact bounds (from actual weight distributions) rather than this table for production decisions.

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
