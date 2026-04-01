# V1 Quantization and Signed-Weight Encoding Design

## Why this document exists

This project must turn real-valued PRS model weights into integer values that can be used inside fhEVM-style encrypted arithmetic. That sounds simple at first ("just multiply by a scale"), but there are three real problems:

1. PRS weights are usually **signed floats** and can be negative.
2. fhEVM production arithmetic is currently centered around **unsigned encrypted integer types**.
3. On-chain arithmetic must stay inside safe numeric bounds or it can silently overflow.

This document describes a production-oriented path for handling those problems in a way that is compatible with:

* PRS conventions from research and scoring tooling.
* Integer/FHE constraints on-chain.
* Future migration from local mock mode to real fhEVM execution.

It intentionally goes beyond a demo trick. The goal is a design we can defend later in audits, benchmarking, and model governance.

---

## Big picture

The original HEPRS paper uses CKKS and can work directly with approximate real numbers. Our blockchain adaptation cannot. We need a stable integer representation.

There is **no single industry standard** for "PRS on unsigned blockchain FHE integers." Instead, we combine three mature ideas:

* PRS scoring uses a dot product of dosages and signed effect weights.
* Fixed-point systems convert floats to integers using a **scale**.
* Unsigned-only systems often use a **zero-point / offset** so signed values can still be represented safely.

That leads to two design versions:

* **V1**: hardcall genotypes, public models first, fixed-point integer weights, unsigned affine encoding, exact overflow metadata.
* **V2**: same core math, but extended to private encrypted weights, tighter bit-width optimization, decimal dosages, and later DP/security additions.

---

## Design goals

Any production-worthy scheme should satisfy all of these:

1. Preserve PRS math as closely as possible.
2. Support negative weights without hacks that break semantics.
3. Make overflow impossible by design, not by hope.
4. Keep the on-chain execution path simple enough to audit.
5. Work for both public and private models.
6. Allow thresholds and outputs to live in the same encoded domain.
7. Carry enough metadata so off-chain tools can reproduce the result.

---

## V1: Production Baseline

### Scope

V1 is the recommended first real version:

* Genotypes are **hardcalls** only: each SNP dosage is `0`, `1`, or `2`.
* Weights are quantized off-chain into integers.
* The on-chain score is stored and compared in an **encoded nonnegative integer domain**.
* We start with **public models first** because they are cheaper and easier to validate.
* No differential privacy noise yet.
* No centering, variance-standardization, or other advanced score transforms on-chain.

This version is intentionally conservative. It keeps the math readable and avoids introducing too many moving parts at once.

### Core idea

We start from signed floating-point PRS weights:

```text
beta_i
```

We convert them into signed integers using a scale:

```text
q_i = round(scale * beta_i)
```

Now we have a problem: `q_i` can be negative, but the contract currently wants unsigned values.

So we choose a **weight zero-point** and shift each quantized weight into a nonnegative range:

```text
weight_zero_point = -min(q_i)
u_i = q_i + weight_zero_point
```

The contract stores `u_i`, not `q_i`.

That means the raw on-chain dot product is no longer the true PRS. It includes an extra constant contribution from the zero-point. To correct that, the contract also tracks the sum of genotype dosages:

```text
weighted_sum = sum(g_i * u_i)
geno_sum = sum(g_i)
raw_score_q = weighted_sum - weight_zero_point * geno_sum
```

This recovers the original signed integer score.

### Why we also need a score offset

The true signed score can still be negative. That is inconvenient if the result needs to stay inside an unsigned type and be compared against unsigned thresholds.

So we add one more model-level constant:

```text
score_offset = -raw_min
encoded_score = raw_score_q + score_offset
```

Now the final score is always nonnegative.

That is the core V1 representation:

* stored weights are unsigned
* intermediate arithmetic stays in unsigned space
* the final score is unsigned
* the original signed meaning is preserved through metadata

### Exact overflow-safe bounds

Overflow is not something we should estimate loosely with "SNP count times max value." We can do better.

For hardcall genotypes, each dosage satisfies:

```text
g_i in {0, 1, 2}
```

Given signed quantized weights `q_i`, the exact worst-case score bounds are:

