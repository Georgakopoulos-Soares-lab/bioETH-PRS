# Streaming Path — Gas Profile

**Date:** 28 April 2026
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
| 100 | 17,822,343 | 11,497,106 | 6,325,237 | 35.5% |
| 500 | 83,943,791 | 53,022,266 | 30,921,525 | 36.8% |
| 1,000 | 166,833,088 | 104,972,231 | 61,860,857 | 37.1% |
| 5,000 | 829,373,147 | 520,441,238 | 308,931,909 | 37.2% |

Savings stabilise at ~37% above 500 SNPs. Both paths produce identical scores (verified for all four fixture sizes).

---

## Gas Breakdown — Streaming

| Phase | 100 SNPs | 500 SNPs | 1,000 SNPs | 5,000 SNPs |
|-------|---------|---------|-----------|-----------|
| `publishModel` | 1,129,042 | 4,257,810 | 8,212,354 | 39,717,477 |
| `createPRSJob` | 284,148 | 284,148 | 284,148 | 284,148 |
| `appendAndComputeChunk` | 9,914,040 | 48,310,432 | 96,305,853 | 480,269,737 |
| `finalize` | 169,876 | 169,876 | 169,876 | 169,876 |
| **Total** | **11,497,106** | **53,022,266** | **104,972,231** | **520,441,238** |

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
