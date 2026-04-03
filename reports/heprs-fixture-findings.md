# HEPRS Fixture Findings

> Updated 3 April 2026 — reflects the decoupled upload/compute chunk size architecture
> (`uploadChunkSize=32`, `computeChunkSize=10`). All four fixtures complete end-to-end.
> Includes fresh gas and timing data from the Hardhat mock coprocessor.

## Purpose

This report captures benchmark results from the HEPRS profiling harness running on
the latest contract architecture: chunked model publication, staged SNP upload with
encrypted input proofs (`fhevmjs`), chunked FHE dot-product computation, and
event-based score retrieval.

## How These Results Were Produced

### Test suite

72 Hardhat tests pass (~20 s) covering all five contracts:

```bash
npm run test     # hardhat test via @fhevm/hardhat-plugin mock coprocessor
```

### Profiler

```bash
npm run profile:heprs   # default: uploadChunkSize=32, computeChunkSize=20
```

The profiler (`scripts/heprs_fixture_profile.ts`) runs as a Mocha `describe/it`
block inside `hardhat test` so the `@fhevm/hardhat-plugin` mock coprocessor is
fully initialised. Each fixture goes through every stage of the real contract flow:

1. **Quantization** — float weights scaled to `uint64` via the advisor
2. **Model publication** — chunked `publishModelChunk` calls on `ModelMarketplace`
3. **Job creation** — `createPRSJob` on `PRSComputeEngine`
4. **SNP upload** — `appendSnpChunk` with `fhevm.createEncryptedInput()` producing
   `externalEuint64[]` + `inputProof` (max 32 values per proof, matching the
   2048-bit input-proof limit)
5. **Finalize upload** — `finalizeSnpUpload`
6. **Compute** — chunked `computeChunk` calls (10 SNPs per chunk)
7. **Finalize** — `finalize`, then `JobFinalized` event parsed for the encrypted
   score handle, debug-decrypted for verification

### Fixture naming

Fixture names like "100 SNP" mean 100 SNPs + 1 intercept, so actual vector lengths
are 101, 501, 1001, 5001.

## Timing Results (uploadChunkSize = 32, computeChunkSize = 10)

All times are local Hardhat mock-coprocessor wall-clock measurements. They reflect
relative phase costs and scaling trends, **not** real-chain latencies or gas costs.

| Fixture | Vector len | Compute chunks | Total     | Publish | Upload SNPs | Compute  | Finalize |
| ------: | ---------: | -------------: | --------: | ------: | ----------: | -------: | -------: |
| 100     | 101        | 11             | 352 ms    | 10 ms   | 119 ms      | 53 ms    | 72 ms    |
| 500     | 501        | 51             | 1580 ms   | 21 ms   | 587 ms      | 329 ms   | 361 ms   |
| 1000    | 1001       | 101            | 2928 ms   | 43 ms   | 1037 ms     | 663 ms   | 679 ms   |
| 5000    | 5001       | 501            | 14964 ms  | 199 ms  | 5328 ms     | 3473 ms  | 3516 ms  |

**Per-chunk compute averages:** 4.8 ms (100 SNP) to 6.9 ms (5000 SNP) — nearly
constant, confirming linear scaling.

### Phase breakdown

| Phase | % of total (5000 SNP) | Notes |
| --- | ---: | --- |
| SNP upload | 36% | Dominated by `fhevm.createEncryptedInput()` proof generation; 157 upload tx at uploadChunkSize=32 |
| Compute chunks | 23% | 501 compute tx × ~6.9 ms average |
| Finalize | 23% | Includes mock-coprocessor bookkeeping |
| Model publish | 1% | Chunked, scales linearly |
| Other | 17% | Job creation, SNP finalize, fixture loading |

## Gas Consumption (Hardhat mock coprocessor)

Gas values are measured on the Hardhat mock coprocessor. Real fhEVM gas costs will
differ (FHE precompiles have different gas schedules), but these numbers capture the
**non-FHE overhead**: storage writes, calldata decoding, state-machine transitions,
and event emissions.

| Fixture | Total gas | Publish model | Create job | Upload SNPs | Compute | Finalize |
|--------:|----------:|--------------:|-----------:|------------:|--------:|---------:|
| 100     | 18.5M     | 1.1M          | 315K       | 10.3M       | 6.6M    | 155K     |
| 500     | 87.6M     | 4.3M          | 315K       | 50.9M       | 32.0M   | 155K     |
| 1000    | 174.1M    | 8.2M          | 315K       | 101.7M      | 63.7M   | 155K     |
| 5000    | 865.9M    | 39.7M         | 315K       | 507.9M      | 317.7M  | 155K     |

Upload SNPs includes `finalizeSnpUpload` gas (~35K per job).

### Gas breakdown

| Phase | % of total (5000 SNP) | Per-tx avg | Notes |
|---|---:|---:|---|
| Upload SNPs | 59% | 3.23M / upload tx | Stores encrypted handles; 157 upload tx at uploadChunkSize=32 |
| Compute | 37% | 634K / compute tx | 3 FHE ops per SNP (mock precompile calls) |
| Publish model | 5% | 253K / chunk | One-time cost per model |
| Create job | <1% | — | Fixed per job |
| Finalize | <1% | — | Fixed per job |

**Key observations:**

- **Upload is the gas-dominant phase** (59%) because each `appendSnpChunk` writes
  encrypted handle references to storage — 32 SSTORE operations per upload chunk.
- **Compute gas is substantial** (37%) even on the mock, where FHE precompile calls
  are cheap. On real fhEVM, compute will likely become the dominant cost.