```text
raw_min = sum(2 * min(q_i, 0))
raw_max = sum(2 * max(q_i, 0))
encoded_range = raw_max - raw_min
score_offset = -raw_min
```

This gives us an exact safe interval for the encoded score:

```text
encoded_score in [0, encoded_range]
```

This is the number we should use to choose the accumulator width and decide whether `euint64` is enough or whether we need a wider accumulator later.

### Manifest metadata

Every model should be published together with metadata generated offline.

Suggested V1 metadata:

* `weightScale`
* `weightZeroPoint`
* `scoreOffset`
* `rawMin`
* `rawMax`
* `encodedRange`
* `genotypeMode` (`hardcall_0_1_2`)
* `accumulatorBits`
* `thresholdsEncoded`
* `sourceModelHash`

This makes the model reproducible and auditable.

### On-chain V1 flow

For each PRS job:

1. The model publisher has already uploaded the shifted integer weights `u_i`.
2. The user submits genotype dosages `g_i`.
3. The contract computes:
   * `weighted_sum = sum(g_i * u_i)`
   * `geno_sum = sum(g_i)`
4. The contract applies the correction:
   * `raw_score_q = weighted_sum - weight_zero_point * geno_sum`
5. The contract shifts into the encoded unsigned output domain:
   * `encoded_score = raw_score_q + score_offset`
6. Thresholds are compared in that same encoded domain.

Nothing in the contract needs to understand floating-point numbers.

### Why V1 is good

V1 is the right first production baseline because it:

* preserves signed PRS semantics
* avoids pretending unsigned types are signed
* works for thresholds and classification
* makes overflow analysis explicit
* can later be reused for private encrypted weights

---

## V1 explained with a small example

This section explains the idea without assuming a strong math background.

### Step 1: start with the normal PRS formula

Suppose a user has 3 SNP values:

```text
genotypes = [0, 2, 1]
```

And the model has 3 weights:

```text
weights = [-0.30, 0.10, 0.25]
```

The normal PRS would be:

```text
0 * (-0.30) + 2 * 0.10 + 1 * 0.25 = 0.45
```

So the real answer is `0.45`.

### Step 2: turn floats into integers

Pick a scale of `100`.

That means:

```text
-0.30 -> -30
 0.10 ->  10
 0.25 ->  25
```

So our signed integer weights become:

```text
q = [-30, 10, 25]
```

If we ran the same dot product with these integers, the result would be:

```text
0 * (-30) + 2 * 10 + 1 * 25 = 45
```

That is just the original score multiplied by `100`.

### Step 3: remove negative weights by shifting them

The smallest weight is `-30`.

To make every weight nonnegative, we add `30` to all of them:

```text
u = [0, 40, 55]
```

These are safe to store in an unsigned integer type.

But now the dot product changes:

```text
0 * 0 + 2 * 40 + 1 * 55 = 135
```

That is **not** the real answer anymore. We added too much because each genotype got multiplied by the extra `30`.

### Step 4: subtract the extra part

The genotype sum is:

```text
geno_sum = 0 + 2 + 1 = 3
```

The extra amount we accidentally added was:

```text
30 * 3 = 90
```

So we correct the result:

```text
135 - 90 = 45
```

Now we are back to the correct signed integer score.

### Step 5: make the final score nonnegative too

The score for some other user might be negative, so we add one final model-level offset.

For this toy model, the worst possible score is:

```text
raw_min = -60
```

So we choose:

```text
score_offset = 60
```

And define:

```text
encoded_score = raw_score_q + 60
```

For our user:

```text
encoded_score = 45 + 60 = 105
```

`105` is the value the contract can safely carry around and compare.

To recover the human-readable score later:

```text
raw_score_q = 105 - 60 = 45
final_score = 45 / 100 = 0.45
```

That is the whole trick:

* shift weights so they fit unsigned storage
* correct for that shift using the genotype sum
* shift the final score so it is also nonnegative

No advanced math is required to understand it once you see the numbers.

---

## V2: Extended Production Version

V2 keeps the same encoding idea but broadens the system.

### V2 scope

V2 extends V1 in four directions:

