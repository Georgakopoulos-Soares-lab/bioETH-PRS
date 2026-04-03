# bioETH PRS — High-Performance Confidential GWAS via fhEVM

## 1. Project Overview & Research Gap

**Title:** High-Performance Confidential GWAS: Optimizing Polygenic Risk Scoring via fhEVM.

**Objective:** Develop a decentralized, fully on-chain pipeline for Polygenic Risk Scoring (PRS) where validators perform computation on encrypted DNA without ever seeing the raw data.

**The Research Gap:** Existing "blockchain genomics" relies on Trusted Execution Environments (TEEs/Intel SGX) or off-chain servers. This project replaces hardware trust with mathematical trust using Fully Homomorphic Encryption (FHE).

**Target Infrastructure:** fhEVM (Fully Homomorphic Ethereum Virtual Machine) using the Zama/Fhenix/Inco stack.

---

## 2. Theoretical Foundation (The HEPRS Paper Adaptation)

**Reference Paper:** *Knight et al., 2026, "Homomorphic encryption enables privacy preserving polygenic risk scores" (HEPRS).*

* **Original Protocol:** A centralized 3-party system (Client, Modeler, Evaluator) using CKKS (Floating-Point FHE).
* **Our Blockchain Adaptation:**
  * **Evaluator:** Replaced by a **Smart Contract** (Trustless Evaluator).
  * **Encryption:** Replaced CKKS with **TFHE** (Integer-based FHE) to function with EVM precompiles.
  * **Math:** Converted floating-point weights to **Fixed-Point Integers** (Quantization).
  * **Trust Model:** Solved the "Modeler-Evaluator trust" vulnerability in the paper by using immutable smart contract code.

---

## 3. Technical Architecture

The system is broken into modular smart contracts to handle EVM Gas limits and separation of concerns.

### A. Contract 1: Genomic Registry — `GenomicRegistry.sol` (Data Layer)

* Stores URI pointers to encrypted user SNP vectors (expected on IPFS / Arweave).
* Manages per-sample access via an on-chain `mapping(sampleId => mapping(address => bool))` ACL.
* **Functions:** `registerSample(uri)`, `grantAccess(sampleId, grantee)`, `revokeAccess(sampleId, grantee)`, `getSample(sampleId)`.
* **Registry ↔ Engine wiring (implemented):** `PRSComputeEngine` now enforces registry ACL at job creation. `createPRSJob(modelId, sampleId)` calls `GenomicRegistry.hasAccess(sampleId, msg.sender)` and reverts if the caller is neither the sample owner nor a granted delegate (see § 7-A).

### B. Contract 2: Model Marketplace — `ModelMarketplace.sol` (Research Layer)

* Stores Researcher GWAS weights through a **chunked publication lifecycle** rather than one-shot full-array upload.
* **Mode A (Private Weights):** Weights stored as chunked `euint64[]` payloads ($C \times C$ multiplication). Maximum IP protection; higher gas.
* **Mode B (Public Weights):** Weights stored as chunked `uint64[]` payloads ($C \times P$ via trivial encryption: `FHE.mul(snp, FHE.asEuint64(weight))`). ~60% gas savings, "Open Science" model.
* **Functions:** `createModelShell(...)`, `appendPublicModelChunk(...)`, `appendEncryptedModelChunk(...)`, `finalizeModel(modelId)`, `getModelHeader(modelId)`, chunk getters.
* **Current limitation:** No payment / fee mechanism, no model deprecation flow yet, and public weights still live in ordinary on-chain storage in `v1` (see Edge Cases § 7-B).

### C. Contract 3: PRS Compute Engine — `PRSComputeEngine.sol` (Logic Layer)

* **Constraint:** A 1,000+ SNP calculation exceeds Block Gas Limits (~30 M gas on Hardhat, variable on live fhEVM).
* **Solution:** Asynchronous chunked state-machine pattern.
  * The calculation is broken into transactions aligned to the model's published chunk size.
  * PRS jobs use a shell + chunked SNP upload + finalize-upload lifecycle before compute begins.
  * An on-chain state machine accumulates the encrypted `partialSum` across blocks.
* Reads only the **next required model chunk** from `ModelMarketplace` and automatically uses either `FHE.mul(weight, snp)` (private, C×C) or `FHE.mul(snp, FHE.asEuint64(weight))` (public, C×P trivial) per model type.
* **Functions:** `createPRSJob(modelId, sampleId)`, `appendSnpChunk(jobId, encryptedSnps, inputProof)`, `finalizeSnpUpload(jobId)`, `computeChunk(jobId)`, `readPartial(jobId)`, `finalize(jobId)`.
* A standalone variant `HEPRS.sol` (contains the `BioETHPRS` contract) also exists; it embeds models directly instead of referencing the marketplace.

