# Quantization Advisor Capability

## Purpose

This project needs a standalone capability that helps a model publisher decide how to transform a floating-point PRS model into an unsigned integer representation that is safe for our current on-chain pipeline.

We call that capability the **Quantization Advisor**.

Its job is not to mutate or store models on-chain. Its job is to act as a **preflight compiler and recommender** before a model is uploaded.

At this stage of the project, the advisor exists for three reasons:

1. We want to choose scales based on evidence, not guesswork.
2. We want to reject unsafe encodings before they ever touch the contracts.
3. We want a repeatable artifact that a model lab, reviewer, or marketplace can inspect.

---

## Where it fits in our flow

The current direction of the repo is:

1. Start from the original HEPRS-style float weights and reference data.
2. Build confidence in our integer PRS math in mock mode first.
3. Introduce a production-oriented quantization and signed-weight encoding design.
4. Only then wire that into the blockchain model upload flow.

The advisor belongs between steps 2 and 4.

### Current intended flow

1. A model lab begins with:
   * float PRS weights
   * optional validation genotype rows
   * desired deployment mode (public or private)
2. The advisor analyzes candidate scales.
3. The advisor returns recommended quantization candidates such as:
   * `baseline`
   * `balanced`
   * `max_precision`
4. The model lab chooses one candidate and produces:
   * quantized weights
   * encoding metadata
   * a small validation report
5. That quantized representation is what gets uploaded to the blockchain stack.

The network should not silently decide how to quantize a scientific model after the fact.

---

## Why this should be off-chain first

The advisor should be a standalone off-chain capability, not a contract feature.

Reasons:

* It needs to search across many possible scales.
* It works with floating-point numbers and ranking logic.
* It may use validation datasets to estimate approximation error.
* Gas and cost assumptions change over time.
* Model publishers need to experiment before upload.

That makes it a bad fit for on-chain execution.

The better split is:

* **Model lab / publisher** uses the advisor to prepare the model.
* **Contracts / marketplace** later validate the cheap invariants of the chosen encoding.
* **Reviewers / indexers** can independently rerun the advisor and compare outputs.

### Current standalone form in this repo

The advisor currently lives as:

* `scripts/quantization_advisor.ts`

It can be run with:

```bash
npm run advisor:quantization -- <weights.csv> [genotypes.csv]
```

If genotype rows are supplied, the report also includes validation error metrics.

By default, the CLI now prints a concise human-friendly summary.

Use:

```bash
npm run advisor:quantization -- <weights.csv> [genotypes.csv] --verbose
```

to print the full JSON report.

Use:

```bash
npm run advisor:quantization -- <weights.csv> [genotypes.csv] --out advisor-report.json
```

to save the full JSON report to a file while still showing the concise console summary.

---

## What the advisor should evaluate

Given a model, the advisor should examine many candidate scales and compute:

* signed quantized weights
* shifted unsigned weights
* score offset
* exact score range
* the smallest safe accumulator type
* a cost estimate based on a supplied or default gas model
* quantization error metrics when genotype validation rows are available

This allows it to answer the real question:

> "What are the safest and most useful quantization choices for this model under our current blockchain constraints?"

---

## Inputs

At this stage, the advisor should accept:

* `weights`
  * the raw float beta values
* `validationGenotypes` (optional)
  * genotype rows to compare float scores vs quantized scores
* `genotypeMax`
  * `2` for hardcall genotypes
* `candidateScales`
  * a list of scales to test
* `safetyMarginRatio`
  * extra headroom on top of computed bounds
* `targetMode`
  * `public` or `private`
* `gasModel` (optional)
  * relative cost assumptions for different bit widths

---

## Outputs

The advisor should return:

* all valid candidate scales
* rejected candidate scales with reasons
* three recommended categories:
  * `baseline`
  * `balanced`
  * `max_precision`

### How to read the three recommendation buckets

* `baseline`
  * the lowest-width / lowest-cost reference point that still fits
  * useful as a floor for comparison, but often too lossy for final scientific use
* `balanced`
  * the current likely default choice when we want strong fidelity without paying for the widest representation
* `max_precision`
  * the highest-scale candidate that still fits the current safety checks
  * useful when preserving tiny float effects matters more than cost

For each candidate it should report:

* `scale`
* `weightZeroPoint`
* `scoreOffset`
* `rawMin`
* `rawMax`
* `encodedRange`
* `weightedSumMax`
* `correctionMax`
* `requiredWeightBits`
* `requiredAccumulatorBits`
* `worstCaseErrorBound`
* `estimatedCostUnits`
* validation error metrics if genotype rows were provided

---

## How we are thinking of using it right now

At the current project stage, the advisor is not yet a mandatory part of model upload. It is a **decision support tool** and a **research-to-production bridge**.

Right now we want it for:

* understanding what scale choices are even feasible
* making the tradeoff between precision and cost visible
* grounding our docs in something concrete
* helping us design the eventual model manifest

Later, once the encoding path stabilizes, it can become part of the model publication workflow.

---

## Long-term usage model

The likely long-term workflow is:

1. Model lab runs advisor locally.
2. Advisor generates a recommended manifest and report.
3. Model lab uploads quantized model + manifest.
4. Marketplace or contract validates invariant fields.
5. Off-chain clients can re-run the advisor or verify the manifest independently.

This keeps scientific ownership with the model lab while still allowing network-level safety checks.

---

## Why the network should not own quantization alone

If the network silently transforms weights before storing them, several problems appear:

* scientific meaning becomes harder to audit
* thresholds and interpretation may drift
* provenance becomes weaker
* responsibility becomes unclear if a model is encoded poorly

So our current thinking is:

* **publisher chooses and declares**
* **advisor helps**
* **network validates**

That is a healthier split of responsibility.

---

## Relationship to the broader repo

This capability complements:

* `docs/design/quantization-design.md`
  * explains the encoding design itself
* HEPRS-based fixtures in `test/fixtures/heprs/`
  * give us real reference weights and genotype rows
* mock-mode Solidity tests
  * validate that our on-chain math matches the chosen integer formulation

So the advisor is not a side utility. It is part of the path from:

* float research model
to
* bounded integer encoding
to
* uploadable blockchain model

---

## Near-term expectation

In the short term, we should treat the advisor as:

* a standalone capability
* a reusable analysis module
* something that can be run on HEPRS fixture data
* a source of recommended scale candidates, not a final authority

That is enough to make it useful now without prematurely locking the full upload flow.

---

## Future expansion of the cost model

The current advisor uses a simple heuristic cost model so it can rank candidates in a stable way without pretending to know exact live-chain gas costs.

A more detailed future model might separate:

* storage cost
* multiplication cost
* addition cost
* correction cost for zero-point
* public vs private weight mode
* chunking overhead

That would let the advisor evolve from a useful early-stage ranking tool into something much closer to a deployment-planning tool.

In a future production version, the gas model would also likely depend explicitly on execution mode:

* public weights using `mulPlain`
* private weights using encrypted `mul`
* different cost curves for each mode

That is an important next step because the advisor should eventually reflect not just bit widths, but also the actual arithmetic path the contracts will take.
