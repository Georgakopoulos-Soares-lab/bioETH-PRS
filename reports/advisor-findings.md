# Quantization Advisor Findings

## Purpose

This report captures what the quantization advisor produced on the copied HEPRS reference fixtures and what those results mean for the current PRS implementation.

It focuses on:

* recommended scales
* required bit widths
* observed validation error
* what those tradeoffs imply for our model-upload path

For the advisor capability itself, see [docs/quantization-advisor.md](/Users/galano/Developer/patternforge/utexas-lab/bioeth-prs-project/bioETH-PRS/docs/quantization-advisor.md).

## How These Results Were Produced

We ran:

```bash
npm run advisor:quantization -- <beta.csv> <genotype.csv>
```

against the copied HEPRS fixtures under [test/fixtures/heprs](/Users/galano/Developer/patternforge/utexas-lab/bioeth-prs-project/bioETH-PRS/test/fixtures/heprs).

The advisor uses:

* the float beta row
* optional genotype rows for validation
* candidate scales
* bound inference
* a heuristic cost model

The genotype rows were used here only to compare float PRS outputs against quantized PRS outputs on reference-like data.

### Timing snapshot

Measured local wall-clock runtime per advisor command:

| Fixture | Command runtime |
|---|---:|
| `100 SNP` | `0.90s` |
| `500 SNP` | `0.91s` |
| `1000 SNP` | `0.91s` |
| `5000 SNP` | `0.96s` |

These are local script runtimes, not on-chain times and not gas costs.
For execution-path timing on the HEPRS-backed mock contract flow, see [reports/heprs-fixture-findings.md](/Users/galano/Developer/patternforge/utexas-lab/bioeth-prs-project/bioETH-PRS/reports/heprs-fixture-findings.md).

## Results

| Fixture | Weights | Baseline | Balanced | Max Precision |
|---|---:|---|---|---|
| `100 SNP` | `101` | `scale=100`, `8/8` bits, `MAE=1.21e-2` | `scale=3e6`, `16/32` bits, `MAE=2.84e-18` | `scale=1e7`, `32/32` bits, `MAE=2.84e-18` |
| `500 SNP` | `501` | `scale=100`, `8/16` bits, `MAE=4.33e-2` | `scale=3e6`, `16/32` bits, `MAE=2.11e-17` | `scale=1e7`, `32/32` bits, `MAE=2.11e-17` |
| `1000 SNP` | `1001` | `scale=100`, `8/16` bits, `MAE=6.88e-2` | `scale=1e6`, `16/32` bits, `MAE=5.51e-17` | `scale=1e7`, `32/32` bits, `MAE=5.51e-17` |
| `5000 SNP` | `5001` | `scale=100`, `8/16` bits, `MAE=1.50e-1` | `scale=1e6`, `16/32` bits, `MAE=2.49e-16` | `scale=1e7`, `32/32` bits, `MAE=2.49e-16` |

Bit pairs above are `weightBits/accumulatorBits`.

## Main Findings

### 1. `baseline` is a useful reference floor, but not the likely publication choice

Across all four fixtures, `baseline` stayed compact:

* `8-bit` weights in every case
* `8-bit` accumulator for `100 SNP`
* `16-bit` accumulator for `500+ SNP`

But accuracy degraded as the model grew:

* about `0.012` MAE at `100 SNP`
* about `0.150` MAE at `5000 SNP`

Interpretation: `baseline` is still worth keeping because it shows the low-cost edge of the tradeoff space, but it looks too lossy to be the default for HEPRS-like models.

### 2. `balanced` is the strongest current default

The balanced recommendation was stable and practical:

* `16-bit` weights across all four fixtures
* `32-bit` accumulator across all four fixtures
* empirical error at machine-epsilon scale on every run

It also adapted sensibly:

* `3e6` at `100` and `500`
* `1e6` at `1000` and `5000`

Interpretation: for the current project, `balanced` is the most credible first default to standardize around.

### 3. `max_precision` widened weights without improving observed quality here

`max_precision` increased the weight width from `16-bit` to `32-bit`, but did not improve observed error on these HEPRS rows.

Interpretation: on the copied HEPRS fixtures, `balanced` already preserves enough detail that pushing scale higher is not buying meaningful practical accuracy.

### 4. The advisor is not the scaling bottleneck

All four advisor runs produced:

* `11` evaluated scales
* `11` valid scales
* `0` rejected scales

Interpretation: quantization and bound-analysis are not what is stopping us from supporting larger HEPRS-like models. The current bottleneck is elsewhere in the contract flow.

### 5. Advisor runtime is effectively flat across the copied HEPRS fixtures

The command runtime stayed close to `~0.9s` from `100` to `5000` SNPs.

Interpretation:

* the current advisor is cheap to run
* local script startup and fixed overhead dominate more than the fixture size
* this is a good sign for making the advisor a routine pre-upload step for model labs

So the advisor is not only analytically helpful; it is also operationally lightweight.

## What It Means For The Project

These results suggest:

* the advisor should remain part of the model publication workflow
* `balanced` should be treated as the default recommendation until a stronger counterexample appears
* the current hardcoded `uint64[]` / `euint64[]` marketplace is conservative enough for these HEPRS fixtures
* scaling work should now focus more on contract storage and ingestion than on quantization itself

In short:

* the advisor is doing the right job
* the project should now spend more energy on scalable upload / ingestion / execution paths