### D. Contract 4: Result Oracle — `ResultOracle.sol` (Output Layer)

* **Differential Privacy (DP):** Adds homomorphic noise to the final encrypted result to prevent "Model Extraction Attacks" (where users reverse-engineer weights by probing the model).
* **Classification:** Uses `FHE.lt`, `FHE.select`, and boolean ops to compare the noisy score against two thresholds, emitting a categorical result (Low / Medium / High) as `euint8`.
* Calls `FHE.makePubliclyDecryptable(category)` so the category can be read off-chain after gateway decryption.
* **Current limitation:** The noise ciphertext is supplied by the caller; the contract does **not** generate cryptographically calibrated Gaussian noise on-chain (see Edge Cases § 7-D).

### E. Supporting Libraries

* **`@fhevm/solidity`** (npm package) — official Zama Solidity library. Contracts import directly from `@fhevm/solidity/lib/FHE.sol` and inherit `ZamaEthereumConfig` from `@fhevm/solidity/config/ZamaConfig.sol`. Provides `FHE.asEuint64()`, `FHE.add()`, `FHE.mul()`, `FHE.allow()`, `FHE.makePubliclyDecryptable()`, `FHE.fromExternal()`, and the `externalEuint64` wire type.
* **`@fhevm/hardhat-plugin`** — Hardhat plugin that deploys a mock coprocessor locally (chainid 31337) at the same addresses used on Sepolia. Validates handles, ACL, and input proofs while performing plaintext arithmetic behind the scenes.
* **`mock-archive/`** — Historical archive of the old transparent plaintext mock files (`FHE.mock.sol`, `TFHE.mock.sol`, `EncryptedTypes.mock.sol`). No longer on any import path — kept for reference only.

**Local vs Sepolia — what is the same and what differs:**

| Aspect | Local Hardhat | Sepolia |
| --- | --- | --- |
| Contract bytecode | Identical | Identical |
| `@fhevm/solidity` imports | Same library | Same library |
| FHE operation API | Same (`FHE.mul`, `FHE.add`, …) | Same |
| Cryptographic backend | Plaintext arithmetic | Real TFHE ciphertext |
| Input proofs | Validated by mock | Validated by gateway |
| ACL enforcement | Validated by mock | Validated by gateway |
| HCU budget per tx | ~30 ops (mock limit) | Higher — TBD on Sepolia |
| Privacy guarantee | None (plaintext mock) | Full FHE privacy |

The same contract code that passes all 59 local tests is what gets deployed to Sepolia.
Only the cryptographic backend changes — no contract edits are needed to go from mock to real FHE.

---

## 4. Engineering Specifications & Optimizations

See also `docs/design/overview.md` for the current `v1` system target across publication, SNP upload, and compute.
See also `docs/design/quantization.md` for the dedicated production-oriented design of quantization, signed-weight handling, offsets, and overflow-safe score encoding.
See also `docs/design/model-marketplace.md` for the current chunked publication, metadata, permissions, and chunk-oriented compute design of `ModelMarketplace`.
See also `docs/design/snp-ingestion.md` for the current chunked PRS job upload and compute lifecycle.
See also `docs/reference/quantization-advisor.md` for the standalone advisor capability that helps model publishers choose candidate scales before upload.
See also `docs/reference/scaling-ceilings.md` for the simple scale-vs-SNP quick-screen reference under `uint64`.
See also `reports/scaling-ceiling-findings.md` for the collaborator-facing explanation of the generated ceiling results.
See also `reports/advisor-findings.md` for the current 100/500/1000/5000 SNP advisor results and what they imply for the present contract shape.
See also `reports/heprs-fixture-findings.md` for the historical HEPRS-backed mock-test baseline from before staged SNP upload.

* **Quantization Strategy:** GWAS weights (floats, e.g., 0.0045) are scaled by a factor (e.g., $10^8$) to fit into **`euint64`** integers.
* **Bit-Depth Optimization (planned, not yet implemented):** Intermediate chunk calculations should use **`euint16`** (cheaper gas) where possible, aggregating into larger types only for the final sum. The current contracts use `euint64` exclusively.
* **SIMD / Slot Packing (planned, not yet implemented):** Pack multiple SNPs into a single ciphertext vector to reduce the number of `fheMul` operations.
* **Trivial-Encryption Optimization (implemented):** `PRSComputeEngine` uses `FHE.mul(snp, FHE.asEuint64(weight))` for public model weights, which the coprocessor optimizes as a cheaper C×P operation internally (equivalent to the old `mulPlain`).
* **Target Metrics:** Reduce cost from ~$150 (Naive FHE) to ~$45 (Optimized) per run.

