# HEPRS Fixture Findings

> Updated 1 April 2026 — reflects the current `@fhevm/solidity` + staged-SNP-upload
> implementation with chunked encrypted input proofs. All four fixtures (100 / 500 /
> 1000 / 5000 SNPs) now complete end-to-end.

## Purpose

This report captures benchmark results from the HEPRS profiling harness running on
the latest contract architecture: chunked model publication, staged SNP upload with
encrypted input proofs (`fhevmjs`), chunked FHE dot-product computation, and
event-based score retrieval.

## How These Results Were Produced

### Test suite

55 Hardhat tests pass (21 s) covering all five contracts:

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

| Fixture | Vector len | Chunks | Total | Publish | Upload SNPs | Compute | Finalize |
|--------:|-----------:|-------:|------:|--------:|------------:|--------:|---------:|
| 100     | 101        | 11     | 383 ms | 16 ms  | 157 ms      | 63 ms   | 72 ms    |
| 500     | 501        | 51     | 1646 ms | 54 ms | 655 ms      | 345 ms  | 368 ms   |
| 1000    | 1001       | 101    | 3138 ms | 99 ms | 1306 ms     | 643 ms  | 686 ms   |
| 5000    | 5001       | 501    | 15628 ms | 468 ms | 6515 ms   | 3338 ms | 3434 ms  |

**Per-chunk compute averages:** 5.7 ms (100 SNP) to 6.7 ms (5000 SNP) — nearly
constant, confirming linear scaling.

### Phase breakdown

| Phase | % of total (5000 SNP) | Notes |
|---|---:|---|
| SNP upload | 42% | Dominated by `fhevm.createEncryptedInput()` proof generation |
| Compute chunks | 21% | 501 chunks x ~6.7 ms average |
| Finalize | 22% | Includes mock-coprocessor bookkeeping |
| Model publish | 3% | Chunked, scales linearly |
| Other | 12% | Job creation, SNP finalize, fixture loading |

## Chunk-Size Constraints

Two independent limits determine the maximum chunk size:

### 1. Input-proof limit (SNP upload): 32 values

The `fhevmjs` encrypted-input proof has a 2048-bit budget. Each `euint64` value
consumes 64 bits, so a single `appendSnpChunk` call can pack at most
**32 encrypted values**.

### 2. HCU limit (compute): 10 values

Each SNP in `computeChunk` requires **3 FHE operations**:
- `FHE.asEuint64(weight)` — trivial encryption of the public weight
- `FHE.mul(snp, encWeight)` — ciphertext multiplication
- `FHE.add(partialSum, product)` — accumulation

The mock coprocessor enforces a per-transaction HCU (Homomorphic Compute Unit)
budget of approximately 30 operations. At 3 ops per SNP, the maximum is
**10 SNPs per compute chunk**.

We confirmed this empirically: chunkSize = 32 triggers
`HCUTransactionLimitExceeded()` at the first `computeChunk` call (32 x 3 = 96 ops).

### Binding constraint

The **compute step** is the binding bottleneck. Upload can handle 32 values per
transaction, but compute can only process 10. The profiler therefore uses
**chunkSize = 10** for both upload and compute to keep the flow uniform.

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
