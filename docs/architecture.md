# bioETH PRS — Architecture

Confidential on-chain Polygenic Risk Scoring via fhEVM. Validators compute an encrypted dot-product of a user's genotype vector against GWAS weights without ever seeing plaintext DNA or model weights.

Reference paper: Knight et al., 2026 — "Homomorphic encryption enables privacy preserving polygenic risk scores" (HEPRS). See `docs/PIIS2667237525003078.pdf`.

---

## HEPRS Paper Adaptation

The original HEPRS protocol is centralized: a three-party system (Client, Modeler, Evaluator) using CKKS floating-point FHE. This project replaces that with a trustless on-chain design:

| HEPRS (original) | bioETH PRS (this repo) |
|---|---|
| Centralized Evaluator | Smart contract (trustless) |
| CKKS (approximate floats) | TFHE (exact integers) |
| Floating-point weights | Fixed-point quantized integers |
| Modeler-Evaluator trust assumption | Immutable smart contract code |
| Single server | Any relay can advance compute |

The core mathematical operation is identical: `score = Σ gᵢ × βᵢ` (genotype dosage × effect weight). The difference is the representation. CKKS handles signed floats natively; TFHE requires converting signed floats to unsigned integers via quantization (see `docs/quantization.md`).

**Why TFHE over CKKS:**
Zama's fhEVM uses TFHE integers as EVM precompiles. CKKS is not available in this stack. TFHE gives exact integer arithmetic rather than approximate real arithmetic, which is a better fit for deterministic on-chain computation — the quantization cost is acceptable.

---

## Contract Architecture

Four production contracts plus one legacy standalone:

```
GenomicRegistry   ←── ACL check at job creation
      ↓
ModelMarketplace  ←── weight chunks, public or encrypted
      ↓
PRSComputeEngine  ←── chunked dot-product state machine
      ↓
ResultOracle      ←── DP noise + categorical classification
```

**Why four contracts instead of one:**
Each layer has a different trust surface and different upgrade lifecycle. Registry ACL is user data. Marketplace is researcher data. Engine is computation logic. Oracle is DP policy. Separating them lets each evolve independently and keeps each contract auditable.

---

### GenomicRegistry

URI-based sample registry with per-address ACL.

**Storage:** `sampleId → (uri, owner, mapping(address → bool))`

**Functions:**
- `registerSample(uri)` → `sampleId`
- `grantAccess(sampleId, grantee)` / `revokeAccess(sampleId, grantee)`
- `getSample(sampleId)` → `(uri, owner)` — ACL-gated
- `hasAccess(sampleId, caller)` → `bool` — used by PRSComputeEngine

**Limitation:** URIs are stored as plaintext in contract storage. The ACL gates Solidity reads, but any node operator can read storage directly via `eth_getStorageAt`. True URI confidentiality requires encrypting the URI before storing or committing only a hash. For v1 this is documented as acceptable.

---

### ModelMarketplace

Chunked publication of GWAS weight arrays, public or encrypted.

**Key design:** `uploadChunkSize` (publication batch) and `computeChunkSize` (HCU-safe retrieval slice) are independent. Weights are stored flat and sliced by `computeChunkSize` on read.

**Header fields per model:**
- `owner`, `isPrivate`, `finalized`
- `weightCount`, `uploadChunkSize`, `computeChunkSize`, `chunkCount`
- `uploadedWeightCount` (progress during publication)
- `manifestURI`, `manifestHash`, `sourceModelHash` (provenance)
- `weightZeroPoint`, `scoreOffset` (quantization metadata)

**Publication lifecycle:**
1. `createModelShell(isPrivate, weightCount, uploadChunkSize, computeChunkSize, manifestURI, ...)` → draft model
2. `appendPublicModelChunk(modelId, uint64[] weights)` — or `appendEncryptedModelChunk(modelId, externalEuint64[] weights, inputProof)` for private models (max 32/call, fhEVM input-proof budget)
3. `finalizeModel(modelId)` → immutable; compute jobs may now reference it

