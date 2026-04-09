# Streaming Path — Gas Profile

**Date:** 9 April 2026
**Config:** Hardhat mock, computeChunkSize=20, public weights, real HEPRS GWAS beta files, balanced advisor scale
**Path:** `createPRSJob → appendAndComputeChunk (×N) → finalize`

---

## What the Streaming Path Does

`appendAndComputeChunk` combines SNP upload and weighted accumulation into a single call per compute chunk. Each call:

1. Accepts exactly `computeChunkSize` encrypted SNPs (one compute chunk's worth)
2. Calls `FHE.fromExternal` for each — validates the input proof, gets a transient handle
3. Immediately multiplies each SNP by the corresponding model weight (`FHE.mul`)
4. Accumulates into `partialSum` and `genoSum` (`FHE.add`)
5. Discards the SNP handles — never writes them to contract storage

**No `snpData` mapping writes. No per-SNP `FHE.allowThis`. No `finalizeSnpUpload` step.**

The optimisation targets the two persistent SSTOREs per SNP that the classic path requires:

- `snpData[jobId].push(snp)` — 32-byte handle SSTORE (~25K gas)
- `ACL.persistedAllowedPairs[handle][contract] = true` — ACL SSTORE (~25K gas)

Both are eliminated because SNP handles are only needed within the current transaction.

### HCU compatibility

Each streaming call with N SNPs uses: N `FHE.fromExternal` (proof ops, not HCU-counted) + N `FHE.mul` + N `FHE.add` + N `FHE.add` (genoSum) + 2 `FHE.allowThis` (for acc and genoAcc) = 3N + 2 HCU ops. At N=20: 62 ops — same as classic `computeChunk`, within the 60-74 mock budget.

### Input proof constraint

`computeChunkSize=20` < 32 (fhEVM per-call input proof limit). Safe at current ceiling. If the Sepolia HCU probe raises the ceiling, chunk size can grow up to 32 without changing the proof scheme.

---

## Gas Comparison — Classic vs Streaming

| SNPs | Classic gas | Streaming gas | Saved | Savings |
|------|------------|--------------|-------|---------|
| 100 | 17,776,955 | 11,462,650 | 6,314,305 | 35.5% |
| 500 | 83,826,323 | 52,942,406 | 30,883,917 | 36.8% |
| 1,000 | 166,623,762 | 104,835,421 | 61,788,341 | 37.1% |
| 5,000 | 828,432,311 | 519,850,706 | 308,581,605 | 37.2% |

Savings stabilise at ~37% above 500 SNPs. Both paths produce identical scores (verified for all four fixture sizes).

---

## Gas Breakdown — Streaming

| Phase | 100 SNPs | 500 SNPs | 1,000 SNPs | 5,000 SNPs |
|-------|---------|---------|-----------|-----------|
| `publishModel` | 1,128,690 | 4,256,666 | 8,210,154 | 39,707,027 |
| `createPRSJob` | 278,450 | 278,450 | 278,450 | 278,450 |
| `appendAndComputeChunk` | 9,900,648 | 48,252,428 | 96,191,955 | 479,710,367 |
| `finalize` | 154,862 | 154,862 | 154,862 | 154,862 |
| **Total** | **11,462,650** | **52,942,406** | **104,835,421** | **519,850,706** |

### Per-SNP gas — streaming vs classic

| Component | Classic (gas/SNP) | Streaming (gas/SNP) | Delta |
|-----------|-------------------|----------------------|-------|
| SNP handle SSTORE (`snpData.push`) | ~25K | 0 | −25K |
| ACL persistent SSTORE (`allowThis`) | ~25K | 0 | −25K |
| `FHE.fromExternal` (proof verify) | ~40-60K | ~40-60K | ~0 |
| `FHE.mul` | ~27K | ~27K | ~0 |
| `FHE.add` | ~27K | ~27K | ~0 |
| SLOAD (`snpData[jobId][i]`) | ~2K | 0 | −2K |
| **Total/SNP** | **~166K** | **~104K** | **−62K** |

The ~62K savings per SNP are entirely from eliminating on-chain handle persistence.

---

## What Cannot Be Optimised Further

After streaming, the irreducible floor per SNP is ~95-96K gas — the FHE coprocessor operations themselves:

| Operation | Gas | Reducible? |
|-----------|-----|-----------|
| `FHE.fromExternal` + proof verify | ~40-60K | Only if proof scheme changes |
| `FHE.mul` (euint64 × euint64) | ~27K | Only if coprocessor changes |
| `FHE.add` (euint64 + euint64) | ~27K | Only if coprocessor changes |

These costs are set by the fhEVM protocol, not by contract design. Reducing them requires either hardware acceleration at the coprocessor level, a lighter-weight proof scheme (e.g. shorter input proofs), or a future FHE scheme with cheaper integer ops.

---

## Trade-offs

| Aspect | Classic | Streaming |
|--------|---------|-----------|
| Gas cost | ~166K/SNP | ~104K/SNP |
| Upload/compute separation | Yes — different txs, different signers possible | No — same tx |
| `snpData` state recoverable | Yes — stored on-chain | No — discarded immediately |
| Resume after partial compute | Yes | No (job must complete in order) |
| HCU budget | Upload: unconstrained; Compute: 20/tx | Combined: 20/tx |
| Suitable for | Multi-party flows, deferred compute | Single-requester, immediate compute |

For a solo requester who submits all transactions themselves, streaming is strictly better. For architectures where upload and compute are done by different parties or timed separately, the classic path is required.

---

## Correctness

Streaming scores verified equal to classic scores for all four fixture sizes. The quantization correction (`partialSum + scoreOffset − weightZeroPoint × genoSum`) is applied identically in `finalize` for both paths.
