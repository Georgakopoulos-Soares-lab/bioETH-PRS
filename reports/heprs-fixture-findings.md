# HEPRS Fixture Findings

> Updated 1 April 2026 — reflects the current `@fhevm/solidity` + staged-SNP-upload
> implementation with chunked encrypted input proofs. All four fixtures (100 / 500 /
> 1000 / 5000 SNPs) complete end-to-end. Includes gas consumption data from the
> Hardhat mock coprocessor.

## Purpose

This report captures benchmark results from the HEPRS profiling harness running on
the latest contract architecture: chunked model publication, staged SNP upload with
encrypted input proofs (`fhevmjs`), chunked FHE dot-product computation, and
event-based score retrieval.

## How These Results Were Produced

### Test suite

59 Hardhat tests pass (~20 s) covering all five contracts:

```bash
npm run test     # hardhat test via @fhevm/hardhat-plugin mock coprocessor
```

### Profiler

```bash
npm run profile:heprs   # default chunkSize = 10
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

## Timing Results (chunkSize = 10)

All times are local Hardhat mock-coprocessor wall-clock measurements. They reflect
relative phase costs and scaling trends, **not** real-chain latencies or gas costs.

| Fixture | Vector len | Chunks | Total    | Publish | Upload SNPs | Compute  | Finalize |
| ------: | ---------: | -----: | -------: | ------: | ----------: | -------: | -------: |
| 100     | 101        | 11     | 373 ms   | 15 ms   | 154 ms      | 61 ms    | 70 ms    |
| 500     | 501        | 51     | 1593 ms  | 53 ms   | 644 ms      | 319 ms   | 359 ms   |
| 1000    | 1001       | 101    | 3063 ms  | 98 ms   | 1257 ms     | 636 ms   | 672 ms   |
| 5000    | 5001       | 501    | 15341 ms | 461 ms  | 6542 ms     | 3218 ms  | 3313 ms  |

**Per-chunk compute averages:** 5.6 ms (100 SNP) to 6.4 ms (5000 SNP) — nearly
constant, confirming linear scaling.

### Phase breakdown

| Phase | % of total (5000 SNP) | Notes |
| --- | ---: | --- |
| SNP upload | 43% | Dominated by `fhevm.createEncryptedInput()` proof generation |
| Compute chunks | 21% | 501 chunks x ~6.4 ms average |
| Finalize | 22% | Includes mock-coprocessor bookkeeping |
| Model publish | 3% | Chunked, scales linearly |
| Other | 11% | Job creation, SNP finalize, fixture loading |

## Gas Consumption (Hardhat mock coprocessor)

Gas values are measured on the Hardhat mock coprocessor. Real fhEVM gas costs will
differ (FHE precompiles have different gas schedules), but these numbers capture the
**non-FHE overhead**: storage writes, calldata decoding, state-machine transitions,
and event emissions.

| Fixture | Total gas | Publish model | Create job | Upload SNPs | Compute | Finalize |
|--------:|----------:|--------------:|-----------:|------------:|--------:|---------:|
| 100     | 18.7M     | 1.7M          | 280K       | 10.0M       | 6.5M    | 156K     |
| 500     | 88.5M     | 7.2M          | 280K       | 49.1M       | 31.8M   | 156K     |
| 1000    | 175.8M    | 14.1M         | 280K       | 98.0M       | 63.3M   | 156K     |
| 5000    | 873.9M    | 69.0M         | 280K       | 488.9M      | 315.5M  | 156K     |

### Gas breakdown

| Phase | % of total (5000 SNP) | Per-chunk avg | Notes |
|---|---:|---:|---|
| Upload SNPs | 56% | 976K / chunk | Stores encrypted handles; dominant cost |
| Compute | 36% | 630K / chunk | 3 FHE ops per SNP (mock precompile calls) |
| Publish model | 8% | 138K / chunk | One-time cost per model |
| Create job | <1% | — | Fixed per job |
| Finalize | <1% | — | Fixed per job |

**Key observations:**

- **Upload is the gas-dominant phase** (56%) because each `appendSnpChunk` writes
  encrypted handle references to storage — 10 SSTORE operations per chunk.
- **Compute gas is substantial** (36%) even on the mock, where FHE precompile calls
  are cheap. On real fhEVM, compute will likely become the dominant cost.
- **Create job and finalize are fixed-cost** — independent of SNP count.
- **Linear scaling confirmed**: total gas scales at ~175K per SNP (5000-SNP fixture:
  873.9M / 5001 = ~175K per SNP).

### Cost estimation (indicative only)

At 30 gwei gas price on an L1-equivalent chain:

| Fixture | Total gas | Est. ETH cost |
|--------:|----------:|--------------:|
| 100     | 18.7M     | 0.56 ETH      |
| 500     | 88.5M     | 2.66 ETH      |
| 1000    | 175.8M    | 5.27 ETH      |
| 5000    | 873.9M    | 26.2 ETH      |

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
transaction, but compute is capped at 20 on mock. The profiler uses **chunkSize = 10**
as a conservative default; `chunkSize = 20` is also safe and reduces transaction
count by ~45%.

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

| SNPs | Transactions required | Est. linear model |
|-----:|----------------------:|---|
| 100  | 11 upload + 11 compute + 3 = **25 tx** | ~5 tx per 100 SNPs |
| 500  | 51 upload + 51 compute + 3 = **105 tx** | |
| 1000 | 101 upload + 101 compute + 3 = **205 tx** | |
| 5000 | 501 upload + 501 compute + 3 = **1005 tx** | |

The "+ 3" accounts for `createPRSJob`, `finalizeSnpUpload`, and `finalize`.

Transaction count scales linearly at ~2N/10 = N/5 total transactions for N SNPs,
which is the expected outcome for a chunked architecture.

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