---

## 5. Current Implementation Status

**Environment:**

* **OS:** macOS (Apple Silicon).
* **Stack:** Hardhat + Node.js (v20+) via `@fhevm/hardhat-plugin` mock coprocessor — no Docker or external node needed.
* **Solidity:** `0.8.24`, `evmVersion: cancun`, optimizer at 200 runs.
* **Real FHE:** Sepolia testnet only (Zama deprecated the local Docker node approach).

**Codebase:**

| File | Purpose |
| --- | --- |
| `contracts/HEPRS.sol` (contains `BioETHPRS`) | Standalone chunked dot-product contract (`uploadModel`, `startPRS`, `computeChunk`, `finalize`). Inherits `ZamaEthereumConfig`. |
| `contracts/GenomicRegistry.sol` | URI-based SNP sample registry with per-address ACL. |
| `contracts/ModelMarketplace.sol` | Public and private GWAS model listing. Inherits `ZamaEthereumConfig`. |
| `contracts/PRSComputeEngine.sol` | Marketplace-aware chunked PRS engine. Inherits `ZamaEthereumConfig`. |
| `contracts/ResultOracle.sol` | DP noise injection + categorical classification. Inherits `ZamaEthereumConfig`. |
| `mock-archive/` | Archived transparent plaintext mock files (no longer on any import path). |
| `test/bioeth_prs_test.ts` | Chunked PRS unit tests for `BioETHPRS`. |
| `test/registry_marketplace_oracle_test.ts` | End-to-end integration test across all four contracts. |
| `test/utils/fhevm-helpers.ts` | `fhevmjs` helpers for encryption + input proof generation. |
| `scripts/gas_profile.ts` | Deploys marketplace + engine, runs multi-SNP gas profiling. |
| `scripts/heprs_fixture_profile.ts` | Profiles HEPRS-backed mock runs with phase timing and per-chunk timing. |

---

## 6. Next Steps & Roadblocks

### 6-A. Short-term

