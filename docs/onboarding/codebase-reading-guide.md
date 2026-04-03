# Codebase Reading Guide

Read the files in this order. Each step tells you what to look for and what it connects to next.
By the end you will have a complete mental model of every line of code in the project.

---

## Phase 1 — Conceptual grounding (docs)

### 1. `docs/onboarding/concepts-cheatsheet.md`

A 1-page reference for the core concepts: what a SNP is, what GWAS weights are,
why you need FHE, and what a PRS dot-product looks like. Read this first so the
math in the code makes sense.

### 2. `docs/onboarding/e2e-walkthrough-short.md`

A single narrated walkthrough of one user registering a sample, a researcher
listing a model, computing a PRS, and reading the result category. This is the
story the contracts tell together — read it before touching any `.sol` file.

### 3. `docs/architecture-roadmap.md`

The full architecture doc. Covers: how the HEPRS paper maps to this codebase,
per-contract responsibilities, known edge cases (ACL gap, overflow risk, etc.),
and the roadmap. Skim it now; come back to specific sections as you read the
contracts.

---

## Phase 2 — FHE plumbing (the abstraction layer)

The FHE layer is provided by two npm packages. Read the relevant source files from within `node_modules` if you want to understand the internals, but for everyday development the contracts, comments, and Zama documentation are sufficient.

### 4. `@fhevm/solidity` — the FHE library

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

### 5. `@fhevm/hardhat-plugin` — the mock coprocessor

This plugin is loaded in `hardhat.config.ts` and deploys mock ACL, coprocessor, and KMS contracts into the local Hardhat network at the same addresses as Sepolia. The mock performs plaintext arithmetic but enforces the full fhEVM protocol rules: handles, ACL, and input proofs are all validated.

**Key insight:** Unlike the old transparent mock (`mock-archive/FHE.mock.sol`), forgetting `FHE.allowThis(handle)` or submitting a handle without a valid proof will fail even in local tests.

### 6. `mock-archive/` — historical reference only

The old transparent plaintext mock files (`FHE.mock.sol`, `TFHE.mock.sol`, `EncryptedTypes.mock.sol`) are stored here. They performed bare `uint64` arithmetic with no handle or ACL logic. They are no longer on any import path. Read them only if you want to understand what the codebase looked like before the `@fhevm/solidity` migration.

---

## Phase 3 — Contracts (bottom-up by complexity)

### 7. `contracts/GenomicRegistry.sol` (~55 lines)

**What it does:** Stores URI pointers to encrypted SNP files (e.g. IPFS links).
No FHE operations here at all — it's pure access control.

**What to trace while reading:**

- `Sample` struct: just `uri` (string) + `owner` (address)
- `access` mapping: `sampleId → address → bool` — this is the ACL
- `registerSample` → pushes to `samples[]`, returns the index as `sampleId`
- `getSample` → reverts with `"Access denied"` if caller isn't owner or grantee

**Connects to:** The registry is upstream of everything — a patient registers
here before a researcher can compute their PRS.

### 8. `contracts/ModelMarketplace.sol` (~81 lines)

**What it does:** Stores GWAS weight vectors. No computation, just storage.
Two flavours of model:

- **Public** (`uint64[]`) — weights are visible to everyone, cheaper to compute with
- **Private** (`euint64[]`) — weights are encrypted, full FHE multiply needed

**What to trace while reading:**

- `ModelHeader` struct: ownership, privacy mode, chunk geometry, finalized state, manifest metadata
- `createModelShell` — creates a draft model before any weights are uploaded
- `appendPublicModelChunk` / `appendEncryptedModelChunk` — sequential chunk publication
- `finalizeModel` — freezes the model before compute
- `getPublicWeightChunk` / `getEncryptedWeightChunk` — chunk-specific retrieval instead of whole-array reads

**Connects to:** `PRSComputeEngine` reads one model chunk at a time instead of fetching the full model.

### 9. `contracts/HEPRS.sol` — `BioETHPRS` contract (~143 lines)

**Read this before PRSComputeEngine.** It's the self-contained version of the
system: model storage + job management + computation in one file.

This section intentionally describes the standalone prototype contract, not the newer marketplace-backed `PRSComputeEngine`. The standalone contract still uses the older caller-supplied `chunkSize` and `nextIndex` flow.

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
  calls TFHE.allow(partialSum, msg.sender)  ← grants decrypt rights
  returns the accumulated partialSum
