# HEPRS Fixture Test Findings

## Purpose

This report focuses on what we learned from running the HEPRS-backed tests and the dedicated HEPRS profiling harness, independent of the advisor.

It is about:

* whether the current implementation reproduces the expected PRS math
* how far the current mock contract path scales
* where the first real gas boundary appears

## How These Results Were Produced

We copied the HEPRS fixture datasets into [test/fixtures/heprs](/Users/galano/Developer/patternforge/utexas-lab/bioeth-prs-project/bioETH-PRS/test/fixtures/heprs) and ran the HEPRS-specific test file:

```bash
npx hardhat test test/heprs_fixture_test.ts
```

That test uses [test/heprs_fixture_test.ts](/Users/galano/Developer/patternforge/utexas-lab/bioeth-prs-project/bioETH-PRS/test/heprs_fixture_test.ts) together with [test/utils/heprs.ts](/Users/galano/Developer/patternforge/utexas-lab/bioeth-prs-project/bioETH-PRS/test/utils/heprs.ts).

For timing and chunk-level measurement, we also ran:

```bash
npm run profile:heprs
```

using [scripts/heprs_fixture_profile.ts](/Users/galano/Developer/patternforge/utexas-lab/bioeth-prs-project/bioETH-PRS/scripts/heprs_fixture_profile.ts).

To inspect a single boundary case directly, for example:

```bash
npm run profile:heprs -- --fixture 5000 --chunk-size 128
```

Important note:

* the HEPRS fixture names like `100 SNP` really mean `100 SNPs + 1 intercept`
* so the actual vector lengths are `101`, `501`, `1001`, `5001`
* the profiler used `chunkSize = 128`

### Timing snapshot

Measured local runtimes from the dedicated profiling harness:

```bash
npm run profile:heprs
```

| Fixture | Chunk count | Total time | Key phase timings |
|---|---:|---:|---|
| `100 SNP` | `1` | `439.29ms` | `list=4.79ms`, `start=2.67ms`, `chunkTotal=3.42ms`, `finalize=0.60ms` |
| `500 SNP` | `4` | `50.86ms` | `list=7.98ms`, `start=8.40ms`, `chunkTotal=21.76ms`, `finalize=0.37ms` |
| `1000 SNP` | `8` | `152.45ms` | `list=20.88ms`, `start=14.17ms`, `chunkTotal=104.42ms`, `finalize=0.42ms` |
| `5000 SNP` | `40` local chunks | `96.50ms` | `listModelFailure=83.93ms`, local chunked math `0.14ms` |

These are local Hardhat mock runtimes, not real fhEVM runtimes, not gas costs, and not chain-finality times.
The most stable signals are the phase timings and chunk counts, not the end-to-end totals, because cold-start deployment/setup overhead can dominate a single isolated run.

## Results

| Fixture | What was executed | Result |
|---|---|---|
| `100 SNP` | Public-model upload, PRS job creation, chunked computation, finalize | Matches plaintext dot product |
| `500 SNP` | Public-model upload, PRS job creation, chunked computation, finalize | Matches plaintext dot product |
| `1000 SNP` | Public-model upload, PRS job creation, chunked computation, finalize | Matches plaintext dot product |
| `5000 SNP` | Local chunked math equivalence + marketplace upload boundary check | Local chunked math matches full dot product, but model upload runs out of gas before PRS execution begins |

## Main Findings

### 1. The core PRS math is behaving correctly

For `100`, `500`, and `1000` SNP HEPRS fixtures, the current mock contract path reproduces the same result as the local plaintext dot product.

That validates:

* fixture loading
* quantized integer mapping
* chunked accumulation logic at `chunkSize = 128`
* final score agreement for these reference-sized datasets

### 2. The first practical scaling boundary appears before PRS computation

For `5000` SNPs, the current failure is not “the PRS math is wrong.”

The test shows:

* local chunked math still equals the full dot product
* but the current marketplace upload transaction fails with out-of-gas

The failing path is [contracts/ModelMarketplace.sol](/Users/galano/Developer/patternforge/utexas-lab/bioeth-prs-project/bioETH-PRS/contracts/ModelMarketplace.sol), specifically `listPublicModel(uint64[] calldata weights)`, which stores the full weight array in one transaction.

Interpretation: the first scaling problem is model publication/storage, not PRS arithmetic.

### 3. Chunked compute is only part of the scalability story

The arithmetic loop is chunked in [contracts/PRSComputeEngine.sol](/Users/galano/Developer/patternforge/utexas-lab/bioeth-prs-project/bioETH-PRS/contracts/PRSComputeEngine.sol), but other parts of the system are still whole-array operations:

* model upload stores the entire weight vector at once
* `startPRS()` still accepts and stores the full SNP array at once
* `getModel()` still returns full arrays

Interpretation: “chunked compute” alone is not enough. Data ingestion and storage also need scalable paths.

### 4. The current timing profile should be read carefully

The per-profile times are not monotonic with SNP count:

* `100 SNP` appears slower than `500 SNP`
* `5000 SNP` appears relatively fast

That does **not** mean larger models are cheaper.

Interpretation:

* the `100 SNP` profile pays a large cold-start deployment/setup cost
* the `5000` case fails early at model upload, so it never enters a full PRS execution path
* the meaningful scaling signal for successful runs is the chunk section:
  * `1` chunk at `100 SNP`
  * `4` chunks at `500 SNP`
  * `8` chunks at `1000 SNP`
* mock Hardhat timings are useful for local developer feedback, but not for claiming real-chain performance

### 5. The 5000-SNP result is a boundary result, not a compute result

For `5000` SNPs, the profiler shows:

* `40` chunks would be needed locally at `chunkSize = 128`
* local chunked math is trivial (`~0.14ms`)
* the real blocker is the upload attempt, which fails after about `83.93ms`
* a standalone `npm run profile:heprs -- --fixture 5000 --chunk-size 128` run currently reports about `465ms` total locally, but that total includes one-time local setup overhead

Interpretation: when someone asks “how long did 5000 take?”, the honest answer today is that the current contract flow does not yet compute it. It reaches the marketplace upload boundary first.

## What It Means For The Project

These test results imply:

* the implementation direction is mathematically sound for small-to-medium HEPRS-style models
* the next engineering priority is not redoing PRS math
* the next priority is redesigning how large models and large SNP arrays enter the system

In practical terms:

* keep the HEPRS fixtures as regression tests
* keep the current `100` / `500` / `1000` full-flow tests
* treat `5000` as the current boundary case that motivates chunked publication and likely chunked SNP ingestion
* treat these timings as local development signals only until we benchmark on real fhEVM infrastructure
