# HEPRS Advisor Findings

## Scope

This note captures the current quantization-advisor results after copying the HEPRS reference fixtures for:

* `100` SNPs
* `500` SNPs
* `1000` SNPs
* `5000` SNPs

Each run used:

```bash
npm run advisor:quantization -- <beta.csv> <genotype.csv>
```

with the copied HEPRS beta row and genotype rows under `test/fixtures/heprs/`.

The genotype rows are optional in the advisor. We used them here only to get empirical float-vs-quantized error metrics on reference-like data.

## Recommendation Summary

| Fixture | Weights | Baseline | Balanced | Max Precision | Current mock-contract status |
|---|---:|---|---|---|---|
| `100 SNP` | `101` | `scale=100`, `8/8` bits, `MAE=1.21e-2` | `scale=3e6`, `16/32` bits, `MAE=2.84e-18` | `scale=1e7`, `32/32` bits, `MAE=2.84e-18` | Full on-chain mock path passes |
| `500 SNP` | `501` | `scale=100`, `8/16` bits, `MAE=4.33e-2` | `scale=3e6`, `16/32` bits, `MAE=2.11e-17` | `scale=1e7`, `32/32` bits, `MAE=2.11e-17` | Full on-chain mock path passes |
| `1000 SNP` | `1001` | `scale=100`, `8/16` bits, `MAE=6.88e-2` | `scale=1e6`, `16/32` bits, `MAE=5.51e-17` | `scale=1e7`, `32/32` bits, `MAE=5.51e-17` | Full on-chain mock path passes |
| `5000 SNP` | `5001` | `scale=100`, `8/16` bits, `MAE=1.50e-1` | `scale=1e6`, `16/32` bits, `MAE=2.49e-16` | `scale=1e7`, `32/32` bits, `MAE=2.49e-16` | Current `ModelMarketplace.listPublicModel` path still runs out of gas |

Bit pairs above are `weightBits/accumulatorBits`.

## Balanced-Candidate Bound Snapshot

| Fixture | Balanced scale | `weightZeroPoint` | `scoreOffset` | `encodedRange` | `maxIntermediate` | Required bits |
|---|---:|---:|---:|---:|---:|---|
| `100 SNP` | `3e6` | `28,602` | `747,156` | `1,455,624` | `6,486,072` | `16/32` |
| `500 SNP` | `3e6` | `28,602` | `3,393,756` | `6,859,560` | `32,125,008` | `16/32` |
| `1000 SNP` | `1e6` | `11,604` | `2,293,040` | `4,651,594` | `25,589,762` | `16/32` |
| `5000 SNP` | `1e6` | `11,604` | `11,042,232` | `22,181,798` | `127,202,774` | `16/32` |

## Main Findings

### 1. `baseline` is useful as a floor, not as the likely deployment choice

Across all four fixtures, the baseline recommendation stayed very cheap:

* `8-bit` weights in every case
* `8-bit` accumulator for `100 SNP`
* `16-bit` accumulator for `500+ SNP`

That compactness comes with visible information loss:

* `MAE` grows from about `0.012` at `100 SNP`
* to about `0.150` at `5000 SNP`
* worst-case error bound grows from `1.01` to `50.01`

Interpretation: `baseline` is valuable as a comparison point, but it looks too lossy to be the default choice for HEPRS-like public PRS models.

### 2. `balanced` is the strongest current default

The balanced recommendation stayed impressively stable:

* `16-bit` weights across all four fixtures
* `32-bit` accumulator across all four fixtures
* empirical error at machine-epsilon scale on every run

The advisor stepped down from `3e6` to `1e6` as the fixture size grew from `500` to `1000+` SNPs, which is the behavior we want: preserve fidelity, but back off the scale when the total model gets bigger.

Interpretation: for the current `uint64[]` / `euint64[]` marketplace shape, `balanced` is the best first candidate to standardize around.

### 3. `max_precision` adds width, but not practical quality on these fixtures

`max_precision` increased the weight width from `16-bit` to `32-bit`, but it did not improve observed empirical error on the copied HEPRS rows:

* `100 SNP`: same `MAE` as balanced
* `500 SNP`: same `MAE` as balanced
* `1000 SNP`: same `MAE` as balanced
* `5000 SNP`: same `MAE` as balanced

Interpretation: on these fixtures, `balanced` already reaches the point where extra scale is not buying a meaningful accuracy improvement. That makes `max_precision` more of a future opt-in mode than a default.

### 4. The advisor math scales further than the current upload path

All four advisor runs produced:

* `11` evaluated scales
* `11` valid scales
* `0` rejected scales

So from a quantization and bound-analysis perspective, the HEPRS fixtures are easy to support.

The contract path is the current bottleneck, not the advisor:

* `100`, `500`, and `1000` SNP fixtures pass the full mock `ModelMarketplace -> PRSComputeEngine` flow
* `5000` SNP fixture still hits an out-of-gas boundary when listing the public model in the current marketplace storage shape

Interpretation: the next scaling problem is model publication/storage, not the advisor’s quantization logic.

## Practical Recommendation

For the repo’s current phase:

* keep `baseline` as a visible low-cost reference point
* treat `balanced` as the likely default recommendation for HEPRS-like public models
* keep `max_precision` available, but do not assume it is worth the extra width unless a future dataset shows a real accuracy gain
* prioritize redesigning large-model upload/storage before claiming `5000 SNP` marketplace support on-chain

## Related Validation

Current local validation now covers:

* full on-chain mock fixture checks for `100`, `500`, and `1000` SNPs
* local chunked math equivalence for `5000` SNPs
* an explicit test documenting the current marketplace gas boundary at `5000` SNPs
* advisor tests across all four fixture sizes
