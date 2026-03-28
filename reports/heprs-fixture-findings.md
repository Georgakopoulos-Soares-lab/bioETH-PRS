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
| `100 SNP` | `1` | `394.81ms` | `publish=8.09ms`, `start=2.13ms`, `chunkTotal=3.95ms`, `finalize=0.37ms` |
| `500 SNP` | `4` | `44.83ms` | `publish=11.50ms`, `start=5.51ms`, `chunkTotal=14.32ms`, `finalize=0.27ms` |
| `1000 SNP` | `8` | `76.88ms` | `publish=27.88ms`, `start=13.61ms`, `chunkTotal=20.05ms`, `finalize=0.28ms` |
| `5000 SNP` | `40` local chunks | `188.20ms` | `publish=105.10ms`, `startPRSFailure=66.37ms`, local chunked math `0.13ms` |

These are local Hardhat mock runtimes, not real fhEVM runtimes, not gas costs, and not chain-finality times.
The most stable signals are the phase timings and chunk counts, not the end-to-end totals, because cold-start deployment/setup overhead can dominate a single isolated run.

## Results

| Fixture | What was executed | Result |
|---|---|---|
| `100 SNP` | Chunked public-model publication, PRS job creation, chunked computation, finalize | Matches plaintext dot product |
| `500 SNP` | Chunked public-model publication, PRS job creation, chunked computation, finalize | Matches plaintext dot product |
| `1000 SNP` | Chunked public-model publication, PRS job creation, chunked computation, finalize | Matches plaintext dot product |
| `5000 SNP` | Chunked model publication + `startPRS` boundary check | Chunked publication succeeds and local chunked math matches the full dot product, but `startPRS` runs out of gas before PRS execution begins |

## Main Findings

### 1. The core PRS math is behaving correctly

For `100`, `500`, and `1000` SNP HEPRS fixtures, the current mock contract path reproduces the same result as the local plaintext dot product.

That validates:

* fixture loading
* quantized integer mapping
* chunked accumulation logic at `chunkSize = 128`
* final score agreement for these reference-sized datasets

### 2. Chunked publication fixed the old first boundary

For `5000` SNPs, the current failure is not “the PRS math is wrong.”

The test shows:

* local chunked math still equals the full dot product
* chunked model publication now succeeds
* but `startPRS()` still runs out of gas because the SNP vector is still submitted monolithically

The new failing path is [contracts/PRSComputeEngine.sol](/Users/galano/Developer/patternforge/utexas-lab/bioeth-prs-project/bioETH-PRS/contracts/PRSComputeEngine.sol), specifically `startPRS(modelId, encryptedSnps)`, which still stores the full SNP array in one transaction.

Interpretation: the old first scaling problem, model publication/storage, has been improved by `ModelMarketplace v1`. The next scaling problem is SNP ingestion.

### 3. Chunked compute and chunked publication still do not solve monolithic SNP ingestion

The arithmetic loop is chunked in [contracts/PRSComputeEngine.sol](/Users/galano/Developer/patternforge/utexas-lab/bioeth-prs-project/bioETH-PRS/contracts/PRSComputeEngine.sol), and model publication is now chunked in [contracts/ModelMarketplace.sol](/Users/galano/Developer/patternforge/utexas-lab/bioeth-prs-project/bioETH-PRS/contracts/ModelMarketplace.sol), but one important whole-array operation remains:

* `startPRS()` still accepts and stores the full SNP array at once

Interpretation: chunked compute plus chunked model publication is a real step forward, but the system still needs a scalable SNP-ingestion path.

### 4. The current timing profile should be read carefully

The per-profile times are not monotonic with SNP count:

* `100 SNP` appears slower than `500 SNP`
* `5000 SNP` appears relatively fast

That does **not** mean larger models are cheaper.

Interpretation:

* the `100 SNP` profile pays a large cold-start deployment/setup cost
* the `5000` case fails at `startPRS()`, so it never enters a full compute-chunk execution path
* the meaningful scaling signal for successful runs is the chunk section:
  * `1` chunk at `100 SNP`
  * `4` chunks at `500 SNP`
  * `8` chunks at `1000 SNP`
* mock Hardhat timings are useful for local developer feedback, but not for claiming real-chain performance

### 5. The 5000-SNP result is now a start-PRS boundary result, not a publication result

For `5000` SNPs, the profiler shows:

* `40` chunks would be needed locally at `chunkSize = 128`
* local chunked math is trivial (`~0.14ms`)
* chunked publication succeeds in about `105.10ms`
* the real blocker is `startPRS()`, which fails after about `66.37ms`

Interpretation: when someone asks “how far does 5000 get today?”, the honest answer is that the current contract flow now reaches the post-publication boundary. It gets through chunked model publication and stops at SNP ingestion.

## What It Means For The Project

These test results imply:

* the implementation direction is mathematically sound for small-to-medium HEPRS-style models
* the next engineering priority is not redoing PRS math
* the next priority is redesigning how large SNP arrays enter the system

In practical terms:

* keep the HEPRS fixtures as regression tests
* keep the current `100` / `500` / `1000` full-flow tests
* treat `5000` as the current boundary case that motivates chunked SNP ingestion
* treat these timings as local development signals only until we benchmark on real fhEVM infrastructure