1. **Refine Quantization:** Determine the exact Scaling Factor ($10^6$ vs $10^8$) to minimize Mean Squared Error (MSE) vs. Gas Cost. Produce a table of scaling factor × SNP count → MSE.
2. **Differential Privacy Tuning:** Benchmark the exact amount of noise required to secure weights without destroying clinical accuracy.  Generate ROC / AUC curves at several noise levels.
3. **Gas Profiling:** Generate data points for the "Gas vs. SNP Count" curve from `scripts/gas_profile.ts` on a live fhEVM node.  Target SNP counts: 100, 300, 600, 1 000, 5 000.
   * For local mock timing on real HEPRS fixtures, use `npm run profile:heprs` (default `chunkSize=10`, constrained by the mock coprocessor's ~30 HCU/tx limit).
4. ~~**Registry ↔ Engine ACL Wiring**~~ ✓ Implemented: `createPRSJob(modelId, sampleId)` now calls `GenomicRegistry.hasAccess(sampleId, msg.sender)` and reverts if the caller lacks owner or delegated access.
5. **Access-control on `computeChunk`:** Currently any address may call `computeChunk(jobId)`. Decide if this is acceptable (permissionless relay) or restrict to `job.requester` or an allow-list.
6. **End-to-end Client Flow:** Integrate `fhevmjs` re-encryption, gateway-assisted decryption, and public decryption of the `ResultOracle` category.

### 6-B. Medium-term

1. **On-chain Noise Generation:** Explore using fhEVM's `FHE.randEuint64()` (or a VRF-seeded encrypted random) to generate DP noise trustlessly, rather than accepting it from the caller.
2. **Bit-Depth Optimization:** Implement `euint16` intermediate accumulators with widening adds to reduce per-`fheMul` gas.
3. **SIMD / Slot Packing:** Batch multiple SNPs per ciphertext to amortize FHE overhead.
4. **Marketplace Enhancements:** Add model pricing/fees (ERC-20 or native), model update/deprecation, and versioning.
5. **Job Cancellation & Cleanup:** Allow the requester to cancel an in-progress job and reclaim unused state.
6. **Finalize Event:** Emit a `JobFinalized` event from `finalize()` so off-chain indexers can track completed jobs.

### 6-C. Long-term / Research

1. **Formal Security Analysis:** Prove that the DP noise calibration + categorical bucketing is sufficient to prevent weight extraction under an adaptive adversary.
2. **Cross-chain Portability:** Evaluate deployment on Fhenix L2, Inco Network, and future fhEVM-compatible chains.
3. **Clinical Validation:** Compare on-chain PRS results (after de-quantization) against reference PLINK/PRSice scores to quantify MSE/AUC degradation.

---

## 7. Known Implementation Gaps & Risks

### 7-A. Registry ↔ Compute Engine Disconnect — Resolved

`createPRSJob(modelId, sampleId)` now calls `GenomicRegistry.hasAccess(sampleId, msg.sender)` before accepting any SNP data. The function reverts with `"No registry access"` if the caller is not the sample owner or a granted delegate, and reverts with `"Invalid sample"` if the `sampleId` does not exist. This closes the authorization gap: only parties registered against a sample may initiate a PRS job over it.

**Remaining scope:** This is an authorization check, not a data-integrity proof. The contract cannot verify that the submitted ciphertexts correspond to the registered sample's off-chain URI — that linkage is the caller's responsibility. Model probing via self-registered arbitrary data remains possible; differential privacy noise (§ 7-D) is the mitigation for that threat.

### 7-B. Marketplace Trust & Model Integrity

* No mechanism prevents listing garbage weights. On-chain validation of statistical quality is infeasible; consider off-chain attestation or DAO-curated whitelists.
* Models cannot be updated or deleted once listed; stale models persist forever.
* No payment / fee layer exists yet. Without incentives, researchers have no reason to list models.

### 7-C. Integer Overflow in euint64 Multiplication

Multiplying two `euint64` values can produce a result exceeding 64 bits (max $\approx 1.8 \times 10^{19}$). As a quick-screen under the simplified assumption `max_quantized_weight ~= scale` and hardcall dosage `<= 2`, require `scale × 2 × N < 2^64`. For example, at scale $10^8$ and `N=5000`, max accumulation is `5000 × 2 × 10^8 = 10^12`, which is safe. See `docs/reference/scaling-ceilings.md` for the generated ceiling table. For real models, use the advisor and exact per-model bounds rather than this simplified screen.

### 7-D. Differential Privacy Noise — Resolved (on-chain generation)

**Previous gap:** `ResultOracle.classify()` accepted `encryptedNoise` as a caller-supplied ciphertext.  A malicious caller could pass an encryption of zero, defeating all DP guarantees without the contract being able to detect it (the noise value is hidden from the EVM).

**Resolution (2 April 2026):** The caller-supplied noise parameter has been removed entirely.  `ResultOracle` now takes a `uint64 noiseUpperBound` constructor argument (immutable) and calls `FHE.randEuint64(noiseUpperBound)` inside every `classify()` call.  The noise value is generated by the fhEVM coprocessor and is unknowable to the caller before the transaction is mined.

**Why this approach:**

* *Zero-noise loophole closed*: the contract controls the noise source end-to-end.  Callers cannot bypass it by crafting a ciphertext.
* *`FHE.randEuint64(upperBound)` is available*: the Zama `@fhevm/solidity` library exposes bounded on-chain randomness for all `euintN` types.  On the mock coprocessor it produces a deterministic pseudo-random value; on Sepolia it uses the coprocessor's internal randomness.
* *Caller still sets scale*: `noiseUpperBound` is a constructor parameter, so deployers choose a noise magnitude appropriate for their model's score range.  It must be a positive power of two (enforced in the constructor and by the fhEVM coprocessor's `randBounded` precompile).  This is preferable to a commitment scheme or VRF, both of which add round-trips and complexity with no benefit once on-chain randomness is available.
* *Uniform vs Laplacian*: the noise is uniform over `[0, noiseUpperBound)`, not Laplacian.  Formal DP mechanisms require calibrated Laplacian or Gaussian noise; uniform noise is a weaker but practical approximation for the v1 threat model (preventing trivial zero-noise model extraction probes).  Laplacian noise generation in FHE is a known research problem and remains future work.

**Remaining scope:** The DP guarantee is only as strong as the choice of `noiseUpperBound` relative to the model's score distribution.  Setting it too small allows statistical reconstruction over many queries.  Calibration guidance (noise-to-score ratio, query budget analysis) is deferred to the research/paper work phase.

### 7-E. Permissionless `computeChunk`

Anyone can call `computeChunk(jobId)`, not just the requester. This is a design choice (allows relayers / meta-transactions) but also allows griefing if the computation has side-effects or if gas is wasted.  **Mitigation:** If permissionless relay is intended, document it; otherwise add `require(job.requester == msg.sender)`.