1. **Private encrypted weights**
   The same zero-point and score-offset logic still works, but weights may be stored as encrypted integers instead of plaintext.

2. **Smaller storage types and wider accumulators**
   Instead of keeping everything at `euint64`, use the smallest safe type for stored values and widen only where needed.

3. **Decimal dosages**
   If we later support imputed dosages like `1.73`, genotype values also need quantization and their bounds must be folded into the overflow analysis.

4. **Later security features**
   DP noise, stricter ACL checks, and encrypted thresholding all layer on top of the encoded score domain.

### V2 representation idea

V2 keeps:

* `q_i = round(scale * beta_i)`
* `u_i = q_i + weight_zero_point`
* `encoded_score = raw_score_q + score_offset`

But it also adds:

* explicit accumulator sizing per model
* support for private weight listings
* richer metadata
* tighter gas optimization work

### Bit-width strategy in V2

The long-term goal should not be "everything is 64-bit."

A better direction is:

* genotypes: as small as safely possible
* public weights: as small as safely possible
* encrypted weights: as small as safely possible
* accumulator: wider only if the model bounds require it

This matters because smaller encrypted integer types are cheaper to operate on.

### Why V2 is not V1

V2 is not just "more features." It adds operational complexity:

* more metadata
* more careful accumulator sizing
* richer input modes
* more state to validate

That is why V1 should land first.

---

## Approaches we should avoid

### 1. Demo-only weight shifting with no correction

This is okay for a quick test, but not for production. If weights are shifted to become nonnegative and we do not subtract the zero-point contribution, the score is no longer a true PRS.

### 2. Pretending unsigned values are signed

Using raw `euint64` values as if they were signed by convention is easy to get wrong and hard to audit.

### 3. One global scale for all models forever

Different models have different weight distributions and SNP counts. A per-model scale is safer and usually more efficient.

### 4. Loose overflow estimates

Using only "largest weight times SNP count" leaves money on the table and can still be unsafe. We should compute exact model bounds from the actual quantized weight vector.

---

## Implementation status

The V1 math is implemented in `ModelMarketplace` and `PRSComputeEngine`.

`ModelMarketplace.ModelHeader` stores `weightZeroPoint` and `scoreOffset` as `uint64` fields, set at `createModelShell` time and returned by `getModelConfig` and `getModelHeader`.

`PRSComputeEngine` accumulates `genoSum` alongside `partialSum` in every `computeChunk` call. `finalize` applies the correction:

```solidity
euint64 withOffset = FHE.add(job.partialSum, FHE.asEuint64(job.scoreOffset));
euint64 correction = FHE.mul(job.genoSum, FHE.asEuint64(job.weightZeroPoint));
euint64 encodedScore = FHE.sub(withOffset, correction);
```

The rearrangement `(partialSum + scoreOffset) - (weightZeroPoint * genoSum)` avoids an unsigned underflow on the intermediate `raw_score_q` when the signed dot product is negative.

`test/utils/heprs.ts::quantizeSignedWeightsToUint64` computes `weightZeroPoint` and `scoreOffset` from the float weights and passes them through to all HEPRS fixture tests. All 55 tests pass under the mock fhEVM stack.

Next steps toward V2 are bit-depth optimization and decimal dosage support, both tracked in the architecture roadmap.

---

## External references

These references informed the design direction:

* PGS Catalog scoring file conventions:
  * <https://www.pgscatalog.org/downloads/>
* PLINK 2.0 scoring:
  * <https://www.cog-genomics.org/plink/2.0/score>
* Zama Protocol supported encrypted types:
  * <https://docs.zama.org/protocol/solidity-guides/smart-contract/types>
* Zama HCU cost guide:
  * <https://docs.zama.org/protocol/solidity-guides/development-guide/hcu>
* Zama roadmap:
  * <https://docs.zama.org/protocol/protocol/roadmap>
* HEPRS reference paper in this repo:
  * `docs/PIIS2667237525003078.pdf`
* Quantization advisor capability:
  * `docs/reference/quantization-advisor.md`
* Scaling ceilings quick reference:
  * `docs/reference/scaling-ceilings.md`
