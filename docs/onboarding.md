# bioETH PRS — Onboarding

Start here if you're new to the project. This covers the biology, the cryptography, and one concrete end-to-end example grounded in the actual contracts.

---

## Background

### What is a Polygenic Risk Score?

A Polygenic Risk Score (PRS) estimates a person's genetic predisposition to a trait or disease. It's a weighted sum:

```
PRS = Σ gᵢ × βᵢ
```

- **gᵢ** — genotype dosage for SNP i (0, 1, or 2 copies of the effect allele)
- **βᵢ** — effect weight (from a GWAS study; can be negative)
- **N** — typically thousands to millions of SNPs

**SNP:** Single-nucleotide polymorphism — a position in the genome where people commonly differ. At each SNP position, you have 0, 1, or 2 copies of the "effect allele" (the variant associated with the trait).

**GWAS:** Genome-Wide Association Study. Researchers collect SNP data and phenotype measurements (disease status, BMI, etc.) from thousands of people and compute association statistics. The resulting effect weights (betas) are the model.

**Why privacy matters:** A genome is a permanent, uniquely identifying record. It reveals ancestry, disease predisposition, and information about relatives. It cannot be changed if compromised. Sending raw genotype data to a server (even a trusted one) is unacceptable for many clinical and research contexts.

---

### What is Homomorphic Encryption?

Homomorphic Encryption (HE) allows computation on encrypted data. The result is an encrypted output that, when decrypted, equals what you would have gotten computing on plaintexts.

```
Decrypt(Encrypt(a) ⊕ Encrypt(b)) = a + b
Decrypt(Encrypt(a) ⊗ Encrypt(b)) = a × b
```

**TFHE (Torus FHE):** The specific scheme used in this project. Supports exact integer arithmetic (not approximate). Each encrypted value is a **ciphertext handle** — a 32-byte pointer to a ciphertext managed by a coprocessor. Contracts never hold raw plaintexts.

**fhEVM:** Zama's framework for running TFHE computations on Ethereum. Smart contracts call FHE operations as EVM precompiles. A coprocessor (off-chain but trustless) executes the actual FHE arithmetic and returns handles. The KMS (Key Management Service) holds the decryption key and performs threshold decryption only for authorized addresses via a Gateway.

**Why TFHE instead of CKKS (the scheme in the HEPRS paper):** CKKS handles signed floats natively but isn't available in the fhEVM stack. TFHE requires converting signed floats to integers (quantization), but gives exact results and maps cleanly to EVM precompiles.

---

### The Trust Model

| Who | What they see |
|---|---|
| User | Their own plaintext genotypes (before encryption); their final risk category |
| Researcher/Modeler | Their GWAS weights (before publishing); the model is immutable on-chain |
| Validators / Node operators | Encrypted handles only; no plaintext ever |
| Coprocessor | Ciphertexts; performs FHE arithmetic; cannot decrypt without KMS |
| KMS | Decryption key; only decrypts for addresses with ACL access; threshold scheme |

---

## Concepts Glossary

| Term | Meaning |
|---|---|
| **SNP** | Single-nucleotide polymorphism; a position in the genome where humans commonly differ |
| **Dosage** | 0, 1, or 2 — number of copies of the effect allele at a SNP position |
| **GWAS** | Genome-Wide Association Study; produces effect weights (betas) linking SNPs to traits |
| **PRS** | Polygenic Risk Score; weighted sum of dosages × betas |
| **TFHE** | Torus FHE; integer-based FHE scheme used in Zama's fhEVM |
| **fhEVM** | Zama's Ethereum FHE framework; FHE ops as EVM precompiles |
| **euint64** | Encrypted 64-bit unsigned integer; a 32-byte ciphertext handle |
| **externalEuint64** | User-encrypted input; validated with `inputProof` before use |
| **Coprocessor** | Off-chain FHE executor; validates handles and performs arithmetic |
| **KMS** | Key Management Service; holds the decryption key; decrypts only for authorized addresses |
| **Gateway** | Bridge between contracts and KMS; routes decryption requests |
| **ACL** | Access Control List; per-handle on-chain list of addresses allowed to decrypt |
| **HCU** | Homomorphic Compute Unit; per-transaction FHE operation budget |
| **Quantization** | Converting signed floats to unsigned integers for FHE arithmetic (see `docs/design.md#5-quantization`) |
| **weightZeroPoint** | Shift applied to weights to make them non-negative |
| **scoreOffset** | Shift applied to final score to make it non-negative |
| **computeChunkSize** | Max SNP×weight pairs per `computeChunk` call (HCU-limited; 20 on mock) |
| **uploadChunkSize** | Max values per `appendSnpChunk` call (32, input-proof budget) |
| **Handle** | 32-byte pointer to a ciphertext; what contracts pass around instead of plaintexts |

