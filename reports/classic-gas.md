# Classic Path — Gas Profile

**Date:** 9 April 2026
**Config:** Hardhat mock, uploadChunkSize=32, computeChunkSize=20, public weights, real HEPRS GWAS beta files, balanced advisor scale
**Path:** `createPRSJob → appendSnpChunk (×N) → finalizeSnpUpload → computeChunk (×N) → finalize`

---

## Correctness Baseline (100 SNPs)

| Check | Result |
|-------|--------|
| Ciphertext input flow (`externalEuint64` + `inputProof`) | Pass |
| ACL enforcement at `createPRSJob` | Pass |
| `JobFinalized` event received | Pass |
| Score value | 758,685 = expected plaintext dot-product |

---

## HCU Ceiling

The fhEVM coprocessor enforces a per-transaction FHE operation budget (HCU). Systematic probe of `computeChunkSize` on the mock:

| computeChunkSize | FHE ops/tx | Result |
|-----------------|-----------|--------|
| 10 | 30 | Pass |
| 15 | 45 | Pass |
| 20 | 60 | Pass |
| 25 | 75 | Fail — `HCUTransactionLimitExceeded` |
| 32 | 96 | Fail |

**Mock HCU budget: 60-74 ops/tx. Safe ceiling: computeChunkSize = 20.**

Each `computeChunk` call with N SNPs uses 3N + 2 FHE ops (mul + add + genoAdd per SNP, plus two `allowThis`). At N=20: 62 ops.

Sepolia ceiling: TBD — run `npm run probe:hcu` after first Sepolia deployment. May allow larger chunks (faster computation, fewer transactions).

---

## Gas Profile — All Fixture Sizes

### Timing (wall clock, mock)

| SNPs | Upload txs | Compute txs | Total time |
|------|-----------|-------------|-----------|
| 100 | 4 | 6 | ~386 ms |
| 500 | 16 | 26 | ~1,496 ms |
| 1,000 | 32 | 51 | ~2,833 ms |
| 5,000 | 157 | 251 | ~14,457 ms |

### Gas by phase

| Phase | 100 SNPs | 500 SNPs | 1,000 SNPs | 5,000 SNPs |
|-------|---------|---------|-----------|-----------|
| `publishModel` | 1,128,690 | 4,256,666 | 8,210,154 | 39,707,027 |
| `createPRSJob` | 315,450 | 315,450 | 315,450 | 315,450 |
| `appendSnpChunk` | 10,326,983 | 50,929,135 | 101,874,036 | 508,993,312 |
| `finalizeSnpUpload` | 34,967 | 34,967 | 34,967 | 34,967 |
| `computeChunk` | 5,816,015 | 28,135,255 | 56,034,305 | 279,226,705 |
| `finalize` | 154,850 | 154,850 | 154,850 | 154,850 |
| **Total** | **17,776,955** | **83,826,323** | **166,623,762** | **828,432,311** |

### Phase shares (consistent across sizes)

| Phase | Share |
|-------|-------|
| `appendSnpChunk` | ~61% |
| `computeChunk` | ~34% |
| `publishModel` | ~5% |
| `createPRSJob` + `finalize` + `finalizeSnpUpload` | <1% |

### Gas per SNP

| SNPs | Gas/SNP |
|------|---------|
| 100 | ~176K |
| 500 | ~167K |
| 1,000 | ~166K |
| 5,000 | ~166K |

Linear scaling confirmed. No hidden quadratic overhead.

---

## Root Cause: Why Upload Dominates

Upload consistently uses ~1.77× more gas than compute. The cause is two persistent storage writes per SNP that compute avoids:

| Operation | Where | Gas (approx) | Notes |
|-----------|-------|-------------|-------|
| `FHE.fromExternal()` → `FHEVMExecutor.verifyInput()` | upload | ~40-60K | External call; validates input proof |
| `ACL.allowTransient()` | upload | cheap | EIP-1153 `tstore`; tx-scoped, no SSTORE |
| `FHE.allowThis()` → `ACL.allow()` | upload | ~25K | External call + **SSTORE** `persistedAllowedPairs[handle][contract]` |
| `snpData[jobId].push(snp)` | upload | ~25K | **SSTORE** handle into flat array — new storage slot |
| SLOAD `snpData[jobId][i]` | compute | 2K (cold) / 100 (warm) | Read previously stored handle |
| `FHE.mul(snp, weight)` | compute | ~27K | FHE operation via coprocessor |
| `FHE.add(acc, term)` | compute | ~27K | FHE operation via coprocessor |

**Per-SNP summary:**

- Upload: ~100-110K gas (dominated by 2× SSTORE = ~50K)
- Compute: ~56K gas (SLOAD + FHE mul + FHE add)

The two extra SSTOREs in upload exist because SNP handles must be persisted across transactions: `computeChunk` is called later and needs to read the handles back from `snpData[jobId]`.

---

## Mock vs Sepolia — Is Mock Gas Inflated?

No. The mock coprocessor's off-chain component (`FhevmDB`) stores handle→plaintext mappings in a Node.js in-memory map for test decryption. This is purely off-chain — zero on-chain gas cost.

The on-chain operations are identical between mock and real network:

- `FHEVMExecutor.verifyInput()` — same contract pattern, different address
- `ACL.allow()` → `persistedAllowedPairs[handle][account] = true` — same SSTORE cost
- `snpData[jobId]` writes — same SSTORE cost

Gas on Sepolia is expected to be within 10-20% of these mock numbers.

---

## Sepolia Validation (TBD)

After first Sepolia deployment, record actual numbers here:

| Metric | Mock | Sepolia |
|--------|------|---------|
| Max safe `computeChunkSize` | 20 | TBD |
| Gas: `publishModel` (100 SNPs) | 1,128,690 | TBD |
| Gas: `appendSnpChunk` per call (32 SNPs) | ~2,582K | TBD |
| Gas: `computeChunk` per call (20 SNPs) | ~969K | TBD |
| Gas: total 100-SNP end-to-end | 17,776,955 | TBD |
| Score correctness (758,685) | Pass | TBD |

Run `npm run validate:sepolia` after deployment. Fill Sepolia column.