**Compute paths:**
- Public weights → `FHE.mul(snp, FHE.asEuint64(weight))` (trivially encrypted, ~60% cheaper than C×C)
- Private weights → `FHE.mul(encryptedWeight, snp)` (C×C)

**Access control:**
- Only `owner` may append chunks, finalize, and manage private readers
- Private model reads require `setPrivateModelReader(modelId, reader, true)` — both the compute engine address and the requester must be authorized

**Known gaps:** No payment/fee mechanism. No model versioning or deprecation. Models are immutable after finalization.

---

### PRSComputeEngine

Chunked dot-product with a job state machine. The main computation contract.

**Job states:** `PENDING → UPLOADING → READY → COMPUTING → DONE`

State transitions:
- `createPRSJob` → UPLOADING
- `finalizeSnpUpload` → READY
- Each `computeChunk` advances COMPUTING
- Last `computeChunk` → DONE

**Functions:**
- `createPRSJob(modelId, sampleId)` — checks registry ACL + model finalization + private model authorization
- `appendSnpChunk(jobId, externalEuint64[], inputProof)` — requester-only; max 32 values/call
- `finalizeSnpUpload(jobId)` — requester-only; enables compute
- `computeChunk(jobId)` — **permissionless**; one chunk per call; reverts if HCU exceeded
- `readPartial(jobId)` — requester-only; returns encrypted running sum
- `finalize(jobId)` — requester-only; applies quantization correction, grants ACL, returns encoded score
- `finalizeTo(jobId, grantee)` — like `finalize` but grants ACL to another address
- `finalizeAndClassify(jobId, oracle, lowThreshold, highThreshold)` — oracle-only path that never exposes raw score to requester

**Quantization correction in `finalize`:**
```solidity
euint64 withOffset = FHE.add(job.partialSum, FHE.asEuint64(job.scoreOffset));
euint64 correction = FHE.mul(job.genoSum, FHE.asEuint64(job.weightZeroPoint));
euint64 encodedScore = FHE.sub(withOffset, correction);
```
The rearrangement `(partialSum + scoreOffset) - (weightZeroPoint × genoSum)` avoids unsigned underflow when the signed dot-product is negative.

**Why permissionless compute:**
Relayers pay gas to advance computation but learn no plaintext — they only see encrypted handles. The requester controls SNP upload, output ACL, and finalization. This is a deliberate tradeoff enabling meta-transactions and relay services.

**Why sequential (not map-reduce):**
v1 keeps one running `partialSum`. Storing one encrypted partial per chunk and reducing later would add per-chunk storage, duplicate-work prevention, and a reduction phase. The sequential accumulator is simpler, faster to test, and correct.

---

### ResultOracle

Differential Privacy noise injection + categorical classification.

**DP mechanism:** On construction, `noiseUpperBound` is set (must be a positive power of 2, fhEVM requirement). Each classification call generates `noise = FHE.randEuint64(noiseUpperBound)` — noise is unknowable to the caller before the transaction mines.

**Functions:**
- `classify(externalEuint64 encryptedScore, bytes inputProof, uint64 low, uint64 high)` — user-supplied re-encrypted score
- `classifyPreauthorized(externalEuint64 handle, uint64 low, uint64 high)` — contract-mediated handoff (called by PRSComputeEngine.finalizeAndClassify)

**Output:** `euint8` category (0=Low, 1=Medium, 2=High), made publicly decryptable via `FHE.makePubliclyDecryptable`.

**Bias note:** Noise ∈ [0, noiseUpperBound) uniform → expected upward bias of `noiseUpperBound/2`. Call `expectedNoiseBias()` to get this value and add it to each classification threshold.

**Key invariant:** `FHE.makePubliclyDecryptable` is called only on `euint8` risk categories, never on `euint64` scores. Raw scores are never publicly decryptable.

---

### BioETHPRS (`contracts/legacy/HEPRS.sol`)

Legacy standalone prototype. Embedded model, no marketplace dependency. Retained for onboarding and comparison. Do not build new features on it.

---

## fhEVM Plumbing

**`ZamaEthereumConfig`:** All computation contracts inherit this config. It auto-wires the coprocessor, KMS, and ACL gate addresses — same values for Hardhat mock and Sepolia.

