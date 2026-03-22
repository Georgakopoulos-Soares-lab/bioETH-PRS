# HEPRS Fixture Test Findings

## Purpose

This report focuses on what we learned from running the HEPRS-backed tests, independent of the advisor.

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

Important note:

* the HEPRS fixture names like `100 SNP` really mean `100 SNPs + 1 intercept`
* so the actual vector lengths are `101`, `501`, `1001`, `5001`

## Results

| Fixture | What was executed | Result |
|---|---|---|
| `100 SNP` | Public-model upload, PRS job creation, chunked computation, finalize | Matches plaintext dot product |
| `500 SNP` | Public-model upload, PRS job creation, chunked computation, finalize | Matches plaintext dot product |
| `1000 SNP` | Public-model upload, PRS job creation, chunked computation, finalize | Matches plaintext dot product |
| `5000 SNP` | Local chunked math equivalence + marketplace upload boundary check | Local chunked math matches full dot product, but model upload runs out of gas |

## Main Findings

### 1. The core PRS math is behaving correctly

For `100`, `500`, and `1000` SNP HEPRS fixtures, the current mock contract path reproduces the same result as the local plaintext dot product.

That validates:

* fixture loading
* quantized integer mapping
* chunked accumulation logic
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

## What It Means For The Project

These test results imply:

* the implementation direction is mathematically sound for small-to-medium HEPRS-style models
* the next engineering priority is not redoing PRS math
* the next priority is redesigning how large models and large SNP arrays enter the system

In practical terms:

* keep the HEPRS fixtures as regression tests
* keep the current `100` / `500` / `1000` full-flow tests
* treat `5000` as the current boundary case that motivates chunked publication and likely chunked SNP ingestion
