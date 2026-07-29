# bioETH PRS — Design

Confidential on-chain Polygenic Risk Scoring via fhEVM. Validators compute an encrypted dot-product of genotype vectors × GWAS weights without ever seeing plaintext DNA or model weights.

Reference paper: Knight et al., 2026 — "Homomorphic encryption enables privacy preserving polygenic risk scores" (HEPRS). See `docs/PIIS2667237525003078.pdf`.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Contract Architecture](#2-contract-architecture)
   - [2.1 GenomicRegistry](#21-genomicregistry)
   - [2.2 ModelMarketplace](#22-modelmarketplace)
   - [2.3 PRSComputeEngine](#23-prscomputeengine)
   - [2.4 ResultOracle](#24-resultoracle)
   - [2.5 BioETHPRS — Legacy](#25-bioethprs--legacy)
3. [fhEVM Integration](#3-fhevm-integration)
   - [3.1 Handle model](#31-handle-model)
   - [3.2 ACL discipline](#32-acl-discipline)
   - [3.3 ZamaConfig and coprocessor addresses](#33-zamaconfig-and-coprocessor-addresses)
   - [3.4 Mock vs real FHE](#34-mock-vs-real-fhe)
4. [Execution Flows](#4-execution-flows)
   - [4.1 Classic chunked path](#41-classic-chunked-path)
   - [4.2 Streaming path](#42-streaming-path)
   - [4.3 Chunk size constraints](#43-chunk-size-constraints)
5. [Quantization](#5-quantization)
   - [5.1 The problem](#51-the-problem)
   - [5.2 Three-step unsigned encoding](#52-three-step-unsigned-encoding)
   - [5.3 Worked example](#53-worked-example)
   - [5.4 Overflow safety](#54-overflow-safety)
   - [5.5 Choosing a scale](#55-choosing-a-scale)
   - [5.6 Manifest metadata](#56-manifest-metadata)
6. [Security Invariants](#6-security-invariants)
7. [Known Gaps & Risks](#7-known-gaps--risks)
8. [Deployment](#8-deployment)

---

## 1. System Overview

### HEPRS paper adaptation

The original HEPRS protocol is centralised: a three-party system (Client, Modeler, Evaluator) using CKKS floating-point FHE. This project replaces that with a trustless on-chain design:

| HEPRS (original) | bioETH PRS (this repo) |
|---|---|
| Centralised Evaluator | Smart contract (trustless) |
| CKKS (approximate floats) | TFHE (exact integers) |
| Floating-point weights | Fixed-point quantized integers |
| Modeler-Evaluator trust assumption | Immutable smart contract code |
| Single server | Any relay can advance compute |

The core mathematical operation is identical: `score = Σ gᵢ × βᵢ` (genotype dosage × effect weight). The difference is the representation. CKKS handles signed floats natively; TFHE requires converting signed floats to unsigned integers via quantization (see [§5 Quantization](#5-quantization)).

**Why TFHE over CKKS:** Zama's fhEVM exposes TFHE integers as EVM precompiles. CKKS is not available in this stack. TFHE gives exact integer arithmetic rather than approximate real arithmetic — a better fit for deterministic on-chain computation. The quantization overhead is acceptable.

---

## 2. Contract Architecture

Four production contracts plus one legacy standalone:

```
GenomicRegistry   ←── ACL check at job creation
      ↓
ModelMarketplace  ←── weight chunks, public or encrypted
      ↓
PRSComputeEngine  ←── chunked dot-product state machine
      ↓
ResultOracle      ←── noise + categorical classification
```

**Why four contracts:** Each layer has a different trust surface and upgrade lifecycle. Registry ACL is patient data. Marketplace is researcher data. Engine is computation logic. Oracle is noisy-release policy. Separating them keeps each contract independently auditable and upgradeable.

---

### 2.1 GenomicRegistry

URI-based sample registry with per-address ACL. No FHE operations.

**Storage:** `sampleId → (uri, owner, mapping(address → bool))`

**Key functions:**

- `registerSample(uri)` → `sampleId` — legacy path with no manifest hash
- `registerSampleWithManifest(uri, manifestHash)` → `sampleId` — anchors off-chain sample provenance metadata
- `grantAccess(sampleId, grantee)` / `revokeAccess(sampleId, grantee)`
- `getSample(sampleId)` → `(uri, owner)` — ACL-gated view
- `getSampleManifestHash(sampleId)` → `bytes32` — public provenance anchor
- `hasAccess(sampleId, caller)` → `bool` — called by PRSComputeEngine at job creation

**Design note:** URIs are stored as plaintext in contract storage. The ACL gates Solidity reads, but any node operator can read storage directly via `eth_getStorageAt`. URIs are no longer emitted in events (patched April 2026) but the storage values remain plaintext. True URI confidentiality requires encrypting the URI before storing, or committing only a hash. The `manifestHash` field anchors provenance metadata such as source file hash, lab signature, genome build, SNP order, and genotype encoding rules, but does not prove that later uploaded encrypted SNP handles match the manifest. Documented as acceptable for v1.

---

### 2.2 ModelMarketplace

Chunked publication of GWAS weight arrays, public or encrypted. Stores models; does not compute.

**Key design decision:** `uploadChunkSize` (publication batch, max 32, fhEVM proof budget) and `computeChunkSize` (HCU-safe retrieval slice, ≤20 on mock) are independent. Weights are stored flat and sliced on read.

**`ModelHeader` fields:**

- `owner`, `isPrivate`, `finalized`
- `weightCount`, `uploadChunkSize`, `computeChunkSize`, `chunkCount`
- `uploadedWeightCount` (progress during publication)
- `manifestURI`, `manifestHash`, `sourceModelHash` (provenance)
- `weightZeroPoint`, `scoreOffset` (quantization correction metadata — see [§5](#5-quantization))

**Publication lifecycle:**

1. `createModelShell(isPrivate, weightCount, uploadChunkSize, computeChunkSize, manifestURI, ..., weightZeroPoint, scoreOffset)` → draft model
2. `appendPublicModelChunk(modelId, uint64[] weights)` — or `appendEncryptedModelChunk(modelId, externalEuint64[], inputProof)` for private; max 32 per call
3. `finalizeModel(modelId)` → immutable; compute jobs may now reference it

**Compute paths:**

- Public weights → `FHE.mul(snp, FHE.asEuint64(weight))` — trivially encrypted, but charged as C×C (see §HCU note); ~28% cheaper than private in host gas, from packed storage reads rather than coprocessor optimisation
- Private weights → `FHE.mul(encryptedWeight, snp)` — C×C, full FHE multiply

**Access control:** Only `owner` may append chunks, finalize, and manage private readers. Private model compute requires `setPrivateModelReader(modelId, reader, true)` for both the engine contract address and the individual requester.

**Known gaps:** No payment/fee mechanism. No model versioning or deprecation. Models are immutable after finalization. Off-chain DAO curation is the recommended v1 mitigant.

---

### 2.3 PRSComputeEngine

Chunked dot-product with a job state machine. This is the main computation contract.

**Job states:** `PENDING → UPLOADING → READY → COMPUTING → DONE`

State transitions:

- `createPRSJob` → UPLOADING
- `finalizeSnpUpload` → READY
- Each `computeChunk` advances COMPUTING
- Last `computeChunk` → DONE (also set by `appendAndComputeChunk` in streaming path)

**Key functions:**

- `createPRSJob(modelId, sampleId)` — checks registry ACL + model finalization + private model auth; initialises job shell with model geometry
- `appendSnpChunk(jobId, externalEuint64[], inputProof)` — requester-only; stores SNP handles in `snpData[jobId]`; max `uploadChunkSize` values/call
- `finalizeSnpUpload(jobId)` — requester-only; gates compute start
- `computeChunk(jobId)` — **permissionless**; reads `snpData[jobId]` for the current compute chunk, multiplies against model weights, accumulates into `partialSum` and `genoSum`
- `appendAndComputeChunk(jobId, externalEuint64[], inputProof)` — streaming path; no `snpData` writes (see [§4.2](#42-streaming-path))
- `finalize(jobId)` — requester-only; applies quantization correction, grants ACL, returns encoded score
- `finalizeTo(jobId, grantee)` — like `finalize` but grants ACL to another address
- `finalizeAndClassify(jobId)` — oracle-only atomic path; never exposes raw score to requester. Oracle and both thresholds come from the model's immutable release policy, not from the caller
- `readPartial(jobId)` — requester-only; returns running encrypted partial sum

**Quantization correction in `finalize`:**

```solidity
euint64 withOffset  = FHE.add(job.partialSum, FHE.asEuint64(job.scoreOffset));
euint64 correction  = FHE.mul(job.genoSum, FHE.asEuint64(job.weightZeroPoint));
euint64 encodedScore = FHE.sub(withOffset, correction);
```

The rearrangement `(partialSum + scoreOffset) - (weightZeroPoint × genoSum)` avoids unsigned underflow when the signed dot-product would otherwise be negative. See [§5](#5-quantization) for the full derivation.

**Why permissionless compute:** Relayers pay gas to advance computation but learn no plaintext — they only see encrypted handles. The requester controls SNP upload, output ACL, and finalization. This enables meta-transactions and relay services.

**Why sequential accumulation (not map-reduce):** v1 keeps one running `partialSum`. Parallel per-chunk accumulators would require duplicate-work prevention and a final reduction phase. The sequential accumulator is simpler, faster to test, and correct.

**Two-path mutual exclusion:** The classic path (`appendSnpChunk` → `finalizeSnpUpload` → `computeChunk`) and the streaming path (`appendAndComputeChunk`) are mutually exclusive per job. The guard uses: if `uploadedSnpCount > 0` → classic path is in use; if `nextChunkIndex > 0 && uploadedSnpCount == 0` → streaming path is in use.

---

### 2.4 ResultOracle

Bounded randomized categorical release. All operations remain encrypted. The mechanism is one-sided uniform noise on `[0, B)` plus thresholding. It is **not** differential privacy and provides no `(epsilon, delta)` guarantee: the noise is one-sided rather than symmetric, is not calibrated to any sensitivity bound, and is not accounted across repeated queries. No adjacency definition, sensitivity analysis, or composition analysis exists in this codebase.

**Noise mechanism:** `noiseUpperBound` set at construction (must be a positive power of 2 — fhEVM requirement for `randEuint64`). Each call generates `noise = FHE.randEuint64(noiseUpperBound)` — unknowable to caller before the transaction mines.

**Key functions:**

- `classify(externalEuint64 encryptedScore, bytes inputProof, uint64 low, uint64 high)` — user submits re-encrypted score
- `classifyPreauthorized(externalEuint64 handle, uint64 low, uint64 high)` — engine-mediated handoff (called by `finalizeAndClassify`)

**Output:** `euint8` category (0=Low, 1=Medium, 2=High), made publicly decryptable via `FHE.makePubliclyDecryptable`. **Never applied to `euint64` scores.**

**Classification logic (all encrypted):**

```solidity
euint64 noisy    = FHE.add(score, noise);
ebool   isLow    = FHE.lt(noisy, lowThreshold);
ebool   belowHi  = FHE.lt(noisy, highThreshold);
ebool   isMedium = FHE.and(FHE.not(isLow), belowHi);
euint8  category = FHE.select(isLow, Low, FHE.select(isMedium, Medium, High));
```

`FHE.select` is used instead of `if` because branching on an encrypted boolean would reveal plaintext information.

**Bias correction:** Uniform noise ∈ [0, noiseUpperBound) introduces an expected upward bias of `noiseUpperBound/2`. Call `expectedNoiseBias()` to get this value. Callers must add it to each threshold:

```
adjustedThreshold = intendedThreshold + oracle.expectedNoiseBias()
```

This is a deterministic, correctable bias. A formal `(epsilon, delta)` guarantee would additionally require a calibrated two-sided mechanism, a PRS sensitivity analysis, and repeated-query composition accounting — none of which are implemented.

---

### 2.5 BioETHPRS — Legacy

`contracts/legacy/HEPRS.sol`. Standalone prototype — embedded model, no marketplace dependency. Retained for onboarding and comparison. Do not build new features on it.

---

## 3. fhEVM Integration

### 3.1 Handle model

Every `euint64` is a 32-byte handle — an identifier pointing to a ciphertext managed off-chain by the coprocessor. Contracts never hold raw plaintexts or ciphertexts in storage; only 32-byte handles are stored on-chain.

`externalEuint64` is the wire type for ciphertexts arriving from a user. The contract calls `FHE.fromExternal(handle, inputProof)` to validate the proof and receive a usable on-chain handle, then `FHE.allowThis(result)` before storing. In the streaming path, `allowThis` is intentionally skipped on intermediate SNP handles because they are consumed within the same transaction and never stored.

`FHE.asEuint64(plainValue)` creates a trivially encrypted handle for a plaintext constant. **It does not obtain a scalar-multiplication discount.** Because the result is a genuine `euint64` handle, `FHE.mul` resolves to the `euint64 × euint64` overload, which passes `scalar = false`; the mock's own HCU table charges 596,000 for `Uint64` non-scalar versus 365,000 scalar. Measured consequence: the compute-chunk HCU ceiling is **21 for both public and private models**, not higher for public ones.

Public-weight models are nonetheless cheaper to compute — measured at 1,150,414 vs 1,604,024 gas per 20-SNP chunk, about 28% — but the saving comes from reading packed `uint64[]` weights instead of one 32-byte `euint64` handle per weight, not from any coprocessor optimisation.

The scalar discount is available: `FHE.mul(euint64 a, uint64 b)` passes `scalar = true`. Adopting it would cut 231,000 HCU per multiplication (38.8%) and raise the public ceiling to roughly 34 SNPs per chunk, reducing compute transactions for a 5,000-SNP job from 239 to about 148. This is recorded as `CD-022` and deferred rather than applied, because changing `computeChunk` would invalidate the gas and adversarial measurements already taken in Phases 4-6.

### 3.2 ACL discipline

Every encrypted handle has an access control record in the `ACL` contract:

| Function | Effect | Persisted? |
|---|---|---|
| `FHE.allowThis(handle)` | Contract may use handle in future transactions | Yes — `SSTORE` in ACL |
| `FHE.allow(handle, user)` | User may decrypt via Gateway | Yes — `SSTORE` in ACL |
| `FHE.allowTransient(handle, addr)` | Address may use handle this transaction only | No — EIP-1153 `tstore` |
| `FHE.makePubliclyDecryptable(handle)` | Anyone may decrypt | Yes — `SSTORE` in ACL |

**Rule:** Call `FHE.allowThis(handle)` on every new handle written to contract state. Call `FHE.allow(handle, user)` before returning a handle to a user. Violation causes the handle to be unusable in subsequent transactions (ACL check fails).

The persistent `FHE.allowThis` call is one of the two main gas costs per uploaded SNP in the classic path (~25K gas SSTORE in ACL). The streaming path avoids this by using only transient access for intermediate handles.

### 3.3 ZamaConfig and coprocessor addresses

All computation contracts inherit `ZamaEthereumConfig` from `@fhevm/solidity/config/ZamaConfig.sol`. This auto-wires coprocessor, KMS, and ACL contract addresses — identical values for Hardhat mock and Sepolia, so no contract code changes are needed between environments.

### 3.4 Mock vs real FHE

`@fhevm/hardhat-plugin` deploys mock coprocessor, ACL, and KMS contracts at the same addresses as Sepolia. The mock validates the full fhEVM protocol (handles, ACL, input proofs) but performs plaintext arithmetic behind the scenes.

Tests use `fhevm.debugger.decryptEuint` — a debug-only bypass that skips the KMS round-trip. On Sepolia, decryption requires a KMS re-encryption round-trip (async, seconds). The same contract code deploys to both environments unchanged.

The mock's off-chain `FhevmDB` stores handle→plaintext mappings in Node.js memory for debug decrypt. This is purely off-chain — it does not inflate on-chain gas costs vs Sepolia.

---

## 4. Execution Flows

### 4.1 Classic chunked path

```
# Model publication (researcher)
createModelShell(isPrivate, weightCount, uploadChunkSize=32, computeChunkSize=20, ...)
appendPublicModelChunk(modelId, weights)     ← ceil(N/32) times
finalizeModel(modelId)

# PRS job (patient)
createPRSJob(modelId, sampleId)
appendSnpChunk(jobId, encryptedSnps, inputProof)   ← ceil(N/32) times; SNP handles stored in snpData[]
finalizeSnpUpload(jobId)
computeChunk(jobId)    ← ceil(N/20) times; permissionless; reads snpData[], accumulates partialSum
finalizeAndClassify(jobId)                     ← oracle-only; thresholds from model policy
# OR: finalize(jobId)  ← patient gets raw encrypted score handle
```

Upload and compute are separate phases. SNP handles are persisted in `snpData[jobId]` across transactions. This allows upload and compute to be done by different parties or at different times (enabling relay services). Gas cost: ~166K/SNP total (61% upload, 34% compute). See `reports/classic-gas.md`.

### 4.2 Streaming path

```
createPRSJob(modelId, sampleId)
appendAndComputeChunk(jobId, encryptedSnps, inputProof)   ← ceil(N/computeChunkSize) times
finalize(jobId)   # or finalizeAndClassify
```

Each `appendAndComputeChunk` call accepts exactly `computeChunkSize` SNPs, calls `FHE.fromExternal`, immediately multiplies against model weights, accumulates into `partialSum`/`genoSum`, and discards the SNP handles. No `snpData` writes. No `finalizeSnpUpload` step.

**Savings:** ~37% gas reduction (~62K gas/SNP) by eliminating two persistent SSTOREs per SNP: the `snpData` handle SSTORE and the `ACL.persistedAllowedPairs` SSTORE. See `reports/streaming-gas.md`.

**Constraint:** Upload and compute are coupled in each call. Both the HCU budget (≤20 SNPs) and the input-proof budget (≤32 SNPs) must be satisfied simultaneously. At `computeChunkSize=20` this is fine (20 < 32). Not suitable for multi-party flows where upload and compute are done by different signers.

### 4.3 Chunk size constraints

| Parameter | Value | Constraint |
|---|---|---|
| `uploadChunkSize` | 32 | fhEVM input-proof budget: 2048 bits / 64 bits per euint64 |
| `computeChunkSize` | 20 (mock) | HCU budget: ~60-74 ops/tx; each SNP = 3 ops (mul + add + genoAdd) |
| `computeChunkSize` | TBD (Sepolia) | Run `npm run probe:hcu` after first Sepolia deployment |

HCU ops per `computeChunk` call with N SNPs: `3N + 2` (3 FHE ops per SNP plus 2 `allowThis` on accumulator handles). At N=20: 62 ops — within the 60-74 mock budget.

---

## 5. Quantization

### 5.1 The problem

Three constraints must hold simultaneously:

1. PRS weights (`beta_i`) are signed floats (can be negative)
2. fhEVM arithmetic operates on unsigned encrypted integers (`euint64`)
3. On-chain arithmetic must stay within safe bounds — overflow silently wraps

A naive "multiply by scale" approach fails because negative weights produce negative integers, which cannot be stored in `euint64`.

### 5.2 Three-step unsigned encoding

**Step 1 — Scale to integers**

```
q_i = round(scale × beta_i)
```

The scale is chosen per model based on weight distribution and SNP count (see [§5.5](#55-choosing-a-scale)).

**Step 2 — Shift weights to unsigned (`weightZeroPoint`)**

```
weightZeroPoint = -min(q_i)
u_i = q_i + weightZeroPoint       # u_i ≥ 0 for all i
```

The contract stores `u_i`. The raw dot-product of `g_i × u_i` is no longer the true PRS — it includes a constant contribution from the shift. The contract also tracks the sum of all genotype dosages (`genoSum`) to correct for this:

```
raw_score_q = Σ(g_i × u_i) - weightZeroPoint × geno_sum
```

**Step 3 — Shift score to unsigned (`scoreOffset`)**

`raw_score_q` can still be negative (for a patient with many risk-decreasing alleles). To keep the final result in unsigned space for threshold comparison:

```
scoreOffset = -raw_min    where raw_min = Σ(2 × min(q_i, 0))
encoded_score = raw_score_q + scoreOffset
```

The encoded score is always non-negative and lives in `[0, encoded_range]`.

**Decoding after decryption:**

```
raw_score_q = encoded_score - scoreOffset
final_score  = raw_score_q / scale
```

**On-chain implementation** (in `PRSComputeEngine._encodeFinalScore`):

```solidity
euint64 withOffset   = FHE.add(job.partialSum, FHE.asEuint64(job.scoreOffset));
euint64 correction   = FHE.mul(job.genoSum, FHE.asEuint64(job.weightZeroPoint));
euint64 encodedScore = FHE.sub(withOffset, correction);
```

The rearrangement `(partialSum + scoreOffset) - (weightZeroPoint × genoSum)` avoids the intermediate negative value that would occur if `raw_score_q` were computed directly.

### 5.3 Worked example

**Setup:** 3 SNPs, weights `[-0.30, 0.10, 0.25]`, scale = 100

```
Step 1 — quantize:
  q = [-30, 10, 25]

Step 2 — shift weights:
  weightZeroPoint = 30
  u = [0, 40, 55]

Step 3 — compute for genotypes [0, 2, 1]:
  Σ(g_i × u_i) = 0×0 + 2×40 + 1×55 = 135
  geno_sum      = 0 + 2 + 1 = 3
  raw_score_q   = 135 - 30×3 = 45

Step 4 — encode:
  raw_min     = 2×min(-30,0) + 2×min(10,0) + 2×min(25,0) = -60
  scoreOffset = 60
  encoded     = 45 + 60 = 105

Decode after decryption:
  raw_score_q = 105 - 60 = 45
  final_score = 45 / 100 = 0.45   ✓ (matches plain dot-product: 0×-0.30 + 2×0.10 + 1×0.25)
```

### 5.4 Overflow safety

The final encoded score bound is:

```
encoded_range = raw_max - raw_min ≤ 2^64 - 1  (~1.8 × 10^19)

where:
  raw_max = Σ(2 × max(q_i, 0))
  raw_min = Σ(2 × min(q_i, 0))
```

The contract's largest unsigned intermediate is `partialSum + scoreOffset`, so
the conservative manifest-independent quick screen is stronger:

```
2 × genotypeMax × scale × N_snps ≤ 2^64 - 1
```

For genotype hardcalls, `genotypeMax = 2`. At scale 10⁸ and 5,000 SNPs with
max single-weight magnitude 1.0:

- conservative intermediate bound `≈ 2 × 2 × 10⁸ × 5,000 = 2 × 10¹²` — well within `uint64` range

Do not use `scale × 2 × N_snps` as the only check — compute exact bounds from the actual quantized weight vector. The quantization advisor does this automatically and is faster.

### 5.5 Choosing a scale

Run before publishing any model:

```bash
npm run advisor:quantization
```

Three tiers:

- **baseline** (~10²) — lowest gas, ~15% MAE on HEPRS fixtures. Not suitable for clinical use.
- **balanced** (~10⁶) — machine-epsilon error on HEPRS fixtures. **Default for all models.**
- **max_precision** (~10⁸-10¹⁰) — no improvement over balanced on current fixtures.

Use **balanced**. The gas bottleneck is SNP upload transaction count, not scale precision. See `reports/quantization-advisor.md` for full results across all fixture sizes.

### 5.6 Manifest metadata

Every published model should include these fields in its `manifestURI` document:

| Field | Purpose |
|---|---|
| `weightScale` | Scale factor used |
| `weightZeroPoint` | Shift applied to weights |
| `scoreOffset` | Shift applied to final score |
| `rawMin` / `rawMax` | Exact encoded score bounds |
| `encodedRange` | `raw_max - raw_min` |
| `genotypeMode` | `hardcall_0_1_2` (v1) |
| `accumulatorBits` | 64 (v1) |
| `thresholdsEncoded` | Oracle thresholds in encoded domain |
| `sourceModelHash` | Hash of upstream GWAS file |

`weightZeroPoint` and `scoreOffset` are stored in `ModelHeader` on-chain — passed through to `PRSComputeEngine` at job creation and applied in `_encodeFinalScore`.

---

## 6. Security Invariants

Never violate these:

1. **No raw scores publicly decryptable.** `FHE.makePubliclyDecryptable` is called only on `euint8` risk categories. Never on `partialSum` or final PRS scores (`euint64`).

2. **ACL on every encrypted output.** Every `euint64` returned to a user must have `FHE.allow(handle, userAddress)` before the function returns.

3. **Quantization ceiling.** The largest unsigned intermediate must fit in `uint64` (~1.8×10¹⁹). Use the conservative quick screen `2 × genotypeMax × scale × N_snps ≤ uint64_max`, then run `npm run advisor:quantization` for exact per-model bounds before deploying new models.

4. **On-chain noise generation.** `ResultOracle` generates noise via `FHE.randEuint64(noiseUpperBound)`. Zero-noise calls are impossible — the constructor rejects `noiseUpperBound == 0` and non-power-of-two values.

5. **State machine integrity.** Job transitions: `PENDING → UPLOADING → READY → COMPUTING → DONE`. `computeChunk` reverts before `finalizeSnpUpload` completes. `appendAndComputeChunk` and `appendSnpChunk` are mutually exclusive per job.

6. **Registry ACL checked at job creation.** `createPRSJob` checks `GenomicRegistry.hasAccess(sampleId, msg.sender)`. Individual compute chunks do not re-check. Registry revocation after job creation does not stop in-flight computation.

7. **Rate limiting enforced at job creation.** When a model owner configures a rate limit (`setRateLimit`), `createPRSJob` enforces per-model, per-wallet and per-model, per-sample block-windowed job count limits. This throttles repeated probing and closes the simple same-sample/new-wallet bypass, but it is not a full Sybil-resistant identity layer. Default is unlimited (backwards-compatible). Block-based windows (not timestamps) prevent miner manipulation.

8. **Oracle-required mode.** When a model's release policy sets `oracleRequired`, `finalize()`, `finalizeTo()`, and `readPartial()` revert — forcing all output through `finalizeAndClassify()` and the oracle's bounded randomized categorical release. Prevents requesters from bypassing noise by decrypting raw scores directly.

9. **Minimum threshold gap.** Enforced at two points. `ModelMarketplace.setReleasePolicy` rejects a gap below the oracle's `noiseUpperBound` when the policy is configured, so a model cannot be published with a policy that would always revert. `ResultOracle._classifyScore` re-checks the same condition, which still guards the generic `classify()` entry point. Prevents thresholds so narrow that classification becomes deterministic, defeating the randomized release.

10. **Model-defined release policy; no requester-chosen thresholds.** `PRSComputeEngine.finalizeAndClassify(jobId)` accepts only a job id. The oracle address and both classification thresholds are read from `ModelMarketplace.getReleasePolicy(modelId)`, fixed by the model owner before the model was finalized. A requester able to vary thresholds across calls performs a binary search on the encrypted score, extracting far more per query than a ternary classification and largely defeating the randomized release; removing the parameters removes the channel rather than mitigating it. Calling `finalizeAndClassify` on a model with no policy reverts with "Model has no release policy".

11. **Release policy immutable after model finalization.** `setReleasePolicy` is guarded by `_requireOwnedDraftModel`, so a policy can only be set while the model is a draft, and there is no update or clear function. The superseded `setOracleRequired` and `setApprovedOracle` setters have been removed, because either would have allowed an owner to publish a model under a strict policy and then swap the oracle or relax the thresholds once requesters had committed to it. `getApprovedOracle` and `isOracleRequired` survive as read-only views over the policy.

12. **Single-finalize per job.** `finalize()`, `finalizeTo()`, and `finalizeAndClassify()` each set a `finalized` flag on the job and revert on any subsequent call. Prevents a requester from issuing multiple score handles for the same job, which would generate redundant FHE ops and could be exploited to probe the oracle multiple times per rate-limit slot.

---

## 7. Known Gaps & Risks

### SNP→sample linkage (open research problem)

`createPRSJob` verifies registry ACL but cannot verify that submitted SNP ciphertexts match the registered sample's off-chain data. `GenomicRegistry.registerSampleWithManifest` now stores a manifest hash that can anchor source file hashes, lab signatures, genome build, SNP order, and encoding rules, but the current contract does not verify ciphertext-to-manifest consistency. A malicious requester can still submit arbitrary SNP values. Rate limiting + noisy categorical bucketing mitigate model probing but do not eliminate it. This remains unresolved in v1.

### Requester sees raw score before oracle (mitigated)

`finalize()` gives the requester a raw `euint64` handle, bypassing noisy categorical release. **Mitigation (v1):** Model owners can set `oracleRequired=true`, which blocks `finalize()`, `finalizeTo()`, and `readPartial()` — forcing all output through `finalizeAndClassify()` and the oracle's noise layer. This is now protocol-enforced per model, not just a user-level recommendation.

### Uniform noise upward bias

Uniform noise from `[0, noiseUpperBound)` introduces an expected upward bias of `noiseUpperBound/2`. Callers who don't adjust thresholds see systematic score inflation. Call `oracle.expectedNoiseBias()` and add the result to each classification threshold.

### Probing attack cost (rate limiting)

With rate limit R queries per W-block window, noise bound B, and K=3 categorical buckets, each query reveals only a noisy category rather than a raw score when `oracleRequired` is enabled. The current limit is enforced both per wallet and per sample, so rotating wallets does not bypass the quota for the same registered sample. This is still not full Sybil resistance: a determined attacker can use many samples, many identities, or compromised credentials unless the deployment adds identity, staking, or verifiable-credential controls.

### Rate limiting window design

Block-based windows (`block.number`) are used instead of timestamps (`block.timestamp`) because validators can manipulate timestamps within bounds. Alternative: time-based windows are more intuitive but marginally less secure. The current design is deterministic.

### ACL revocation mid-job

- Registry revocation: in-flight job continues (ACL checked only at creation)
- Private model reader revocation: in-flight job fails on next `computeChunk` (each chunk re-checks model reader auth)

Both behaviours are intentional for v1 and tested.

### Job cancellation

`cancelJob(jobId)` allows the requester to abandon any non-complete job. Cancellation is permanent — all subsequent operations (upload, compute, finalize) revert. SNP storage (`snpData[jobId]`) is deleted on cancel to reclaim gas from classic-path uploads. The rate limit slot consumed at creation is refunded if the current block window is still active, allowing an immediate replacement job.

Complete jobs cannot be cancelled — the requester can simply choose not to finalize.

### `computeChunk` is permissionless (by design)

`computeChunk(jobId)` (classic path) has no `require(job.requester == msg.sender)` guard — any address may advance the compute for any job. This is intentional: compute is deterministic and non-interactive, so a third party advancing a job does not affect correctness or confidentiality. The gas cost falls on whoever calls it, which is a disincentive for griefing but not a hard restriction. `appendAndComputeChunk` (streaming path) does require the requester because upload and compute are coupled in the same call.

### URI observability

`GenomicRegistry` stores sample URIs in contract storage. Any node can read via `eth_getStorageAt`. URIs are no longer emitted in events (patched April 2026), but storage values remain plaintext. True confidentiality requires storing only a hash or commitment.

### Marketplace model quality

No mechanism prevents listing garbage weights. Models cannot be updated after finalisation. No fee layer incentivises quality. Off-chain DAO curation is the v1 mitigant.

### Sepolia HCU ceiling unknown

Mock `computeChunkSize=20` is a local constraint. Sepolia may allow much larger chunks. Run `npm run probe:hcu` after first Sepolia deployment and update `computeChunkSize` in any new model shells.

---

## 8. Deployment

### Sepolia (real FHE)

Infrastructure is ready. Pending: testnet ETH and credentials.

```bash
npx hardhat vars set MNEMONIC
npx hardhat vars set SEPOLIA_RPC_URL   # optional; defaults to PublicNode
npx hardhat vars set INFURA_API_KEY    # optional alternative to SEPOLIA_RPC_URL
npm run deploy:sepolia         # deploy all 4 contracts
npm run validate:sepolia       # 100-SNP end-to-end with real FHE
npm run probe:hcu              # find real HCU ceiling; update computeChunkSize
```

After Sepolia: fill in TBD cells in `reports/classic-gas.md`, update `computeChunkSize` in any new model shells if the ceiling changes.

### Beyond Sepolia

The contracts target Zama's fhEVM stack (`ZamaEthereumConfig`). Production deployment options and cost analysis: see `reports/deployment-cost.md`.

### References

- PGS Catalog scoring conventions: <https://www.pgscatalog.org/downloads/>
- PLINK 2.0 scoring: <https://www.cog-genomics.org/plink/2.0/score>
- Zama fhEVM types: <https://docs.zama.org/protocol/solidity-guides/smart-contract/types>
- Zama HCU cost guide: <https://docs.zama.org/protocol/solidity-guides/development-guide/hcu>
- HEPRS reference paper: `docs/PIIS2667237525003078.pdf`
