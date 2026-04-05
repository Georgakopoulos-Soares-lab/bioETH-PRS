# Mock Coprocessor Validation Findings

> Generated 5 April 2026 — `npm run validate:mock` + `npm run probe:hcu:mock`
> Network: Hardhat (chainId=31337), FHE mode: mock — plaintext arithmetic
> FHE library: `@fhevm/solidity` v0.11.1 + `@fhevm/hardhat-plugin` v0.4.2

This report captures the **best available simulated-environment baseline** for the
bioETH PRS pipeline.  Mock mode validates the full fhEVM protocol (handles, ACL,
input proofs, event emission, decryption API) with plaintext arithmetic behind the
scenes.  Gas numbers and correctness hold; latencies are meaningless for real-chain
projection.

---

## 1. 100-SNP End-to-End Validation

### Setup

| Parameter | Value |
|---|---|
| Fixture | HEPRS 100-SNP (101-element vector, 1 intercept) |
| `uploadChunkSize` | 32 |
| `computeChunkSize` | 20 |
| Upload / compute chunks | 4 upload chunks, 6 compute chunks |
| Quantization scale | 3,000,000 |
| Expected score | 758,685 |

### Correctness

| Check | Result |
|---|---|
| Ciphertext input flow (`externalEuint64` + `inputProof`) | ✓ accepted |
| ACL enforcement at `createPRSJob` | ✓ registry check passes |
| `JobFinalized` event received | ✓ in receipt |
| Score handle emitted | ✓ `0xf967f4d4...7a690500` |
| Decrypted score (`debugger.decryptEuint`) | 758,685 |
| Matches expected plaintext dot-product | ✓ PASS |

### Gas by Phase (100-SNP, uploadChunkSize=32, computeChunkSize=20)

| Phase | Gas | % of total |
|---|---:|---:|
| `publishModel` (createShell + 4 weight uploads + finalize) | 1,128,690 | 6.4% |
| `createJob` | 315,428 | 1.8% |
| `uploadSnps` (4 × `appendSnpChunk`) | 10,303,356 | 58.0% |
| `finalizeSnpUpload` | 34,945 | 0.2% |
| `compute` (6 × `computeChunk`) | 5,820,927 | 32.8% |
| `finalize` | 154,850 | 0.9% |
| **Total** | **17,758,196** | **100%** |

### Per-Chunk Compute Gas

| Chunk | Gas |
|---|---:|
| 1 (first — cold storage paths) | 1,149,156 |
| 2–5 (full, warm) | 1,116,956 (each) |
| 6 (partial — 1 SNP) | 203,947 |

First-chunk overhead is still ~32K gas (cold `SSTORE` for `partialSum` initialization).
The partial final chunk remains small because only the intercept term is processed in
the last window.

### Timing (mock wall-clock)

| Metric | Value |
|---|---|
| Avg compute chunk | 7.5 ms |
| Min compute chunk | 1 ms |
| Max compute chunk | 10 ms |
| Decryption (`debugger.decryptEuint`) | 130 ms |
| Total test duration | ~390 ms |

Mock timings are developer-feedback only.  Real fhEVM latencies (TFHE bootstrapping
+ KMS re-encryption) will be **orders of magnitude higher**.

---

## 2. HCU Ceiling Probe

### Methodology

For each candidate `chunkSize`, the probe deploys a fresh contract set, publishes a
synthetic model with `2 × chunkSize` weights (all = 1), uploads matching SNP chunks
(all = 1), and calls `computeChunk` twice.  Failure = `HCUTransactionLimitExceeded`.

### Results

| chunkSize | Result | Gas/chunk (first) | Avg ms |
|---:|---|---:|---:|
| 10 | **PASS** | 667,211 | 4 ms |
| 15 | **PASS** | 908,181 | 6 ms |
| 20 | **PASS** | 1,149,156 | 10 ms |
| 25 | **FAIL** — `HCUTransactionLimitExceeded` | — | — |
| 32 | **FAIL** — `HCUTransactionLimitExceeded` | — | — |

### Ceiling Conclusion

```
20 < mock HCU ceiling ≤ 25
```

This **corrects previous documentation** which stated the ceiling was 10.  The prior
claim was based on testing only chunkSize=32 (FAIL) and inferring ceiling=10 from the
~30 HCU/tx assumption.  The systematic probe reveals the actual mock HCU budget is
in the range **60–74 ops/tx** (since 20 × 3 = 60 passes and 25 × 3 = 75 fails).

**Practical implication:** `chunkSize=20` is safe on the mock coprocessor.  The local
`validate:mock` harness now uses `computeChunkSize=20`, so a 100-SNP fixture requires
6 compute chunks instead of 11.  Keep `computeChunkSize=10` only for the first Sepolia
validation run until the real HCU ceiling is measured.

### Gas Scaling (compute phase)

| chunkSize | Gas/chunk | Gas per SNP |
|---:|---:|---:|
| 10 | 667,211 | 66,721 |
| 15 | 908,181 | 60,545 |
| 20 | 1,149,156 | 57,458 |

Gas-per-SNP decreases slightly as `chunkSize` grows — fixed per-chunk overhead
(state machine bookkeeping, `partialSum` load/store) is amortized over more SNPs.

---

## 3. Key Takeaways

### Corrections to prior documentation

| Prior claim | Correct value | Source |
|---|---|---|
| Mock HCU ceiling = 10 | 20 < ceiling ≤ 25 | `probe:hcu:mock` run, 5 Apr 2026 |
| Mock HCU budget ~30 ops/tx | 60–74 ops/tx | inferred from probe results |
| `chunkSize > 10` triggers HCU error | `chunkSize ≤ 20` is safe | probe confirms |

### Confirmed findings

* Full V1 job lifecycle (createPRSJob → appendSnpChunk × N → finalizeSnpUpload →
  computeChunk × N → finalize) completes correctly end-to-end.
* V1 quantization correction formula produces bit-exact results:
  `score = naiveDot + scoreOffset − weightZeroPoint × genoSum`
* `JobFinalized` event is emitted and carries the encrypted score handle.
* Mock `debugger.decryptEuint` path works for local verification.
* Registry ACL is enforced at job creation (sample owner check passes).
* Upload-proof limit (32 values / 2048-bit budget) remains correct and separate
  from the HCU compute limit.

### What mock cannot tell us

* Real TFHE ciphertext expansion and KMS re-encryption latency.
* Actual Sepolia HCU budget (may allow chunkSize >> 20).
* Real fhEVM precompile gas costs (precompiles have different schedules than mock).
* Whether `userDecryptEuint` + EIP-712 signing round-trip completes successfully.

---

## 4. Recommended `chunkSize` for v1

| Environment | Recommended `chunkSize` | Rationale |
|---|---|---|
| Local mock (dev/test) | **20** | Confirmed safe; reduces tx count by ~45% vs 10 |
| Sepolia (first deployment) | **10** (conservative) | Unknown real HCU ceiling; start safe |
| Sepolia (after probe) | Per `probe:hcu` output | Maximize based on measured ceiling |

---

## 5. Relation to Other Reports

* **[heprs-fixture-findings.md](heprs-fixture-findings.md)** — multi-fixture profiling
  (100 / 500 / 1000 / 5000 SNPs) with the HEPRS profiler harness.  The latest report
  now uses the same `uploadChunkSize=32`, `computeChunkSize=20` mock defaults.
* **sepolia-validation-findings.md** — to be created after first Sepolia deployment.
  Will fill in the "Sepolia observed" column in `docs/architecture-roadmap.md §7-I`.
