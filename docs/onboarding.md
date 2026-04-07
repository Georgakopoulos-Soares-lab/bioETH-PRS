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
| **Quantization** | Converting signed floats to unsigned integers for FHE arithmetic (see `docs/quantization.md`) |
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
  GenomicRegistry.registerSample(uri="ipfs://Qm_alice_snps...")
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

For contributors who want to understand the contracts:

1. **`docs/architecture.md`** — system design, security invariants, known gaps
2. **`docs/quantization.md`** — the math behind signed-weight encoding
3. **`contracts/GenomicRegistry.sol`** — simplest contract; ~66 lines
4. **`contracts/ModelMarketplace.sol`** — publication lifecycle; ~440 lines
5. **`contracts/PRSComputeEngine.sol`** — main computation; ~450 lines
6. **`contracts/ResultOracle.sol`** — DP + classification; ~130 lines
7. **`test/registry_marketplace_oracle_test.ts`** — end-to-end integration test
8. **`test/heprs_fixture_test.ts`** — correctness vs plaintext dot-product at scale