### 7-F. Incomplete or Abandoned PRS Job Uploads

Chunked SNP ingestion removes the old one-shot payload ceiling, but it also creates a new lifecycle state: jobs can now remain half-uploaded if the requester never finishes appending SNP chunks. Compute is correctly blocked until `finalizeSnpUpload`, but abandoned jobs still consume contract state. **Mitigation:** Add cancellation, expiry, or cleanup rules for incomplete jobs and consider whether deposits or fees should discourage abandoned uploads.

### 7-G. Gas Limit vs. Chunk Size

The optimal `chunkSize` depends on the fhEVM gas schedule, which differs significantly from vanilla EVM. A chunk that fits in 30 M gas on Hardhat may exceed the block limit on a live fhEVM chain.  **Mitigation:** Empirically profile chunk sizes on the target chain and expose a configurable default.

### 7-H. Cross-Contract Reads & State Machine Racing

The `computeChunk` function mutates storage (`nextChunkIndex`, `processedWeights`, `partialSum`, `complete`) after reading the next chunk from `ModelMarketplace`. In the current design the marketplace address is fixed at construction and the chunk getters are simple reads, so the practical re-entrancy surface is low, but this is no longer a pure single-contract state transition. Future extensions should preserve the trusted-read assumption or add a re-entrancy guard if callbacks or external hooks are introduced. Additionally, two concurrent `computeChunk` transactions for the same `jobId` could race. The EVM serialises them, but miners/sequencers could reorder them adversarially.

### 7-I. Mock vs. Real FHE Divergence

The `@fhevm/hardhat-plugin` mock coprocessor validates handles, ACL, and input proofs but still performs plaintext arithmetic. Tests that pass in mock mode may still fail on a real fhEVM deployment due to: differing gas costs, ciphertext expansion, or gateway decryption flow.  **Mitigation:** Confirm results on the Sepolia testnet (real FHE) before claiming a feature is production-ready. There is no local Docker node option — Zama deprecated it.

**Deployment infrastructure (implemented):**

The Sepolia deployment path is now fully instrumented:

* `hardhat.config.ts` — `sepolia` network block added; credentials via `npx hardhat vars set MNEMONIC` + `INFURA_API_KEY`.  `ZamaEthereumConfig` auto-configures the fhEVM coprocessor, KMS, and gateway contracts by detecting `chainId 11155111` at runtime — no manual gateway addresses needed.
* `scripts/deploy.ts` — Deploys all four contracts in dependency order (`GenomicRegistry` → `ModelMarketplace` → `PRSComputeEngine` → `ResultOracle`), saves addresses to `deployments/sepolia.json`.
* `scripts/sepolia_validation.ts` — End-to-end 100-SNP HEPRS fixture validation.  Uses `fhevm.userDecryptEuint` on Sepolia and `fhevm.debugger.decryptEuint` on mock, guarded by `fhevm.isMock`.  Run with `npm run validate:sepolia`.
* `scripts/probe_hcu_ceiling.ts` — Probes candidate chunkSizes `[10, 15, 20, 25, 32]` to find the real Sepolia HCU ceiling.  Run with `npm run probe:hcu`.

**Mock baseline (measured 2 April 2026 — `npm run validate:mock` + `npm run probe:hcu:mock`):**

| Validation point | Mock baseline | Sepolia observed |
| --- | --- | --- |
| Ciphertext input flow (`externalEuint64` + `inputProof`) | ✓ Accepted | TBD |
| ACL enforcement at `createPRSJob` | ✓ Registry check passes | TBD |
| Score decryption path | `debugger.decryptEuint` — 124 ms | `userDecryptEuint` (KMS re-encryption) — TBD |
| `JobFinalized` event received | ✓ in receipt | TBD |
| Correct score value | ✓ 758,685 = expected | TBD |
| Max safe `chunkSize` for `computeChunk` | **20** (60–74 HCU/tx mock budget; corrects prior claim of 10) | TBD — run `npm run probe:hcu` |
| Gas: `publishModel` (100 SNPs, chunkSize=10) | 1,675,915 | TBD |
| Gas: `computeChunk` per call (full chunk) | 622,748 | TBD |
| Total gas: 100-SNP end-to-end | 18,620,079 | TBD |

See `reports/mock-validation-findings.md` for full breakdown.  Once Sepolia results are available, fill in the "Sepolia observed" column and create `reports/sepolia-validation-findings.md`.