**Ciphertext handles:** Every `euint64` is a 32-byte handle pointing to a ciphertext managed by the coprocessor. Contracts never hold raw plaintexts.

**ACL system:** Every handle has an ACL stored in the `ACL` contract. Access rules:
- `FHE.allowThis(handle)` — contract may use handle in future calls
- `FHE.allow(handle, userAddress)` — user may decrypt handle via Gateway
- `FHE.makePubliclyDecryptable(handle)` — anyone may decrypt (used only for `euint8` categories)

**`externalEuint64` pattern:** User-encrypted inputs arrive as `(externalEuint64 handle, bytes inputProof)`. The contract calls `FHE.fromExternal(handle, inputProof)` to validate the proof and get a usable handle, then `FHE.allowThis(result)` before storing.

**Trivial encryption:** `FHE.asEuint64(plainValue)` creates a trivially encrypted handle for a plaintext. The coprocessor can optimize C×P multiplications involving trivial ciphertexts — this is why public weight models are ~60% cheaper than private models.

**Mock vs real FHE:** The `@fhevm/hardhat-plugin` deploys a mock coprocessor at the same addresses as Sepolia. It validates the full protocol (handles, ACL, proofs) but performs plaintext arithmetic. Tests use `debugDecrypt*` helpers that bypass the KMS round-trip. On Sepolia, decryption requires a KMS re-encryption round-trip (async, seconds). Same contract code deploys to both.

---

## V1 Canonical Flow

```
# Model publication (researcher)
createModelShell(isPrivate, weightCount, uploadChunkSize=32, computeChunkSize=20, ...)
appendPublicModelChunk(modelId, weights)   ← repeat ceil(N/32) times
finalizeModel(modelId)

# PRS job (user)
createPRSJob(modelId, sampleId)
appendSnpChunk(jobId, encryptedSnps, inputProof)   ← repeat ceil(N/32) times
finalizeSnpUpload(jobId)
computeChunk(jobId)   ← repeat ceil(N/20) times; anyone may call
finalizeAndClassify(jobId, oracle, lowThreshold, highThreshold)   ← oracle-only path (no raw score exposed)
# OR: finalize(jobId) → requester gets raw encrypted score handle
```

**Chunk size constraints:**
- `uploadChunkSize = 32` always — fhEVM input-proof budget is 2048 bits / 64 bits per euint64
- `computeChunkSize = 20` on mock — HCU budget ~60–74 ops/tx; each SNP = 3 ops (trivial encrypt + mul + add)
- `computeChunkSize` on Sepolia: unknown until `npm run probe:hcu` is run

---

## Security Invariants — Never Violate

1. **No raw scores publicly decryptable.** `FHE.makePubliclyDecryptable` only on `euint8` risk categories. Never on `partialSum` or final PRS scores (`euint64`).
2. **ACL on every encrypted output.** Every `euint64` returned to a user must have `FHE.allow(handle, userAddress)` before the function returns.
3. **Quantization ceiling.** `scale × 2 × N_snps` must fit in `uint64` (max ~1.8×10¹⁹). At scale 10⁸ and 5000 SNPs: 10¹² ✓. Run `npm run advisor:quantization` before deploying new models.
4. **On-chain noise generation.** `ResultOracle` generates noise via `FHE.randEuint64(noiseUpperBound)`. Zero-noise calls are impossible. (Resolved April 2026 — old caller-supplied noise parameter removed.)
5. **State machine integrity.** Job transitions: `PENDING → UPLOADING → READY → COMPUTING → DONE`. `computeChunk` reverts before `finalizeSnpUpload` completes.

---

## Known Gaps & Risks

### Data integrity (SNP→sample linkage)
`createPRSJob` verifies the requester has registry ACL for the sample, but the contract cannot verify that submitted SNP ciphertexts actually match the registered sample's off-chain data. A malicious requester can submit arbitrary SNP values. The DP noise layer partially mitigates weight extraction via model probing. This remains an open research problem for v1.

