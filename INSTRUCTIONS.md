# bioETH PRS — High-Performance Confidential GWAS via fhEVM

## 1. Project Overview & Research Gap

**Title:** High-Performance Confidential GWAS: Optimizing Polygenic Risk Scoring via fhEVM.

**Objective:** Develop a decentralized, fully on-chain pipeline for Polygenic Risk Scoring (PRS) where validators perform computation on encrypted DNA without ever seeing the raw data.

**The Research Gap:** Existing "blockchain genomics" relies on Trusted Execution Environments (TEEs/Intel SGX) or off-chain servers. This project replaces hardware trust with mathematical trust using Fully Homomorphic Encryption (FHE).

**Target Infrastructure:** fhEVM (Fully Homomorphic Ethereum Virtual Machine) using the Zama/Fhenix/Inco stack.

---

## 2. Theoretical Foundation (The HEPRS Paper Adaptation)

**Reference Paper:** *Knight et al., 2026, "Homomorphic encryption enables privacy preserving polygenic risk scores" (HEPRS).*

*   **Original Protocol:** A centralized 3-party system (Client, Modeler, Evaluator) using CKKS (Floating-Point FHE).
*   **Our Blockchain Adaptation:**
    *   **Evaluator:** Replaced by a **Smart Contract** (Trustless Evaluator).
    *   **Encryption:** Replaced CKKS with **TFHE** (Integer-based FHE) to function with EVM precompiles.
    *   **Math:** Converted floating-point weights to **Fixed-Point Integers** (Quantization).
    *   **Trust Model:** Solved the "Modeler-Evaluator trust" vulnerability in the paper by using immutable smart contract code.

---

## 3. Technical Architecture

The system is broken into modular smart contracts to handle EVM Gas limits and separation of concerns.

### A. Contract 1: Genomic Registry — `GenomicRegistry.sol` (Data Layer)

*   Stores URI pointers to encrypted user SNP vectors (expected on IPFS / Arweave).
*   Manages per-sample access via an on-chain `mapping(sampleId => mapping(address => bool))` ACL.
*   **Functions:** `registerSample(uri)`, `grantAccess(sampleId, grantee)`, `revokeAccess(sampleId, grantee)`, `getSample(sampleId)`.
*   **Current limitation:** Access checks are purely at the metadata layer. The `PRSComputeEngine` does **not** yet enforce registry ACL before accepting encrypted SNPs (see Edge Cases § 7-A).

### B. Contract 2: Model Marketplace — `ModelMarketplace.sol` (Research Layer)

*   Stores Researcher GWAS weights (either plaintext or encrypted).
*   **Mode A (Private Weights):** Weights stored as `euint64[]` ($C \times C$ multiplication). Maximum IP protection; higher gas.
*   **Mode B (Public Weights):** Weights stored as `uint64[]` ($C \times P$ via `mulPlain`). ~60% gas savings, "Open Science" model.
*   **Functions:** `listPublicModel(weights)`, `listEncryptedModel(encryptedWeights)`, `getModel(modelId)`.
*   **Current limitation:** No payment / fee mechanism, no model update / deletion, and no model versioning (see Edge Cases § 7-B).

### C. Contract 3: PRS Compute Engine — `PRSComputeEngine.sol` (Logic Layer)

*   **Constraint:** A 1,000+ SNP calculation exceeds Block Gas Limits (~30 M gas on Hardhat, variable on live fhEVM).
*   **Solution:** Asynchronous **Chunking / MapReduce** pattern.
    *   The calculation is broken into transactions of ~100 SNPs.
    *   An on-chain state machine accumulates the encrypted `partialSum` across blocks.
*   Reads weights dynamically from `ModelMarketplace` and automatically uses either `mul` (private) or `mulPlain` (public) per model type.
*   **Functions:** `startPRS(modelId, encryptedSnps, chunkSize)`, `computeChunk(jobId)`, `readPartial(jobId)`, `finalize(jobId)`.
*   A standalone variant `HEPRS.sol` (contains the `BioETHPRS` contract) also exists; it embeds models directly instead of referencing the marketplace.

### D. Contract 4: Result Oracle — `ResultOracle.sol` (Output Layer)

*   **Differential Privacy (DP):** Adds homomorphic noise to the final encrypted result to prevent "Model Extraction Attacks" (where users reverse-engineer weights by probing the model).
*   **Classification:** Uses `FHE.lt`, `FHE.select`, and boolean ops to compare the noisy score against two thresholds, emitting a categorical result (Low / Medium / High) as `euint8`.
*   Calls `FHE.makePubliclyDecryptable(category)` so the category can be read off-chain after gateway decryption.
*   **Current limitation:** The noise ciphertext is supplied by the caller; the contract does **not** generate cryptographically calibrated Gaussian noise on-chain (see Edge Cases § 7-D).

