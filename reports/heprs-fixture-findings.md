# HEPRS Fixture Findings

> Updated 5 April 2026 — reflects the decoupled upload/compute chunk size architecture
> (`uploadChunkSize=32`, `computeChunkSize=20`). All four fixtures complete end-to-end.
> Includes fresh gas and timing data from the Hardhat mock coprocessor.

## Purpose

This report captures benchmark results from the HEPRS profiling harness running on
the latest contract architecture: chunked model publication, staged SNP upload with
encrypted input proofs (`fhevmjs`), chunked FHE dot-product computation, and
event-based score retrieval.

## How These Results Were Produced

### Test suite

83 Hardhat tests pass (~20 s) covering all five contracts:

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
6. **Compute** — chunked `computeChunk` calls (20 SNPs per chunk)
7. **Finalize** — `finalize`, then `JobFinalized` event parsed for the encrypted
   score handle, debug-decrypted for verification

### Fixture naming

Fixture names like "100 SNP" mean 100 SNPs + 1 intercept, so actual vector lengths
are 101, 501, 1001, 5001.

## Timing Results (uploadChunkSize = 32, computeChunkSize = 20)

All times are local Hardhat mock-coprocessor wall-clock measurements. They reflect
relative phase costs and scaling trends, **not** real-chain latencies or gas costs.

| Fixture | Vector len | Compute chunks | Total     | Publish | Upload SNPs | Compute  | Finalize |
| ------: | ---------: | -------------: | --------: | ------: | ----------: | -------: | -------: |
| 100     | 101        | 6              | 382 ms    | 9 ms    | 128 ms      | 60 ms    | 70 ms    |
| 500     | 501        | 26             | 1460 ms   | 24 ms   | 531 ms      | 285 ms   | 343 ms   |
| 1000    | 1001       | 51             | 2930 ms   | 42 ms   | 1081 ms     | 592 ms   | 674 ms   |
| 5000    | 5001       | 251            | 14535 ms  | 196 ms  | 5269 ms     | 3002 ms  | 3523 ms  |

**Per-chunk compute averages:** 10.0 ms (100 SNP) to 12.0 ms (5000 SNP) — nearly
constant, confirming linear scaling.

### Phase breakdown

| Phase | % of total (5000 SNP) | Notes |
| --- | ---: | --- |
| SNP upload | 36% | Dominated by `fhevm.createEncryptedInput()` proof generation; 157 upload tx at uploadChunkSize=32 |
| Compute chunks | 21% | 251 compute tx × ~12.0 ms average |
| Finalize | 24% | Includes mock-coprocessor bookkeeping |
| Model publish | 1% | Chunked, scales linearly |
| Other | 18% | Job creation, SNP finalize, fixture loading |

## Gas Consumption (Hardhat mock coprocessor)

Gas values are measured on the Hardhat mock coprocessor. Real fhEVM gas costs will
differ (FHE precompiles have different gas schedules), but these numbers capture the
**non-FHE overhead**: storage writes, calldata decoding, state-machine transitions,
and event emissions.

| Fixture | Total gas | Publish model | Create job | Upload SNPs | Compute | Finalize |
|--------:|----------:|--------------:|-----------:|------------:|--------:|---------:|
| 100     | 17,758,112 | 1,128,690 | 315,428 | 10,303,272 | 5,820,927 | 154,850 |
| 500     | 83,742,088 | 4,256,666 | 315,428 | 50,820,152 | 28,160,047 | 154,850 |
| 1000    | 166,455,805 | 8,210,154 | 315,428 | 101,656,481 | 56,083,947 | 154,850 |
| 5000    | 827,599,462 | 39,707,027 | 315,428 | 507,912,065 | 279,475,147 | 154,850 |

Upload SNPs includes `finalizeSnpUpload` gas (~35K per job).

### Gas breakdown

| Phase | % of total (5000 SNP) | Per-tx avg | Notes |
|---|---:|---:|---|
| Upload SNPs | 61% | 3.24M / upload tx | Stores encrypted handles; 157 upload tx at uploadChunkSize=32 |
| Compute | 34% | 1.11M / compute tx | 3 FHE ops per SNP (mock precompile calls) |
| Publish model | 5% | 253K / chunk | One-time cost per model |
| Create job | <1% | — | Fixed per job |
| Finalize | <1% | — | Fixed per job |

**Key observations:**

- **Upload is the gas-dominant phase** (61%) because each `appendSnpChunk` writes
  encrypted handle references to storage — 32 SSTORE operations per upload chunk.
- **Compute gas is substantial** (34%) even on the mock, where FHE precompile calls
  are cheap. On real fhEVM, compute will likely become the dominant cost.
- **Create job and finalize are fixed-cost** — independent of SNP count.
- **Linear scaling confirmed**: total gas scales at ~165K per SNP (5000-SNP fixture:
  827.6M / 5001 = ~165K per SNP).

### Cost estimation (indicative only)

At 30 gwei gas price on an L1-equivalent chain:

| Fixture | Total gas | Est. ETH cost |
|--------:|----------:|--------------:|
| 100     | 17.8M     | 0.53 ETH      |
| 500     | 83.7M     | 2.51 ETH      |
| 1000    | 166.5M    | 4.99 ETH      |
| 5000    | 827.6M    | 24.83 ETH     |

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

A systematic probe (`npm run probe:hcu:mock`, 5 April 2026) tested all candidate
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
`uploadChunkSize=32` and `computeChunkSize=20`.

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

Transaction counts with `uploadChunkSize=32`, `computeChunkSize=20`.
The "+ 3" accounts for `createPRSJob`, `finalizeSnpUpload`, and `finalize`.

| SNPs | Upload tx | Compute tx | Total tx |
|-----:|----------:|-----------:|---------:|
| 100  | 4         | 6          | **13**   |
| 500  | 16        | 26         | **45**   |
| 1000 | 32        | 51         | **86**   |
| 5000 | 157       | 251        | **411**  |

Decoupling upload from compute and raising the mock-safe compute chunk from 10 to 20
reduces total transactions by ~59% vs. the prior single-`chunkSize=10` design
(which would have required 1005 tx for 5000 SNPs). Upload now scales at `ceil(N/32)`
and compute at `ceil(N/20)`.

## Key Differences From Previous Report

| Aspect | Previous (pre-staged SNP upload) | Current |
|---|---|---|
| SNP ingestion | Monolithic — 5000 SNP failed at `startPRS()` | Staged chunked upload — all fixtures pass |
| Encryption | Transparent mock values | `fhevmjs` encrypted inputs with proofs |
| Chunk size | 128 (no HCU enforcement) | 20 (mock HCU-constrained) |
| 5000 SNP | Failed (OOG at SNP storage) | Passes in ~14.4 s |
| Score retrieval | Direct `readPartial()` | Event-based (`JobFinalized`) + debug decrypt |
| Mock framework | Old transparent `TFHE.mock.sol` | `@fhevm/hardhat-plugin` mock coprocessor |

## Implications

1. **All HEPRS fixtures now complete end-to-end** — the staged-SNP-upload
   architecture eliminates the previous 5000-SNP boundary.

2. **Transaction cost is the practical concern** — a 5000-SNP PRS still requires ~411
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