---

## End-to-End Example

This walks through a complete PRS computation using the actual contract API.

**Scenario:** CardioLab publishes a 5-SNP heart disease model. Alice computes her PRS and learns her risk category without CardioLab learning her genotypes or Alice learning the raw weights.

### Setup

Weights (CardioLab's GWAS output): `[-0.30, 0.10, 0.25, -0.05, 0.40]`

Quantization (scale=100, computed by advisor):

- Quantized: `[-30, 10, 25, -5, 40]`
- `weightZeroPoint = 30` (shift of `+30` to all weights)
- Stored unsigned weights `u`: `[0, 40, 55, 25, 70]`
- `raw_min = 2×(-30) + 2×(-5) = -70` → `scoreOffset = 70`

Alice's genotypes: `[2, 1, 0, 1, 2]`

---

### Phase 1: CardioLab publishes the model

```
CardioLab calls:
  ModelMarketplace.createModelShell(
    isPrivate=false, weightCount=5,
    uploadChunkSize=32, computeChunkSize=20,
    manifestURI="ipfs://Qm...", manifestHash=0xabc..., sourceModelHash=0xdef...,
    weightZeroPoint=30, scoreOffset=70
  )
  → modelId = 1

  ModelMarketplace.appendPublicModelChunk(modelId=1, weights=[0, 40, 55, 25, 70])

  ModelMarketplace.finalizeModel(modelId=1)
```

The model is now immutable and usable by compute jobs.

---

### Phase 2: Alice registers her sample

```
Alice calls:
  GenomicRegistry.registerSampleWithManifest(
    uri="ipfs://Qm_alice_snps...",
    manifestHash=0xabc...              // sample file hash, lab signature metadata, build, SNP order
  )
  → sampleId = 7
```

The URI points to Alice's encrypted SNP vector (stored off-chain). The registry records that Alice owns sampleId=7.

---

### Phase 3: Alice creates a PRS job

```
Alice calls:
  PRSComputeEngine.createPRSJob(modelId=1, sampleId=7)
```

Engine checks:

- `GenomicRegistry.hasAccess(7, Alice)` → true ✓
- model 1 is finalized ✓
- model 1 is public (no private reader check needed)

Engine stores:

```
Job {
  jobId: 42, modelId: 1, sampleId: 7,
  weightCount: 5, computeChunkSize: 20, chunkCount: 1,
  partialSum: Enc(0), genoSum: Enc(0),
  requester: Alice, snpsFinalized: false, complete: false
}
```

---

### Phase 4: Alice uploads her SNPs

Alice's client (using fhevmjs) encrypts the genotype vector:

```
encrypt([2, 1, 0, 1, 2]) → { handles: [h0, h1, h2, h3, h4], inputProof: proof }
```

```
Alice calls:
  PRSComputeEngine.appendSnpChunk(jobId=42, handles=[h0..h4], inputProof=proof)
```

Engine validates proof via `FHE.fromExternal()`, calls `FHE.allowThis()` on each handle, stores them flat.

```
Alice calls:
  PRSComputeEngine.finalizeSnpUpload(jobId=42)
```

Job is now in READY state. Compute may begin.

---

### Phase 5: Computation (anyone may relay)

This job has only 1 compute chunk (5 SNPs ≤ 20 = computeChunkSize).

```
Anyone calls:
  PRSComputeEngine.computeChunk(jobId=42)
```

Engine:

1. Loads model chunk 0: `[0, 40, 55, 25, 70]` (public weights)
2. Loads SNP chunk 0: `[h0, h1, h2, h3, h4]` (encrypted)
3. For each pair:
   - `FHE.mul(snp_i, FHE.asEuint64(weight_i))` → product (C×P, trivially encrypted)
   - `FHE.add(partialSum, product)` → update running sum
4. After all SNPs: marks job DONE

Computation in the encrypted domain:

```
partialSum = Enc(2×0 + 1×40 + 0×55 + 1×25 + 2×70) = Enc(205)
genoSum    = Enc(2+1+0+1+2)                           = Enc(6)
```

---

### Phase 6: Finalize and classify (oracle-only path)

```
// First, get the noise bias so thresholds are correctly adjusted:
bias = ResultOracle.expectedNoiseBias()   // = noiseUpperBound / 2 (e.g., 32 if bound=64)

Alice calls:
  PRSComputeEngine.finalizeAndClassify(
    jobId=42,
    oracle=ResultOracle,
    lowThreshold=intendedLow + bias,    // adjust for uniform noise upward bias
    highThreshold=intendedHigh + bias
  )
```

Engine applies quantization correction:

```
withOffset   = Enc(205) + Enc(70) = Enc(275)
correction   = Enc(6) × 30       = Enc(180)
encodedScore = Enc(275) - Enc(180) = Enc(95)
```

Check: `95 - 70 (scoreOffset) = 25` → signed score is `25 / 100 = 0.25` ✓ (matches: 2×-0.30 + 1×0.10 + 0×0.25 + 1×-0.05 + 2×0.40 = 0.25)

Engine hands the score handle to `ResultOracle.classifyPreauthorized`.

Oracle generates noise: `noise = FHE.randEuint64(64)` → Enc(noise), unknowable until mined.

Oracle classifies `Enc(95 + noise)` against thresholds:

```
Enc(category) = Enc(0) if noisyScore < low
              = Enc(2) if noisyScore > high
              = Enc(1) otherwise
```

Oracle calls `FHE.makePubliclyDecryptable(categoryHandle)`.

---

### Phase 7: Alice retrieves her result

```
Alice calls Gateway:
  Gateway.requestPublicDecryption(categoryHandle)
  → waits for KMS to process
  → category = 1 (Medium risk)
```

Alice learns: Medium risk. Alice's exact encoded score (Enc(95)) is never decrypted. CardioLab's raw weights were never exposed to anyone.

---

## Code Reading Order

Read the files in this order. Each step tells you what to look for and what it connects to next. By the end you will have a complete mental model of every line of code in the project.

---

### Phase 1 — Conceptual grounding (docs)

#### 1. Background + Concepts Glossary (this file, above)

Use the `Background` and `Concepts Glossary` sections as the core reference for what a SNP is, what GWAS weights are, why you need FHE, and what a PRS dot-product looks like. Read this first so the math in the code makes sense.

#### 2. End-to-End Example (this file, above)

Read the `End-to-End Example` section for a narrated walkthrough of one user registering a sample, a researcher listing a model, computing a PRS, and reading the result category. This is the story the contracts tell together — read it before touching any `.sol` file.

#### 3. `docs/design.md` + `docs/roadmap.md`

`docs/design.md` covers how the HEPRS paper maps to this codebase, per-contract responsibilities, the quantization math, security invariants, and known gaps. `docs/roadmap.md` carries the active priorities and future work. Skim both now; come back to specific sections as you read the contracts.

---

### Phase 2 — FHE plumbing (the abstraction layer)

The FHE layer is provided by two npm packages. Read the relevant source files from within `node_modules` if you want to understand the internals, but for everyday development the contracts, comments, and Zama documentation are sufficient.

#### 4. `@fhevm/solidity` — the FHE library

All contracts import from `@fhevm/solidity/lib/FHE.sol`. This is the real Zama library that works on both local Hardhat (mock mode) and Sepolia (real FHE).

Key types and functions you'll see throughout the contracts:

- `euint64` — encrypted 64-bit integer (SNPs, weights, scores)
- `euint8` — encrypted 8-bit integer (risk category output)
- `ebool` — encrypted boolean (comparison results)
- `externalEuint64` — wire type for ciphertexts arriving *from* a user
- `FHE.fromExternal(ext, proof)` — validates input proof, returns internal handle
- `FHE.allowThis(handle)` — grants the contract itself ACL permission on a new handle
- `FHE.allow(handle, addr)` — grants a specific address decrypt rights
- `FHE.makePubliclyDecryptable(handle)` — marks a handle as gateway-decryptable by anyone
- `FHE.add(a, b)`, `FHE.mul(a, b)`, `FHE.sub(a, b)`, `FHE.lt(a, b)`, `FHE.select(cond, a, b)`
- `FHE.asEuint64(plainValue)` — trivially-encrypts a plaintext for use as an operand

**Key insight:** There is no `mulPlain`. Use `FHE.mul(ciphertext, FHE.asEuint64(plainValue))` — the coprocessor internally optimizes trivial-ciphertext operands as cheap C×P multiplications.

#### 5. `@fhevm/hardhat-plugin` — the mock coprocessor

This plugin is loaded in `hardhat.config.ts` and deploys mock ACL, coprocessor, and KMS contracts into the local Hardhat network at the same addresses as Sepolia. The mock performs plaintext arithmetic but enforces the full fhEVM protocol rules: handles, ACL, and input proofs are all validated.

**Key insight:** Unlike the old transparent mock (`mock-archive/FHE.mock.sol`), forgetting `FHE.allowThis(handle)` or submitting a handle without a valid proof will fail even in local tests.

#### 6. `mock-archive/` — historical reference only

The old transparent plaintext mock files (`FHE.mock.sol`, `TFHE.mock.sol`, `EncryptedTypes.mock.sol`) are stored here. They performed bare `uint64` arithmetic with no handle or ACL logic. They are no longer on any import path. Read them only if you want to understand what the codebase looked like before the `@fhevm/solidity` migration.

---

### Phase 3 — Contracts (bottom-up by complexity)

#### 7. `contracts/GenomicRegistry.sol` (~55 lines)

**What it does:** Stores URI pointers to encrypted SNP files (e.g. IPFS links). No FHE operations here at all — it's pure access control.

**What to trace while reading:**

- `Sample` struct: just `uri` (string) + `owner` (address)
- `access` mapping: `sampleId → address → bool` — this is the ACL
- `registerSample` → pushes to `samples[]`, returns the index as `sampleId`
- `getSample` → reverts with `"Access denied"` if caller isn't owner or grantee

**Connects to:** The registry is upstream of everything — a patient registers here before a researcher can compute their PRS.

#### 8. `contracts/ModelMarketplace.sol` (~81 lines)

**What it does:** Stores GWAS weight vectors. No computation, just storage. Two flavours of model:

- **Public** (`uint64[]`) — weights are visible to everyone, cheaper to compute with
- **Private** (`euint64[]`) — weights are encrypted, full FHE multiply needed

**What to trace while reading:**

- `ModelHeader` struct: ownership, privacy mode, chunk geometry, finalized state, manifest metadata
- `createModelShell` — creates a draft model before any weights are uploaded
- `appendPublicModelChunk` / `appendEncryptedModelChunk` — sequential chunk publication
- `finalizeModel` — freezes the model before compute
- `getPublicWeightChunk` / `getEncryptedWeightChunk` — chunk-specific retrieval instead of whole-array reads

**Connects to:** `PRSComputeEngine` reads one model chunk at a time instead of fetching the full model.

#### 9. `contracts/legacy/HEPRS.sol` — `BioETHPRS` contract (~143 lines)

**Read this before PRSComputeEngine.** It's the self-contained version of the system: model storage + job management + computation in one file.

**What to trace while reading:**

*Model side:*

- `Model` struct: `weights` (always `euint64[]`), `owner`, `isPrivate`
- `uploadModel` → pushes to `models[]`

*Job state machine — this is the core pattern:*

```
startPRS(modelId, encryptedSnps, chunkSize) → jobId
  creates Job { nextIndex=0, partialSum=0, complete=false }

computeChunk(jobId)
  loops from job.nextIndex to min(nextIndex+chunkSize, snps.length)
  for each i: partialSum += weights[i] * snps[i]   ← dot product term
  updates job.nextIndex; sets job.complete=true when done

finalize(jobId) → euint64
  checks job.complete, checks msg.sender==requester
  calls FHE.allow(partialSum, msg.sender)  ← grants decrypt rights
  returns the accumulated partialSum
```

**Key insight:** `partialSum` is `job storage` — it survives between transactions. `chunkSize` controls how many multiply-adds happen per block (gas budget).

#### 10. `contracts/PRSComputeEngine.sol` (~170 lines)

**This is the current marketplace-backed PRS engine.**

It no longer stores the whole SNP vector in the job header. Instead it uses a staged flow:

1. `createPRSJob` — creates a job shell
2. `appendSnpChunk` (classic) or `appendAndComputeChunk` (streaming) — SNP upload
3. `finalizeSnpUpload` (classic only) — explicit ready transition
4. `computeChunk` (classic only) — chunked compute

**What to trace:**

- `Job` struct: model geometry, upload progress, compute progress, requester
- `snpChunks[jobId][chunkIndex]`: private job payload storage (classic path only)
- `createPRSJob`: copies the finalized model geometry into the job shell
- `appendSnpChunk`: enforces sequential aligned SNP upload (classic)
- `finalizeSnpUpload`: freezes the SNP payload before compute (classic)
- `computeChunk`: loads one model chunk and one SNP chunk, then multiplies them (classic)
- `appendAndComputeChunk`: upload + compute in one call, no SNP handle persistence (streaming, ~37% cheaper)

**Public vs private branch in `computeChunk`:**

- Public model → `FHE.mul(snps[i], FHE.asEuint64(publicWeights[i]))` (C×P trivial)
- Private model → `FHE.mul(encryptedWeights[i], snps[i])` (C×C)

#### 11. `contracts/ResultOracle.sol` (~53 lines)

**What it does:** Takes a final encrypted PRS score, adds DP-inspired on-chain noise, and classifies into Low / Medium / High — all without decrypting. This is a noisy categorical release, not a formal `(epsilon, delta)`-DP guarantee.

**What to trace in `classify`:**

```
score = FHE.fromExternal(encryptedScore, inputProof)
noise = FHE.randEuint64(noiseUpperBound)            ← on-chain encrypted noise
noisy = FHE.add(score, noise)
isLow    = FHE.lt(noisy, lowThreshold)
belowHigh = FHE.lt(noisy, highThreshold)
isMedium = FHE.and(FHE.not(isLow), belowHigh)

category = FHE.select(isLow, Low,
             FHE.select(isMedium, Medium, High))    ← encrypted ternary
```

**Key insight:** `FHE.select` is used instead of `if` because you cannot branch on an encrypted boolean (it would reveal plaintext information). The logic is identical to a regular ternary — just expressed through FHE operations.

---

### Phase 4 — Tests (read alongside the contracts)

#### 12. `test/bioeth_prs_test.ts`

Tests `BioETHPRS` (HEPRS.sol's contract) in isolation. Read the first test `"computes correct PRS via chunked dot product"` line-by-line and verify the arithmetic by hand:

```text
weights = [2, 3, 4],  snps = [5, 6, 7],  chunkSize = 2

Chunk 1: indices [0,2)  →  0 + 2×5 + 3×6 = 28   (partialSum after chunk 1)
Chunk 2: indices [2,3)  →  28 + 4×7     = 56   (final score)
```

The other 4 tests check the guard conditions: can't finalize early, can't run an extra chunk after completion, invalid model id reverts.

**Note on TypeScript:** In mock mode, `euint64` is just `uint64`, so you pass plain `bigint` values (e.g. `2n`, `3n`). The `staticCall` pattern runs a transaction read-only to preview the return value without writing state.

#### 13. `test/registry_marketplace_oracle_test.ts`

The integration test. Three independent `describe` blocks — read them in order:

1. **GenomicRegistry ACL** — owner reads, stranger denied, grant/revoke cycle
2. **ModelMarketplace → PRSComputeEngine** — full chunked dot-product with a public model (trivially-encrypted C×P path)
3. **ResultOracle classification** — four cases: below low, between thresholds, above high, noise shifts bucket

The second block is the most important: it shows the full pipeline from model listing through chunked computation to reading the partial sum.

#### 14. `test/utils/fhevm-helpers.ts`

Provides `fhevmjs` helpers for generating real ciphertext handles + ZK input proofs. In mock mode the plugin handles proof validation automatically, but this utility is still used in tests to produce the `externalEuint64[]` + `inputProof` arguments that `appendSnpChunk`, `appendEncryptedModelChunk`, `uploadModel`, and `startPRS` expect.

---

### Phase 5 — Config & tooling

#### 15. `hardhat.config.ts`

Short file. Note:

- Solidity `0.8.24` with optimizer 200 runs
- `blockGasLimit: 30_000_000` — high limit to allow large FHE chunks in Hardhat

#### 16. `tsconfig.json`

Note the two non-standard additions needed to make tests work:

- `"module": "CommonJS"` + `"moduleResolution": "node"` — required for Hardhat toolbox type augmentations (`ethers`, `.emit()`, `.revertedWith()`)
- `"ts-node": { "swc": true }` — bypasses ts-node's internal TypeScript emit API which crashes with TypeScript ≥ 5.8

#### 17. `scripts/gas_profile.ts`

Runs the marketplace + engine against multiple SNP counts and prints gas used per phase. Read this last — it's a useful lens on real-world cost but not needed to understand the contracts.

---

### What you will understand after all 17 files

| Concept | Where it lives |
|---------|---------------|
| FHE type system (ebool / euint8 / euint64) | Files 4-6 |
| How mock FHE maps to real FHE | File 5 |
| Patient data access control | File 7 |
| GWAS model storage (public vs private) | File 8 |
| Chunked dot-product state machine (classic + streaming) | Files 9-10 |
| Encrypted classification without branching | File 11 |
| Test patterns (staticCall, bigint, Chai matchers) | Files 12-13 |
| What real fhEVM encryption looks like | File 14 |
| Build / TS toolchain quirks | Files 15-16 |