### E. Supporting Libraries

*   **`TFHE.sol`** (library) — thin Solidity wrappers around the Zama `FHE` library (`asEuint64`, `add`, `mul`, `mulPlain`, `allow`, `makePubliclyDecryptable`).
*   **`contracts/fhevm/FHE.sol`** — a **mock** FHE library for local Hardhat testing. It unwraps user-defined types and performs plaintext arithmetic so tests run without a live fhEVM node.
*   **`contracts/fhevm/EncryptedTypes.sol`** — defines `ebool`, `euint8`, `euint64` as Solidity user-defined value types.
*   **`vendor/fhevm/`** — full Zama FHEVM repo checkout. The real `FHE.sol` is at `vendor/fhevm/library-solidity/lib/FHE.sol`.

---

## 4. Engineering Specifications & Optimizations

*   **Quantization Strategy:** GWAS weights (floats, e.g., 0.0045) are scaled by a factor (e.g., $10^8$) to fit into **`euint64`** integers.
*   **Bit-Depth Optimization (planned, not yet implemented):** Intermediate chunk calculations should use **`euint16`** (cheaper gas) where possible, aggregating into larger types only for the final sum. The current contracts use `euint64` exclusively.
*   **SIMD / Slot Packing (planned, not yet implemented):** Pack multiple SNPs into a single ciphertext vector to reduce the number of `fheMul` operations.
*   **`mulPlain` Optimization (implemented):** `PRSComputeEngine` uses cheaper plaintext-times-ciphertext multiplication when model weights are public.
*   **Target Metrics:** Reduce cost from ~$150 (Naive FHE) to ~$45 (Optimized) per run.

---

## 5. Current Implementation Status

**Environment:**
*   **OS:** macOS (Apple Silicon).
*   **Stack:** Docker (Zama fhEVM Node) + Hardhat + Node.js (v20+).
*   **Solidity:** `0.8.24`, optimizer at 200 runs.

**Codebase:**

| File | Purpose |
|------|---------|
| `contracts/HEPRS.sol` (contains `BioETHPRS`) | Standalone chunked dot-product contract (`uploadModel`, `startPRS`, `computeChunk`, `finalize`). |
| `contracts/GenomicRegistry.sol` | URI-based SNP sample registry with per-address ACL. |
| `contracts/ModelMarketplace.sol` | Public and private GWAS model listing. |
| `contracts/PRSComputeEngine.sol` | Marketplace-aware chunked PRS engine. |
| `contracts/ResultOracle.sol` | DP noise injection + categorical classification via Zama `FHE` library. |
| `contracts/TFHE.sol` | Wrapper library forwarding to Zama `FHE`. |
| `contracts/fhevm/FHE.sol` | Local plaintext mock of FHE for Hardhat simulations. |
| `contracts/fhevm/EncryptedTypes.sol` | UDVTs (`ebool`, `euint8`, `euint64`). |
| `test/bioeth_prs_test.ts` | Chunked PRS test (requires `FHEVM=1`). |
| `test/registry_marketplace_oracle_test.ts` | End-to-end integration test across all four contracts. |
| `test/utils/fhevm.ts` | `fhevmjs` helper: `getFhevmInstance()`, `encrypt64Array()`. |
| `scripts/gas_profile.ts` | Deploys marketplace + engine, runs multi-SNP gas profiling. |

---

## 6. Next Steps & Roadblocks

### 6-A. Short-term

1.  **Refine Quantization:** Determine the exact Scaling Factor ($10^6$ vs $10^8$) to minimize Mean Squared Error (MSE) vs. Gas Cost. Produce a table of scaling factor × SNP count → MSE.
2.  **Differential Privacy Tuning:** Benchmark the exact amount of noise required to secure weights without destroying clinical accuracy.  Generate ROC / AUC curves at several noise levels.
3.  **Gas Profiling:** Generate data points for the "Gas vs. SNP Count" curve from `scripts/gas_profile.ts` on a live fhEVM node.  Target SNP counts: 100, 300, 600, 1 000, 5 000.
4.  **Registry ↔ Engine ACL Wiring:** Make `PRSComputeEngine.startPRS` verify that the caller has access to the sample in `GenomicRegistry` before accepting SNP data.
5.  **Access-control on `computeChunk`:** Currently any address may call `computeChunk(jobId)`. Decide if this is acceptable (permissionless relay) or restrict to `job.requester` or an allow-list.
6.  **End-to-end Client Flow:** Integrate `fhevmjs` re-encryption, gateway-assisted decryption, and public decryption of the `ResultOracle` category.

### 6-B. Medium-term