### Marketplace model quality
No mechanism prevents listing garbage weights. Models cannot be updated or deleted after finalization. No payment/fee layer incentivizes quality researchers. For v1, off-chain DAO curation is the recommended mitigant.

### Requester sees raw score before oracle
`finalize()` gives the requester a raw `euint64` handle. DP noise does not protect against the requester (who initiated the job) learning their exact score. The `finalizeAndClassify()` path is the mitigation — it bypasses the requester decrypt path entirely. Using `finalizeAndClassify` over `finalize` is a user-level choice, not a protocol enforcement.

### DP noise upward bias
`FHE.randEuint64(noiseUpperBound)` draws noise uniformly from `[0, noiseUpperBound)`, introducing an expected upward bias of `noiseUpperBound/2`. The oracle now exposes `expectedNoiseBias()` (returns `noiseUpperBound/2`) so callers can correctly adjust thresholds:
```
adjustedThreshold = intendedThreshold + oracle.expectedNoiseBias()
```
This is a deterministic, correctable bias. The privacy guarantee comes from the noise variance, not the mean. For the paper: this mechanism is a shifted uniform distribution — callers who adjust thresholds get unbiased classification; those who don't will see systematic upward score inflation in the noisy comparison. The `expectedNoiseBias()` view function makes the correction self-documenting in the API.

### ACL revocation mid-job
If a registry owner revokes sample ACL or a model owner revokes private model reader access mid-job:
- Registry revocation: the in-flight job continues (ACL was checked at creation time, not each chunk)
- Private model revocation: the in-flight job fails on the next `computeChunk` call (each chunk re-checks model reader auth)

Both behaviors are documented and intentional for v1.

### Incomplete jobs
No cancellation or expiry exists. Jobs with partial SNP uploads that are never finalized persist indefinitely. This is a cleanup gap, not a security risk.

### URI observability
`GenomicRegistry` stores sample URIs in contract storage. Any node can read these via `eth_getStorageAt`. URIs are no longer emitted in events (patched April 2026), but the storage values remain plaintext. True URI confidentiality requires storing only a hash or commitment.

### Real Sepolia HCU ceiling unknown
Mock computeChunkSize=20 is a local constraint. The Sepolia HCU budget may allow much larger chunks (100+ SNPs/tx). Run `npm run probe:hcu` after first Sepolia deployment.

---

## Mock Baseline (April 2026)

100-SNP end-to-end, uploadChunkSize=32, computeChunkSize=20, public weights:

| Metric | Mock value | Sepolia |
|---|---|---|
| Mock HCU ceiling | 20 SNPs/tx (60–74 ops) | TBD |
| uploadChunkSize limit | 32 values/call | Same |
| Correct score | 758,685 ✓ | TBD |
| Gas: publishModel | 1,128,690 | TBD |
| Gas: computeChunk (chunk of 20) | 1,149,156 | TBD |
| Gas: total 100-SNP end-to-end | 17,758,196 | TBD |
| Gas share: SNP upload | 58% | TBD |
| Gas share: compute | 33% | TBD |
| Gas share: publish model | 6% | TBD |

HEPRS fixture timing (mock, linear scaling):

| SNPs | Upload txs | Compute txs | Total time |
|---|---|---|---|
| 100 | 4 | 5 | 382 ms |
| 500 | 16 | 25 | 1,460 ms |
| 1,000 | 32 | 50 | 2,930 ms |
| 5,000 | 157 | 250 | 14,535 ms (off-chain) |

Scaling is linear (~165K gas per SNP). SNP upload dominates cost (61%), compute is 34%, model publish is 5%.

See `docs/findings.md` for full benchmark data.

---

## Sepolia Deployment

Infrastructure is ready. Pending: testnet ETH and credentials.

```bash
npx hardhat vars set MNEMONIC
npx hardhat vars set INFURA_API_KEY
npm run deploy:sepolia          # deploy all 4 contracts
npm run validate:sepolia        # 100-SNP end-to-end with real FHE
npm run probe:hcu               # find real HCU ceiling, then update computeChunkSize
```

After Sepolia results: fill in the TBD cells above, create `docs/findings.md § Sepolia`, and update `computeChunkSize` in any new model shells accordingly.