- **Create job and finalize are fixed-cost** — independent of SNP count.
- **Linear scaling confirmed**: total gas scales at ~173K per SNP (5000-SNP fixture:
  865.9M / 5001 = ~173K per SNP).

### Cost estimation (indicative only)

At 30 gwei gas price on an L1-equivalent chain:

| Fixture | Total gas | Est. ETH cost |
|--------:|----------:|--------------:|
| 100     | 18.5M     | 0.56 ETH      |
| 500     | 87.6M     | 2.63 ETH      |
| 1000    | 174.1M    | 5.22 ETH      |
| 5000    | 865.9M    | 25.98 ETH     |

These are **mock-coprocessor gas costs** — real fhEVM precompile gas pricing will
change the totals significantly. The numbers are useful for comparing relative phase
costs and tracking regressions, not for production cost estimates.

## Chunk-Size Constraints

Two independent limits determine the maximum chunk size:

### 1. Input-proof limit (SNP upload): 32 values

The `fhevmjs` encrypted-input proof has a 2048-bit budget. Each `euint64` value
consumes 64 bits, so a single `appendSnpChunk` call can pack at most
**32 encrypted values**.

### 2. HCU limit (compute): 20 values (mock)

Each SNP in `computeChunk` requires **3 FHE operations**:
- `FHE.asEuint64(weight)` — trivial encryption of the public weight
- `FHE.mul(snp, encWeight)` — ciphertext multiplication
- `FHE.add(partialSum, product)` — accumulation

A systematic probe (`npm run probe:hcu:mock`, 2 April 2026) tested all candidate
sizes and found the mock HCU budget is approximately **60–74 ops/tx**:

| chunkSize | ops (3×) | Result |
| ---: | ---: | --- |
| 10 | 30 | PASS |
| 15 | 45 | PASS |
| 20 | 60 | PASS |
| 25 | 75 | FAIL — `HCUTransactionLimitExceeded` |
| 32 | 96 | FAIL — `HCUTransactionLimitExceeded` |

The maximum safe compute chunk size on mock is **20 SNPs**.

> **Correction:** Earlier versions of this report and `snp-ingestion.md` stated the
> ceiling was 10, inferred from testing only chunkSize=32 (FAIL) against a ~30 HCU/tx
> assumption.  The systematic probe corrects this.

### Binding constraint

The **compute step** is the binding bottleneck. Upload can handle 32 values per
transaction (`uploadChunkSize`), while compute is capped at 20 on mock (`computeChunkSize`).
These two parameters are now independently configurable. The profiler defaults to
`uploadChunkSize=32` and `computeChunkSize=20`; earlier profiling used
`computeChunkSize=10` as a conservative baseline.

## Mathematical Correctness

All four fixtures produce scores that match the expected value:

```
expected = sum(snp[i] * quantizedWeight[i]) + scoreOffset - weightZeroPoint * sum(snp[i])
```

The quantization advisor selects:
- 100 / 500 SNP: `scale = 3,000,000` (balanced tier, 16/32 bits)
- 1000 / 5000 SNP: `scale = 1,000,000` (balanced tier, 16/32 bits)

All scores verified via `fhevm.debugger.decryptEuint()` against local plaintext
dot product.

## Scaling Analysis

Transaction counts with `uploadChunkSize=32`, `computeChunkSize=10`.
The "+ 3" accounts for `createPRSJob`, `finalizeSnpUpload`, and `finalize`.

| SNPs | Upload tx | Compute tx | Total tx |
|-----:|----------:|-----------:|---------:|
| 100  | 4         | 11         | **18**   |
| 500  | 16        | 51         | **70**   |
| 1000 | 32        | 101        | **136**  |
| 5000 | 157       | 501        | **661**  |

Decoupling upload from compute reduces total transactions by ~34% vs. the prior
single-`chunkSize=10` design (which would have required 1005 tx for 5000 SNPs).
Upload now scales at `ceil(N/32)` and compute at `ceil(N/10)`.

## Key Differences From Previous Report

| Aspect | Previous (pre-staged SNP upload) | Current |
|---|---|---|
| SNP ingestion | Monolithic — 5000 SNP failed at `startPRS()` | Staged chunked upload — all fixtures pass |
| Encryption | Transparent mock values | `fhevmjs` encrypted inputs with proofs |
| Chunk size | 128 (no HCU enforcement) | 10 (HCU-constrained) |
| 5000 SNP | Failed (OOG at SNP storage) | Passes in ~15.6 s |
| Score retrieval | Direct `readPartial()` | Event-based (`JobFinalized`) + debug decrypt |
| Mock framework | Old transparent `TFHE.mock.sol` | `@fhevm/hardhat-plugin` mock coprocessor |

## Implications

1. **All HEPRS fixtures now complete end-to-end** — the staged-SNP-upload
   architecture eliminates the previous 5000-SNP boundary.

2. **Transaction cost is the practical concern** — a 5000-SNP PRS requires ~1005
   transactions. On-chain, each is a separate block inclusion. Batching or
   session-based optimisations could reduce this.

3. **HCU is the binding constraint, not input proofs** — future fhEVM releases
   with higher HCU budgets would directly increase chunk size and reduce
   transaction counts.

4. **Mock timings are developer-feedback only** — real fhEVM latencies will be
   orders of magnitude higher due to actual TFHE bootstrapping. These numbers
   are useful for regression detection, not performance claims.

5. **The quantization pipeline is stable** — the advisor consistently selects
   appropriate scales that keep accumulation within `uint64` bounds.