7.  **On-chain Noise Generation:** Explore using fhEVM's `FHE.randEuint64()` (or a VRF-seeded encrypted random) to generate DP noise trustlessly, rather than accepting it from the caller.
8.  **Bit-Depth Optimization:** Implement `euint16` intermediate accumulators with widening adds to reduce per-`fheMul` gas.
9.  **SIMD / Slot Packing:** Batch multiple SNPs per ciphertext to amortize FHE overhead.
10. **Marketplace Enhancements:** Add model pricing/fees (ERC-20 or native), model update/deprecation, and versioning.
11. **Job Cancellation & Cleanup:** Allow the requester to cancel an in-progress job and reclaim unused state.
12. **Finalize Event:** Emit a `JobFinalized` event from `finalize()` so off-chain indexers can track completed jobs.

### 6-C. Long-term / Research

13. **Formal Security Analysis:** Prove that the DP noise calibration + categorical bucketing is sufficient to prevent weight extraction under an adaptive adversary.
14. **Cross-chain Portability:** Evaluate deployment on Fhenix L2, Inco Network, and future fhEVM-compatible chains.
15. **Clinical Validation:** Compare on-chain PRS results (after de-quantization) against reference PLINK/PRSice scores to quantify MSE/AUC degradation.

---

## 7. Known Edge Cases & Risks

### 7-A. Registry ↔ Compute Engine Disconnect

The `PRSComputeEngine` accepts any `euint64[]` from any caller. There is no on-chain check that the encrypted SNPs correspond to a registered sample for which the caller has permission. An attacker could submit arbitrary ciphertexts to probe the model. **Mitigation:** Wire `GenomicRegistry.getSample()` into `startPRS()` and require the caller to prove ownership or delegated access.

### 7-B. Marketplace Trust & Model Integrity

*   No mechanism prevents listing garbage weights. On-chain validation of statistical quality is infeasible; consider off-chain attestation or DAO-curated whitelists.
*   Models cannot be updated or deleted once listed; stale models persist forever.
*   No payment / fee layer exists yet. Without incentives, researchers have no reason to list models.

### 7-C. Integer Overflow in euint64 Multiplication

Multiplying two `euint64` values can produce a result exceeding 64 bits (max $\approx 1.8 \times 10^{19}$). With a scaling factor of $10^8$ and SNP value of 2, a single term can reach $2 \times 10^8 = 2 \times 10^8$, well within range. However, **accumulating** $N$ such terms (e.g., 5 000 SNPs × max term $\approx 4 \times 10^{16}$) risks silent wraparound.  **Mitigation:** Choose the scaling factor so that $N \times \text{max\_term} < 2^{64}$. Document the safe SNP-count ceiling for each scaling factor.

### 7-D. Differential Privacy Noise Supplied by Caller

`ResultOracle.classify()` accepts `encryptedNoise` as a parameter. A malicious caller can pass zero noise, defeating DP guarantees.  **Mitigation:** Generate noise on-chain (see 6-B §7) or enforce a minimum noise floor via a commitment scheme.

### 7-E. Permissionless `computeChunk`

Anyone can call `computeChunk(jobId)`, not just the requester. This is a design choice (allows relayers / meta-transactions) but also allows griefing if the computation has side-effects or if gas is wasted.  **Mitigation:** If permissionless relay is intended, document it; otherwise add `require(job.requester == msg.sender)`.

### 7-F. Empty / Mismatched Arrays

*   `startPRS` with an empty `encryptedSnps` array creates a job that is immediately completable with a zero partial sum.
*   The length-mismatch check inside `computeChunk` (not `startPRS`) means a misconfigured job will only revert on the first chunk call, wasting the `startPRS` gas.  **Mitigation:** Validate lengths at job creation time.

### 7-G. Gas Limit vs. Chunk Size

The optimal `chunkSize` depends on the fhEVM gas schedule, which differs significantly from vanilla EVM. A chunk that fits in 30 M gas on Hardhat may exceed the block limit on a live fhEVM chain.  **Mitigation:** Empirically profile chunk sizes on the target chain and expose a configurable default.

### 7-H. Re-entrancy & State Machine Racing

The `computeChunk` function mutates storage (`nextIndex`, `partialSum`, `complete`). While the current code has no external calls before state writes (checks-effects-interactions is followed), future extensions (callbacks, hooks) must preserve this pattern. Additionally, two concurrent `computeChunk` transactions for the same `jobId` could race. The EVM serialises them, but miners/sequencers could reorder them adversarially.

### 7-I. Mock vs. Real FHE Divergence

The local `contracts/fhevm/FHE.sol` mock performs plaintext arithmetic. Tests that pass on the mock may still fail on a real fhEVM node due to: differing gas costs, ciphertext expansion, ACL requirements, or gateway decryption flow.  **Mitigation:** Always confirm results on a Docker fhEVM node before drawing conclusions.