```

**Key insight:** `partialSum` is `job storage` — it survives between transactions.
`chunkSize` controls how many multiply-adds happen per block (gas budget).

### 10. `contracts/PRSComputeEngine.sol` (~170 lines)

**This is the current marketplace-backed PRS engine.**

It no longer stores the whole SNP vector in the job header. Instead it uses:

1. a job shell created by `createPRSJob`
2. chunked SNP upload through `appendSnpChunk`
3. an explicit ready transition through `finalizeSnpUpload`
4. chunked compute through `computeChunk`

**What to trace:**

- `Job` struct: model geometry, upload progress, compute progress, requester
- `snpChunks[jobId][chunkIndex]`: private job payload storage
- `createPRSJob`: copies the finalized model geometry into the job shell
- `appendSnpChunk`: enforces sequential aligned SNP upload
- `finalizeSnpUpload`: freezes the SNP payload before compute
- `computeChunk`: loads one model chunk and one SNP chunk, then multiplies them

**Public vs private branch in `computeChunk`:**

- Public model → `FHE.mul(snps[i], FHE.asEuint64(publicWeights[i]))` (C×P trivial)
- Private model → `FHE.mul(encryptedWeights[i], snps[i])` (C×C)

**Key insight:** The engine is now symmetric with the marketplace lifecycle:

- shell first
- append chunks
- finalize
- compute chunk by chunk

### 11. `contracts/ResultOracle.sol` (~53 lines)

**What it does:** Takes a final encrypted PRS score, adds differential privacy
noise, and classifies into Low / Medium / High — all without decrypting.

**What to trace in `classify`:**

```
score = FHE.fromExternal(encryptedScore, inputProof)
noise = FHE.randEuint64(noiseUpperBound)            ← on-chain DP noise
noisy = FHE.add(score, noise)
isLow    = FHE.lt(noisy, lowThreshold)
belowHigh = FHE.lt(noisy, highThreshold)
isMedium = FHE.and(FHE.not(isLow), belowHigh)

category = FHE.select(isLow, Low,
             FHE.select(isMedium, Medium, High))    ← encrypted ternary
```

**Key insight:** `FHE.select` is used instead of `if` because you cannot branch
on an encrypted boolean (it would reveal plaintext information). The logic is
identical to a regular ternary — just expressed through FHE operations.

---

## Phase 4 — Tests (read alongside the contracts)

### 12. `test/bioeth_prs_test.ts`

Tests `BioETHPRS` (HEPRS.sol's contract) in isolation. Read the first test
`"computes correct PRS via chunked dot product"` line-by-line and verify the
arithmetic by hand:

```text
weights = [2, 3, 4],  snps = [5, 6, 7],  chunkSize = 2

Chunk 1: indices [0,2)  →  0 + 2×5 + 3×6 = 28   (partialSum after chunk 1)
Chunk 2: indices [2,3)  →  28 + 4×7     = 56   (final score)
```

The other 4 tests check the guard conditions: can't finalize early, can't run
an extra chunk after completion, invalid model id reverts.

**Note on TypeScript:** In mock mode, `euint64` is just `uint64`, so you pass
plain `bigint` values (e.g. `2n`, `3n`). The `staticCall` pattern runs a
transaction read-only to preview the return value without writing state.

### 13. `test/registry_marketplace_oracle_test.ts`

The integration test. Three independent `describe` blocks — read them in order:

1. **GenomicRegistry ACL** — owner reads, stranger denied, grant/revoke cycle
2. **ModelMarketplace → PRSComputeEngine** — full chunked dot-product with a
   public model (trivially-encrypted C×P path)
3. **ResultOracle classification** — four cases: below low, between thresholds,
   above high, noise shifts bucket

The second block is the most important: it shows the full pipeline from model
listing through chunked computation to reading the partial sum.

### 14. `test/utils/fhevm-helpers.ts`

Provides `fhevmjs` helpers for generating real ciphertext handles + ZK input proofs.
In mock mode the plugin handles proof validation automatically, but this utility is
still used in tests to produce the `externalEuint64[]` + `inputProof` arguments that
`appendSnpChunk`, `appendEncryptedModelChunk`, `uploadModel`, and `startPRS` expect.

---

## Phase 5 — Config & tooling

### 15. `hardhat.config.ts`

Short file. Note:

- Solidity `0.8.24` with optimizer 200 runs
- `blockGasLimit: 30_000_000` — high limit to allow large FHE chunks in Hardhat

### 16. `tsconfig.json`

Note the two non-standard additions needed to make tests work:

- `"module": "CommonJS"` + `"moduleResolution": "node"` — required for Hardhat
  toolbox type augmentations (`ethers`, `.emit()`, `.revertedWith()`)
- `"ts-node": { "swc": true }` — bypasses ts-node's internal TypeScript emit
  API which crashes with TypeScript ≥ 5.8

### 17. `scripts/gas_profile.ts`

Runs the marketplace + engine against multiple SNP counts and prints gas used per
phase. Read this last — it's a useful lens on real-world cost but not needed
to understand the contracts.

---

## What you will understand after all 17 files

| Concept | Where it lives |
|---------|---------------|
| FHE type system (ebool / euint8 / euint64) | Files 4-6 |
| How mock FHE maps to real FHE | File 5 |
| Patient data access control | File 7 |
| GWAS model storage (public vs private) | File 8 |
| Chunked dot-product state machine | Files 9-10 |
| Encrypted classification without branching | File 11 |
| Test patterns (staticCall, bigint, Chai matchers) | Files 12-13 |
| What real fhEVM encryption looks like | File 14 |
| Build / TS toolchain quirks | Files 15-16 |

---

## Optional deeper reading (docs)

- `docs/onboarding/e2e-walkthrough-long.md` — component-by-component walkthrough with data
  values flowing through each contract
- `docs/architecture-roadmap.md §7` — known edge cases (ACL enforcement gap,
  uint64 overflow risk, DP noise not truly random in mock)
- `docs/onboarding/contributor-onboarding.md` — biological and cryptographic background if you want to go
  deeper on PRS biology or TFHE theory
