# Scaling Ceiling Findings

## Purpose

This report explains the quick overflow-screen results generated for the current unsigned-integer PRS path.

It is not the final authority for a real model. It is a fast planning tool that helps us answer:

* is a proposed scaling factor obviously unreasonable?
* roughly how many SNPs could fit under `uint64` if we make simple assumptions?

For the exact reference logic and generated table source, see [docs/reference/scaling-ceilings.md](/Users/galano/Developer/patternforge/utexas-lab/bioeth-prs-project/bioETH-PRS/docs/reference/scaling-ceilings.md).

## How These Results Were Produced

We generated the table with:

```bash
npm run advisor:scale-ceilings
```

The script in [scripts/scale_ceiling_reference.ts](/Users/galano/Developer/patternforge/utexas-lab/bioeth-prs-project/bioETH-PRS/scripts/scale_ceiling_reference.ts) uses the simplified screen:

```text
scale × max genotype dosage × N SNPs <= uint64 max
```

with:

* max genotype dosage = `2`
* `uint64 max = 2^64 - 1`
* max per-SNP quantized contribution approximated as `scale`

This is intentionally a rough screen. It does not include model-specific details like:

* the real weight vector
* zero-point correction
* score offset
* validation error

Those belong to the advisor report, not this one.

### Timing snapshot

Measured local wall-clock runtime for the report-generation command:

* `npm run advisor:scale-ceilings` → about `0.39s` real time

This timing is useful only as a local tooling reference. It is not an on-chain cost signal.

## Results

| Scaling factor | Max accumulation at 5,000 SNPs | Safe SNP ceiling under uint64 |
|---|---:|---:|
| `10^2` | `1,000,000` | `92,233,720,368,547,758` |
| `10^3` | `10,000,000` | `9,223,372,036,854,775` |
| `10^4` | `100,000,000` | `922,337,203,685,477` |
| `10^5` | `1,000,000,000` | `92,233,720,368,547` |
| `10^6` | `10,000,000,000` | `9,223,372,036,854` |
| `10^7` | `100,000,000,000` | `922,337,203,685` |
| `10^8` | `1,000,000,000,000` | `92,233,720,368` |
| `10^9` | `10,000,000,000,000` | `9,223,372,036` |
| `10^10` | `100,000,000,000,000` | `922,337,203` |
| `10^11` | `1,000,000,000,000,000` | `92,233,720` |
| `10^12` | `10,000,000,000,000,000` | `9,223,372` |

## What These Results Mean

### 1. The simple overflow story is less restrictive than it may sound

Even aggressive scales still look numerically feasible at `5,000` SNP under this simplified screen.

Examples:

* `scale = 10^8` gives `10^12` max accumulation at `5,000` SNPs
* `scale = 10^12` still gives only `10^16`

Both are below `uint64 max (~1.84 × 10^19)`.

That means the phrase “large scale” does not automatically imply overflow for the `5,000`-SNP regime.

### 2. The safe SNP ceiling falls predictably as scale rises

Every time the scale increases by a factor of `10`, the safe SNP ceiling drops by about a factor of `10`.

That makes the table useful for quick planning conversations:

* higher scale means more precision
* but it also shrinks the rough SNP headroom

### 3. This report is a planning screen, not a publication proof

These results do **not** mean that every real model at `scale = 10^12` is safe.

A real model also depends on:

* actual beta magnitudes
* signed-weight encoding
* `weightZeroPoint`
* `scoreOffset`
* the chosen accumulator width

So this report is best used to rule out obviously bad ideas quickly, not to certify a model for upload.

### 4. The script is effectively instantaneous at our current scale

At under half a second locally, the ceiling script is cheap enough to use as a routine sanity check during discussion, planning, or model review.

Interpretation: there is no operational reason to avoid running this screen often. The reason not to stop here is not speed, but lack of model specificity.

## What It Means For The Project

For our project, this report says:

* the `uint64` space is not immediately the problem for `5,000`-SNP models under simple assumptions
* choosing scale should not be done from ceiling data alone
* the next decision should always move from this quick screen into the advisor

In other words:

* use this report for fast sanity checks
* use the advisor report for actual model-facing decisions
