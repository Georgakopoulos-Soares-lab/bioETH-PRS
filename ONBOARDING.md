# bioETH PRS — Contributor Onboarding Guide

> Welcome to the project.  This document is written for a new collaborator who may be strong in one area (software engineering, cryptography, or bioinformatics) but unfamiliar with the others.  Every technical term is introduced in plain English before being used formally.  By the end you should understand what the system does, why each design choice was made, and where to touch the code.

---

## Table of Contents

1. [The Big Picture in One Paragraph](#1-the-big-picture-in-one-paragraph)
2. [Bioinformatics Background](#2-bioinformatics-background)
   - 2.1 DNA, SNPs, and Genotype Vectors
   - 2.2 GWAS — Genome-Wide Association Studies
   - 2.3 Polygenic Risk Scores (PRS)
   - 2.4 Why Privacy Matters for Genomic Data
3. [Cryptography Background](#3-cryptography-background)
   - 3.1 Symmetric vs. Asymmetric Encryption (quick recap)
   - 3.2 Fully Homomorphic Encryption (FHE) — the core idea
   - 3.3 FHE Schemes: CKKS vs. TFHE
   - 3.4 Ciphertexts, Handles, and ACLs in fhEVM
   - 3.5 Differential Privacy — adding noise on purpose
4. [The Reference Paper: HEPRS](#4-the-reference-paper-heprs)
   - 4.1 Original 3-Party Protocol
   - 4.2 Key Vulnerabilities the Paper Identifies
   - 4.3 Our Blockchain Adaptation — what changed and why
5. [System Architecture](#5-system-architecture)
   - 5.1 Layered Contract Design
   - 5.2 Data Flow End-to-End
   - 5.3 The Chunking / MapReduce Pattern
6. [Contract-by-Contract Deep Dive](#6-contract-by-contract-deep-dive)
   - 6.1 GenomicRegistry
   - 6.2 ModelMarketplace
   - 6.3 PRSComputeEngine (and HEPRS standalone)
   - 6.4 ResultOracle
   - 6.5 TFHE.sol and the FHE mock
7. [The Math: Quantization and Fixed-Point Arithmetic](#7-the-math-quantization-and-fixed-point-arithmetic)
8. [fhEVM — How Encrypted EVM Execution Works](#8-fhevm--how-encrypted-evm-execution-works)
   - 8.1 The EVM and Gas Limits
   - 8.2 Zama's fhEVM Stack
   - 8.3 The Gateway and Re-encryption
   - 8.4 makePubliclyDecryptable vs. allow
9. [Local Development Setup](#9-local-development-setup)
10. [Running Tests and Reading Their Output](#10-running-tests-and-reading-their-output)
11. [Known Limitations and Open Problems](#11-known-limitations-and-open-problems)
12. [Glossary](#12-glossary)

---

## 1. The Big Picture in One Paragraph

Imagine you want to know your genetic risk for heart disease.  You have your DNA (sequenced, digitised), and a research hospital has a statistical model trained on millions of genomes.  To compute your risk score, a traditional system would require you to send your raw DNA to the hospital's servers — a severe privacy violation.  This project builds a system where you **upload your encrypted DNA to a blockchain smart contract**, the contract **multiplies your encrypted DNA against the hospital's encrypted model weights** using Fully Homomorphic Encryption (FHE), and returns an **encrypted categorical answer** (Low / Medium / High risk) — *all without any participant, including the validators running the blockchain, ever seeing your raw data*.  The trust comes not from a server you must believe, but from the mathematical properties of FHE and the immutability of the smart contract itself.

---

## 2. Bioinformatics Background

### 2.1 DNA, SNPs, and Genotype Vectors

Human DNA is roughly 3 billion base pairs long.  Fortunately, most of the variation between people is concentrated in specific locations called **Single Nucleotide Polymorphisms (SNPs)** (pronounced "snips").

> **Simple definition:** A SNP is a single position in the genome where different people have different "letters" (e.g., some people have an A, others have a G at position 7,265,432 of chromosome 3).

For a given SNP, a person can carry 0, 1, or 2 copies of the less-common variant (called the **minor allele**).  This gives you a **dosage value** of 0, 1, or 2.  When you collect these values across, say, 1,000 SNPs, you get a vector of integers:

```
SNP vector = [0, 1, 2, 0, 1, 1, 2, ...]   (length = number of SNPs)
```

This integer vector is what the system receives as encrypted input.  In the code this is called `encryptedSnps` and has type `euint64[]`.

### 2.2 GWAS — Genome-Wide Association Studies

A **Genome-Wide Association Study (GWAS)** is a statistical analysis that scans the genomes of thousands (ideally millions) of people to find which SNPs are **associated with a particular trait or disease** (e.g., type 2 diabetes, height, coronary artery disease).

> **Simple definition:** A GWAS is a large regression that asks: "For each of the ~7 million common SNPs in the human genome, does having extra copies of the minor allele correlate with having this disease?"

The output of a GWAS is a table of **effect sizes** (one per SNP) — often called **beta coefficients** or **weights**.  A positive weight means more copies → higher risk; a negative weight means more copies → lower risk.  These weights are what researchers list in the `ModelMarketplace` contract.

### 2.3 Polygenic Risk Scores (PRS)

A **Polygenic Risk Score (PRS)** is a single number that summarises a person's genetic predisposition to a disease using the GWAS weights.

The formula is simply a **dot product** (weighted sum):

$$\text{PRS} = \sum_{i=1}^{N} w_i \cdot g_i$$

where:

- $w_i$ is the GWAS weight for SNP $i$ (from the researcher's model)
- $g_i$ is the person's dosage (0, 1, or 2) at SNP $i$
- $N$ is the number of SNPs in the model

That is it.  **PRS = dot product of weight vector and genotype vector.**  This is why the entire compute pipeline is about doing a dot product homomorphically.

> **Why a dot product matters for engineering:** A dot product over $N$ elements requires $N$ multiplications and $N$ additions.  In standard FHE each multiplication is expensive (tens of milliseconds on CPU; significant gas in fhEVM).  This is the core cost and engineering challenge.

### 2.4 Why Privacy Matters for Genomic Data

Genomic data is uniquely sensitive:

- It **never changes** — you cannot revoke your genome like a password.
- It **identifies you** even in "anonymised" datasets (studies have re-identified individuals from 30–100 SNPs).
- It reveals information about **relatives** who never consented.
- It can expose predisposition to diseases relevant for **insurance, employment, or immigration**.

Current solutions either send the raw data to a trusted server (weak: what if the server is hacked or monetises data?) or use hardware enclaves like Intel SGX (weak: side-channel attacks exist; you still "trust Intel").  FHE replaces both with a mathematical guarantee: the plaintext is never exposed, even to the party running the computation.

---

## 3. Cryptography Background

### 3.1 Symmetric vs. Asymmetric Encryption (quick recap)

| Type | Key situation | Can compute on ciphertext? |
|------|--------------|--------------------------|
| Symmetric (AES) | Same key encrypts + decrypts | No |
| Asymmetric (RSA, ECDH) | Public key encrypts, private key decrypts | Partially (some schemes allow one multiplication) |
| Homomorphic (FHE) | Public key encrypts, private key decrypts | **Yes — arbitrary computation** |

### 3.2 Fully Homomorphic Encryption (FHE) — the core idea

FHE is an encryption scheme where you can **perform arithmetic on ciphertexts** and, when the result is decrypted, you get the **same answer as if you had computed on the plaintexts**.

In math:

$$\text{Decrypt}(\text{Encrypt}(a) \oplus \text{Encrypt}(b)) = a + b$$
$$\text{Decrypt}(\text{Encrypt}(a) \otimes \text{Encrypt}(b)) = a \times b$$

where $\oplus$ and $\otimes$ are special ciphertext-level operations.

> **Analogy:** Imagine a locked glass box.  You can see the shape of objects inside but not their colour.  You can reach in with special gloves and manipulate the objects — rearrange, combine — without opening the box.  When you finally unlock it, the result reflects all the manipulations you made.  FHE is that glass box for numbers.

**The catch:** Each homomorphic operation adds a small error ("noise") to the ciphertext.  Too many operations and the noise overwhelms the signal, making decryption give wrong answers.  FHE schemes manage this via **bootstrapping** (a noise-cleaning operation that is itself expensive) or by **limiting circuit depth**.

### 3.3 FHE Schemes: CKKS vs. TFHE

The original HEPRS paper uses **CKKS**; this project uses **TFHE**.  Understanding why requires knowing both.

#### CKKS (Cheon-Kim-Kim-Song)

- Works on **floating-point numbers** (actually approximate fixed-point).
- Supports **addition and multiplication**.
- Extremely efficient for **deep neural networks and linear algebra** because it can pack thousands of values into one ciphertext (SIMD).
- **Approximate:** decryption gives a result close to the true answer, not exact.
- Quote from the paper: *"CKKS is well-suited to PRS because it natively encodes real-valued weights and tolerates small approximation errors that are clinically irrelevant."*
  > **In plain English:** CKKS can handle decimal numbers (like 0.0045) and doesn't care if the answer is off by 0.0001 — a tiny rounding error in a risk score doesn't change whether you're Low or High risk.

#### TFHE (Torus Fully Homomorphic Encryption)

- Works on **individual bits** or small integers.
- Supports **addition, multiplication, comparisons, XOR, arbitrary boolean gates**.
- Each ciphertext encrypts a single integer (no SIMD by default).
- Results are **exact** (no approximation).
- Enables **programmable bootstrapping** — you can evaluate arbitrary lookup tables during the noise-reduction step.
- **Why we use TFHE:** The Zama fhEVM uses TFHE precompiles.  EVM smart contracts call these precompiles (like system calls), so we must use the types and operations the fhEVM exposes.  CKKS is not available as an EVM precompile.

> **Trade-off:** TFHE integers are exact but each ciphertext holds one number.  For a 1,000-SNP PRS, TFHE requires 1,000 multiplications.  CKKS could pack all 1,000 SNPs into a single ciphertext and multiply them all at once.  This is why SIMD / slot packing is on the roadmap.

### 3.4 Ciphertexts, Handles, and ACLs in fhEVM

In regular EVM smart contracts, values like `uint64` are plaintext numbers stored in contract storage.  In fhEVM, `euint64` is an **opaque handle** — a 32-byte reference number that points to a ciphertext stored outside the EVM in Zama's coprocessor.

- The actual encrypted bytes never live in the EVM storage — only the handle does.
- To operate on two `euint64` values, you call a precompile (e.g., `FHE.add(a, b)`) which returns a new handle pointing to the result ciphertext.
- **Access Control List (ACL):** The fhEVM maintains a list of which Ethereum addresses are allowed to decrypt each ciphertext handle.  Calling `FHE.allow(handle, address)` grants that address permission to ask the KMS (Key Management Service) to decrypt it.
- Calling `FHE.makePubliclyDecryptable(handle)` marks the ciphertext so anyone can trigger decryption via the gateway — used for publishing the final risk category.

> **In plain English:** `euint64` is like a locked safe-deposit box number.  You can do maths on boxes (combining their locked contents) without opening them.  `allow` gives someone a key.  `makePubliclyDecryptable` puts the key in the lobby.

### 3.5 Differential Privacy — adding noise on purpose

**Differential Privacy (DP)** is a mathematical framework for releasing information about a dataset while protecting individual privacy.

> **Simple definition:** You add carefully calibrated random noise to the answer so that an attacker who sees the answer cannot tell whether any specific person's data was included in the computation.

In this project, DP serves a different but related purpose: the `ResultOracle` adds noise to the final PRS before classification.  Without this, an adversary could:

1. Submit a known SNP vector (e.g., all zeros except one).
2. See the returned risk score.
3. Deduce the model's weight for that SNP.
4. Repeat until all weights are recovered.

This is called a **Model Extraction Attack**.  DP noise thwarts it by making the score slightly random, so repeated queries yield inconsistent answers that cannot be averaged to recover exact weights.

The noise the paper uses is **Gaussian** (bell-curve shaped).  The amount of noise needed to achieve a given privacy guarantee $\varepsilon$ (epsilon — smaller = more private but less accurate) is called the **sensitivity** of the query.

> **Important caveat in the current code:** The `ResultOracle.classify()` function *accepts* the noise ciphertext as a caller-supplied parameter.  A honest caller should generate proper Gaussian noise off-chain using `fhevmjs` and encrypt it; a malicious caller could pass zero noise.  On-chain noise generation using `FHE.randEuint64()` is on the roadmap.

---

## 4. The Reference Paper: HEPRS

### 4.1 Original 3-Party Protocol

The paper describes a system with three principals:

```
┌────────┐    encrypted SNPs    ┌───────────┐
│ Client │ ──────────────────► │  Evaluator │
│ (you)  │                      │ (runs FHE) │
└────────┘                      └───────────┘
                                      ▲
┌──────────┐  encrypted weights       │
│ Modeler  │ ───────────────────────►│
│(hospital)│
└──────────┘
```

1. **Client** encrypts their SNP vector with their public key and sends the ciphertext to the Evaluator.
2. **Modeler** encrypts their GWAS weight vector and sends it to the Evaluator.
3. **Evaluator** computes the homomorphic dot product and returns the encrypted result.
4. **Client** decrypts the result with their private key.

The paper states: *"The Evaluator never possesses the plaintext SNPs or weights; it only operates on ciphertexts."*

> **In plain English:** The hospital sends a "locked box" of weights.  You send a "locked box" of your DNA.  A third party (the Evaluator) mixes the two locked boxes together using special locked-box arithmetic to produce a new locked box containing your risk score.  Only you (holding your private key) can open the final box.

### 4.2 Key Vulnerabilities the Paper Identifies

The paper identifies several attack surfaces:

1. **Modeler-Evaluator collusion:** If the Modeler and Evaluator are the same entity, the Evaluator can trivially decrypt the client's SNPs.

2. **Evaluator dishonesty:** The Evaluator could run a different computation than agreed, or log ciphertext handles for later attacks.

3. **Model extraction via repeated queries:** A client can probe the system to reverse-engineer the weights (addressed by DP noise, see §3.5).

4. **Approximate decryption leakage in CKKS:** If the Evaluator sees many approximate decryption results, floating-point rounding patterns can leak information about plaintext values.

### 4.3 Our Blockchain Adaptation — what changed and why

| Paper component | Our blockchain equivalent | Reason for change |
|----------------|--------------------------|-------------------|
| CKKS encryption | TFHE (`euint64`) | fhEVM only exposes TFHE precompiles |
| Evaluator server | Smart contract on fhEVM | Smart contracts are immutable and auditable; no need to trust an operator |
| Floating-point weights | Scaled integers (quantization) | TFHE operates on integers, not floats |
| Off-chain key management | fhEVM KMS + ACL | The chain handles key delegation and access control |
| Single computation | Chunked across multiple transactions | EVM block gas limits prevent a single large FHE computation |
| Centralized result | `ResultOracle` emitting `makePubliclyDecryptable` | Decryption is gateway-mediated and auditable on-chain |

The most important change: **the "Modeler-Evaluator trust" vulnerability is completely eliminated** because the Evaluator is now an immutable smart contract — the researcher can verify the code before uploading their model, and the client can verify it before submitting their SNPs.

---

## 5. System Architecture

### 5.1 Layered Contract Design

```
Layer        Contract              Responsibility
─────────    ───────────────────   ──────────────────────────────────────────
Data         GenomicRegistry       Stores IPFS URIs + access control per sample
Research     ModelMarketplace      Lists GWAS weight vectors (public or private)
Logic        PRSComputeEngine      Chunked FHE dot product over N SNPs
Logic        BioETHPRS (in `contracts/HEPRS.sol`)    Standalone variant (embeds models, no Marketplace)
Output       ResultOracle          DP noise injection + Low/Med/High classification
Library      TFHE.sol              Thin wrapper around Zama FHE library
Mock         contracts/fhevm/      Plaintext stub for local Hardhat tests
```

The layer separation matters because:

- **Separation of concerns:** Researchers can update models without touching the compute engine.
- **Gas isolation:** The Registry and Marketplace are cheap (simple storage).  The Compute Engine is expensive (FHE ops); users only trigger it when needed.
- **Composability:** A different application could use the Marketplace without the Compute Engine.

### 5.2 Data Flow End-to-End

```
 Off-chain (Client)                    On-chain (fhEVM)
 ─────────────────────────────────     ──────────────────────────────────────────────

 1. Client sequences their DNA
    → produces [g_1, g_2, ..., g_N]

 2. Client calls fhevmjs:
    input.add64(g_1)
    input.add64(g_2)  ...
    await input.encrypt()
    → handles[], inputProof

 3. Client calls GenomicRegistry                  GenomicRegistry.registerSample(ipfsURI)
    (optional; stores URI for record)

 4. Researcher calls ModelMarketplace             ModelMarketplace.listPublicModel(weights)
    (or listEncryptedModel for private)

 5. Client calls PRSComputeEngine                 PRSComputeEngine.startPRS(modelId,
                                                    handles, chunkSize)
    → jobId                                       → stores job state on-chain

 6. Any party calls computeChunk                  PRSComputeEngine.computeChunk(jobId)
    (repeat until job.complete == true)           → accumulates euint64 partialSum

 7. Client calls finalize                         PRSComputeEngine.finalize(jobId)
    → receives euint64 handle                     → FHE.allow(partialSum, client)

 8. Client passes handle to ResultOracle          ResultOracle.classify(
    (with noise ciphertext)                         encryptedScore, encryptedNoise,
                                                    lowThreshold, highThreshold)
    → receives euint8 category handle             → FHE.makePubliclyDecryptable(category)

 9. Client calls gateway                          Gateway decrypts category
    (via fhevmjs re-encryption)                   → returns uint8 (0=Low,1=Med,2=High)
```

### 5.3 The Chunking / MapReduce Pattern

A 1,000-SNP dot product in FHE requires approximately 1,000 `fheMul` and 1,000 `fheAdd` calls.  Each FHE operation consumes significantly more gas than a standard EVM arithmetic op.  A typical fhEVM block gas limit is 30 M (same as mainnet Ethereum for compatibility).

**The problem:** 1,000 ops in one transaction overflows the gas limit.

**The solution:** Break the job into chunks of ~100 SNPs, each processed in a separate transaction that stays under the gas ceiling.

```
Transaction 1:  computeChunk(jobId)   → processes SNPs  [ 0.. 99], accumulates into partialSum
Transaction 2:  computeChunk(jobId)   → processes SNPs [100..199], adds to partialSum
...
Transaction 10: computeChunk(jobId)   → processes SNPs [900..999], job.complete = true
Transaction 11: finalize(jobId)       → returns final encrypted partialSum
```

The state machine inside `Job` tracks `nextIndex` so each `computeChunk` call knows where to resume.  This is similar to a distributed MapReduce where each transaction is one "Map" step and `partialSum` is the running "Reduce".

> **Gas scaling:** Gas scales roughly linearly with chunk count (and therefore with SNP count for a fixed chunk size).  The `scripts/gas_profile.ts` script measures this empirically.

---

## 6. Contract-by-Contract Deep Dive

### 6.1 GenomicRegistry

**File:** `contracts/GenomicRegistry.sol`

**Job:** Stores a reference to where your encrypted SNP data actually lives (IPFS or Arweave) and controls who can read that reference.

```solidity
struct Sample {
    string uri;      // e.g. "ipfs://Qm..."
    address owner;   // the person who registered
}

mapping(uint256 => mapping(address => bool)) private access;
```

**Key functions:**

- `registerSample(uri)` — You call this with an IPFS CID pointing to your encrypted SNP file.  Returns a `sampleId`.
- `grantAccess(sampleId, grantee)` — Allows a researcher's address to retrieve the URI.
- `getSample(sampleId)` — Returns the URI and owner.  Reverts if the caller neither owns the sample nor has been granted access.

**What it does NOT do (yet):**

- The `PRSComputeEngine` does **not** call `GenomicRegistry.getSample()` to verify the client has a registered sample before accepting encrypted SNPs.  This is a known gap — see `docs/INSTRUCTIONS.md` §7-A.

**Mental model:** Think of it as a decentralised file-sharing service where access control is enforced by the blockchain.  The actual file is off-chain (encrypted on IPFS); only the metadata is on-chain.

---

### 6.2 ModelMarketplace

**File:** `contracts/ModelMarketplace.sol`

**Job:** Allows researchers to publish GWAS weight vectors that clients can later use for PRS computation.

Two listing modes:

| Mode | Storage type | Multiplication type | Gas cost | Privacy |
|------|-------------|---------------------|----------|---------|
| Public | `uint64[]` | `mulPlain` (C×P) | Low | Weights visible to all |
| Private | `euint64[]` | `mul` (C×C) | High | Weights remain encrypted |

**Key insight — mulPlain vs. mul:**

In TFHE, there are two multiplication operations:

- **Ciphertext × Ciphertext (`mul`):** Both operands are encrypted.  Requires a full key-switching operation.  Expensive.
- **Ciphertext × Plaintext (`mulPlain`):** One operand is a known plaintext number.  Much cheaper because key-switching is not needed.

If a researcher is fine with their weights being public (open science model), they list them as `uint64[]`.  The `PRSComputeEngine` then uses `mulPlain(snp, weight)` for each term — roughly 60% cheaper per operation.

**What it does NOT do (yet):**

- No fee / payment mechanism.
- No model versioning or deprecation.
- No statistical quality attestation.

---

### 6.3 PRSComputeEngine (and BioETHPRS standalone)

**File:** `contracts/PRSComputeEngine.sol` / `contracts/HEPRS.sol` (contains the `BioETHPRS` contract)

**Job:** The core compute layer.  Executes the chunked dot product.

```solidity
struct Job {
    uint256 modelId;      // which model from Marketplace
    euint64[] snps;       // client's encrypted SNP handles
    uint256 nextIndex;    // where the next chunk starts
    uint256 chunkSize;    // how many SNPs per transaction
    euint64 partialSum;   // running encrypted accumulator
    address requester;    // who started the job
    bool complete;        // true once all chunks processed
}
```

**Lifecycle of a job:**

```
startPRS()      → creates Job, nextIndex = 0, partialSum = Enc(0)
computeChunk()  → loop from nextIndex to min(nextIndex+chunkSize, N)
                   acc += weights[i] * snps[i]   (FHE mul + add)
                   nextIndex += chunk_processed
                   if nextIndex == N: complete = true
finalize()      → allows requester to read partialSum, returns handle
```

**BioETHPRS vs. PRSComputeEngine:**

`HEPRS.sol` contains the `BioETHPRS` contract, a self-contained version that stores the model weights internally (via `uploadModel`). It was written first (prototype) and is tested in `bioeth_prs_test.ts`.

`PRSComputeEngine.sol` is the production version that reads models from `ModelMarketplace`, so models are decoupled from the compute engine.  This is what `registry_marketplace_oracle_test.ts` uses.

For new feature work, **prefer `PRSComputeEngine`** as it integrates with the full system.

---

### 6.4 ResultOracle

**File:** `contracts/ResultOracle.sol`

**Job:** Takes the final encrypted PRS, adds noise, classifies it, and makes the category decryptable.

```solidity
function classify(
    euint64 encryptedScore,    // output of finalize()
    euint64 encryptedNoise,    // caller-supplied DP noise
    uint64 lowThreshold,       // plaintext threshold (quantized)
    uint64 highThreshold       // plaintext threshold (quantized)
) external returns (euint8)
```

**What happens inside:**

1. `noisy = FHE.add(encryptedScore, encryptedNoise)`
2. `isLow = FHE.lt(noisy, lowThreshold)` — encrypted boolean
3. `isMedium = FHE.and(FHE.not(isLow), FHE.lt(noisy, highThreshold))`
4. `category = FHE.select(isLow, 0, FHE.select(isMedium, 1, 2))`
5. `FHE.makePubliclyDecryptable(category)` — publishes decrypt permission

All comparisons and selections happen inside the FHE domain — no plaintext score is ever revealed.

**The thresholds are plaintext.** `lowThreshold` and `highThreshold` are quantized integers (e.g., if the raw scale is $10^6$, a PRS of 0.5 → `lowThreshold = 500000`).  Since they are public, they do not compromise privacy.

**Emitted event:**

```solidity
event ResultClassified(address indexed requester, euint64 noisyScore, euint8 category);
```

Note: `noisyScore` in the event is an encrypted handle, not the plaintext value.

---

### 6.5 TFHE.sol and the FHE mock

**File:** `contracts/TFHE.sol`

A pure Solidity **library** that re-exports functions from Zama's `FHE.sol`.  Its role is to give contracts a stable internal import path (`./TFHE.sol`) so that swapping between the local mock and the real Zama library requires only a remapping change, not a contract source edit.

**File:** `contracts/fhevm/FHE.sol` (the **mock**)

This is the secret that makes local `npx hardhat compile` and `npx hardhat test` work without a fhEVM Docker node.  It implements the same function signatures as the real Zama `FHE.sol` but performs plaintext arithmetic:

```solidity
// Real FHE.sol: calls an EVM precompile that triggers homomorphic addition
function add(euint64 a, euint64 b) internal returns (euint64) { ... }

// Mock FHE.sol: simply adds the unwrapped uint64 values
function add(euint64 a, euint64 b) internal pure returns (euint64) {
    return euint64.wrap(euint64.unwrap(a) + euint64.unwrap(b));
}
```

When `FHEVM=1` is not set, Hardhat compiles using the mock, and tests execute in plaintext.  This is essential for rapid iteration without spinning up Docker.

> **Danger:** A test passing on the mock is **not** sufficient evidence of correctness on a real fhEVM node.  The mock ignores access control, ciphertext bounds, and gas costs.  Always validate on the Docker node before claiming a feature is complete.

---

## 7. The Math: Quantization and Fixed-Point Arithmetic

GWAS weights are small floating-point numbers, for example:

```
SNP rs7412: β = 0.004521
SNP rs429358: β = -0.002341
```

TFHE `euint64` only encrypts non-negative integers in $[0, 2^{64}-1]$.  We must convert floats to integers without losing meaningful precision.  This is called **quantization**.

**Step 1 — Choose a scaling factor $S$**

Multiply every weight by $S$ and round to the nearest integer:

$$w_i^{\text{int}} = \text{round}(w_i \times S)$$

Example with $S = 10^6$:

```
0.004521 × 10^6 = 4521   (stored as euint64)
```

**Step 2 — Handle negative weights**

`euint64` cannot represent negative numbers.  Offset weights by a constant (e.g., add $2^{31}$ to all weights) or use a two's-complement encoding.  The contracts currently leave this decision to the caller — it is an important open implementation question.

**Step 3 — The PRS result is also scaled**

The dot product of scaled SNPs and scaled weights gives:

$$\text{PRS}^{\text{int}} = \sum_i w_i^{\text{int}} \cdot g_i = S \times \sum_i w_i \cdot g_i = S \times \text{PRS}$$

So the final encrypted integer is `PRS × S`.  The thresholds in `ResultOracle` must therefore also be in the scaled domain:

```
If clinical threshold is PRS = 0.5, and S = 10^6:
lowThreshold = 500_000
```

**Step 4 — Overflow risk**

With $N = 1000$ SNPs, $g_i \le 2$, $w_i^{\text{int}} \le 10^6$, the maximum possible accumulator is:

$$1000 \times 2 \times 10^6 = 2 \times 10^9$$

`euint64` max is $\approx 1.8 \times 10^{19}$.  At $S = 10^6$ we have headroom.  At $S = 10^{12}$ with $N=5000$ the accumulator saturates.  **Always compute the ceiling before choosing $S$:**

$$S \le \frac{2^{64} - 1}{N \times g_{\max} \times w_{\max}^{\text{raw}}}$$

---

## 8. fhEVM — How Encrypted EVM Execution Works

### 8.1 The EVM and Gas Limits

The **Ethereum Virtual Machine (EVM)** is the runtime for smart contracts.  Every opcode has a gas cost (a unit of computation cost).  A block can contain at most ~30 million gas worth of operations.  Standard `MSTORE` costs 3 gas; a standard `MUL` costs 5 gas.

FHE operations are vastly more expensive.  A single TFHE multiplication in the Zama precompile costs millions of gas.  This hard constraint is why the chunking architecture exists.

### 8.2 Zama's fhEVM Stack

Zama's fhEVM modifies the standard EVM with:

1. **FHE Precompiles:** EVM opcodes at specific addresses that trigger homomorphic operations in a co-processor.
2. **Co-processor:** A server that stores ciphertexts and executes FHE operations off the main chain (but with results committed back to the state).
3. **KMS (Key Management Service):** Holds the decryption key.  Only decrypts outputs when the requester proves they are authorised (via the ACL on-chain).
4. **Gateway:** The bridge between off-chain clients and the KMS.  A client authenticates via a signed request; the gateway returns re-encrypted outputs.

```
Solidity contract calls FHE.add(a, b)
     ↓
EVM invokes FHE precompile
     ↓
Co-processor executes TFHE.add on actual ciphertexts
     ↓
Returns new ciphertext handle h_c
     ↓
Contract stores h_c
```

### 8.3 The Gateway and Re-encryption

When the client wants to read their result:

1. Client calls `finalize(jobId)` → contract calls `FHE.allow(partialSum, client_address)`.
2. Client sends a signed request to the **Gateway**: "Decrypt handle `h_c` for me."
3. Gateway verifies client's address is in the ACL.
4. KMS re-encrypts the ciphertext under the client's **ephemeral public key** (a fresh key generated for this session via `fhevmjs`).
5. Client decrypts the re-encrypted value with their ephemeral private key.

The network *never* sees the plaintext.  The KMS re-encrypts but never reveals; the client decrypts locally.

### 8.4 `makePubliclyDecryptable` vs. `allow`

| Function | Effect | Use case |
|----------|--------|----------|
| `FHE.allow(h, address)` | Grants one specific address decryption rights | Returning a score to a specific client |
| `FHE.makePubliclyDecryptable(h)` | Allows anyone to trigger decryption via the gateway | Publishing the final risk category (Low/Med/High) |

In `ResultOracle`, the risk *category* is made publicly decryptable because it's the final output meant for the client.  The noisy *score* ciphertext is not — it stays encrypted as evidence.

---

## 9. Local Development Setup

### Step 1: Install Node.js 20 LTS

```bash
# macOS with nvm
nvm install 20
nvm use 20
node -v   # should print v20.x.x
```

### Step 2: Clone and install

```bash
git clone <repo-url> blockchain_prs
cd blockchain_prs
npm install
```

### Step 3: Clone vendor library

```bash
git clone https://github.com/zama-ai/fhevm vendor/fhevm
```

### Step 4: Compile with the mock (no Docker needed)

```bash
npx hardhat compile
```

You should see `Compiled N Solidity files successfully` with no errors.

### Step 5: Explore the mock tests

The tests are gated by `FHEVM=1`.  To see what they do without a node, read the test files directly — they are clear TypeScript.

```
   test/bioeth_prs_test.ts                     — unit test for BioETHPRS standalone
test/registry_marketplace_oracle_test.ts    — integration test
test/utils/fhevm.ts                         — fhevmjs helpers
```

To run against a real fhEVM node, see [README.md](README.md) for full Docker + env var instructions.

### Step 6: Set up your editor

Install the **Hardhat Solidity** VS Code extension or **Nomic Foundation Solidity** for syntax highlighting and type checking.  The `remappings.txt` file in the root handles import resolution for linters.

---

## 10. Running Tests and Reading Their Output

### Test output on the mock

Because the tests guard with `if (process.env.FHEVM !== "1") { throw ... }`, running `npx hardhat test` **without** `FHEVM=1` will report:

```
0 passing
2 pending (or skipped)
```

This is expected.  The guard is intentional — the mock FHE does not simulate real TFHE ciphertext handles (`ethers.ZeroHash` comparisons in tests would all be vacuously true).

### What the tests actually assert

`bioeth_prs_test.ts`:

- Uploads weights `[2, 3, 4]` and SNPs `[5, 6, 7]`.
- Expected PRS = `2×5 + 3×6 + 4×7 = 10 + 18 + 28 = 56`.
- After two `computeChunk` calls (chunk size 2), asserts `finalScore !== ZeroHash` — meaning the contract returned a non-zero encrypted handle.
- Does not assert the numeric value (to do so requires gateway decryption).

`registry_marketplace_oracle_test.ts`:

- End-to-end: registers a sample, grants access to a researcher address, lists a public 3-weight model, runs PRS on SNPs `[4, 5, 6]` with chunk size 2.
- Expected PRS = `1×4 + 2×5 + 3×6 = 4 + 10 + 18 = 32`.
- Classifies with zero noise, `lowThreshold=10`, `highThreshold=20` → should be High (category 2).
- Asserts returned category handle is non-zero.

### Adding a gateway-decryption assertion

To assert the actual numeric value, extend `test/utils/fhevm.ts` with a `decrypt64` helper that calls the gateway, and add assertions like:

```typescript
const plaintext = await decrypt64(await getFhevmInstance(), score);
expect(plaintext).to.equal(56n);
```

---

## 11. Known Limitations and Open Problems

These are the areas where the prototype is incomplete.  Each is a potential contribution:

### 11-A. Registry ↔ Compute Engine Disconnect (high priority)

`PRSComputeEngine.startPRS()` accepts any `euint64[]`.  It does not verify the encrypted SNPs correspond to a registered sample.  A malicious user could submit arbitrary ciphertexts to probe the model.

**To fix:** Add a `sampleId` parameter to `startPRS`, call `GenomicRegistry.getSample(sampleId)`, and revert if the caller has no access.

### 11-B. Permissionless `computeChunk`

Anyone can call `computeChunk(jobId)` — not just the job requester.  This enables gasless relaying (useful for UX) but also griefing.

### 11-C. Caller-Supplied DP Noise

`ResultOracle.classify` accepts the noise from the caller.  A malicious caller can pass zero noise.

**To fix:** Use `FHE.randEuint64()` (if available on the target fhEVM version) to generate noise on-chain.

### 11-D. Negative Weight Encoding

GWAS weights are often negative.  `euint64` cannot directly represent negative numbers.  A mapping scheme (e.g., offset encoding or splitting into magnitude + sign) must be designed and documented.

### 11-E. Array Length Validation at Job Creation

`startPRS` does not validate that `encryptedSnps.length == model.length`.  The mismatch check only fires inside `computeChunk`.

### 11-F. No `euint16` Intermediate Accumulation

The roadmap targets cheaper intermediate ops using `euint16` before widening.  Not yet implemented — all math uses `euint64`.

### 11-G. No Finalize Event

`finalize()` does not emit an event.  Off-chain indexers cannot track completed jobs without scanning all transactions.

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| **ACL (Access Control List)** | On-chain mapping that tracks which Ethereum addresses may decrypt a given ciphertext handle. |
| **Beta coefficient (β)** | GWAS output: the effect size of a SNP — how much having each extra copy of the minor allele changes risk. |
| **Bootstrapping** | An FHE operation that reduces accumulated noise in a ciphertext, enabling deeper computations at high gas cost. |
| **CKKS** | FHE scheme optimised for approximate real-number arithmetic with SIMD slot packing. Used in the original HEPRS paper. |
| **Ciphertext** | Encrypted data — the output of encrypting a plaintext value. |
| **Coprocessor** | The off-chain server in Zama's fhEVM that stores ciphertexts and performs FHE operations. |
| **Differential Privacy (DP)** | A mathematical guarantee that the output of a query does not reveal whether any individual was in the dataset, achieved by adding calibrated noise. |
| **Dosage** | The number of minor alleles (0, 1, or 2) a person carries at a given SNP position. |
| **ebool / euint8 / euint64** | Solidity user-defined value types wrapping an encrypted boolean, 8-bit integer, or 64-bit integer respectively (defined in `EncryptedTypes.sol`). |
| **fhEVM** | Fully Homomorphic EVM — a modified Ethereum runtime that supports FHE precompiles. |
| **FHE (Fully Homomorphic Encryption)** | Encryption scheme supporting arbitrary arithmetic on ciphertexts without decryption. |
| **GWAS** | Genome-Wide Association Study — statistical scan linking SNPs to traits/diseases. |
| **Handle** | A 32-byte on-chain reference number pointing to a ciphertext stored in the coprocessor. |
| **KMS (Key Management Service)** | Zama's service that holds the FHE decryption key and performs re-encryption for authorised users. |
| **makePubliclyDecryptable** | Zama FHE function that marks a ciphertext as decryptable by any gateway caller. |
| **Minor allele** | The less-common DNA variant at a given SNP position. |
| **Model Extraction Attack** | An attack where an adversary probes a model with crafted inputs to reverse-engineer its parameters. |
| **mulPlain** | Ciphertext × Plaintext multiplication — cheaper than Ciphertext × Ciphertext because no key-switching is needed. |
| **Polygenic** | Influenced by many genes (as opposed to monogenic, influenced by one). |
| **PRS (Polygenic Risk Score)** | A single score summarising genetic predisposition, computed as the dot product of GWAS weights and personal dosage values. |
| **Quantization** | Converting floating-point numbers to scaled integers by multiplying by a scaling factor $S$. |
| **Re-encryption** | The process by which the KMS converts a ciphertext encrypted under the network key into one encrypted under a client's ephemeral public key, without revealing the plaintext. |
| **SIMD (Single Instruction, Multiple Data)** | In FHE context: packing multiple values into a single ciphertext to process them in parallel with one operation. |
| **SNP (Single Nucleotide Polymorphism)** | A position in the genome where different people carry different nucleotides. |
| **TFHE (Torus FHE)** | FHE scheme supporting exact integer and boolean operations via torus arithmetic; used by Zama's fhEVM. |
| **Trustless** | Requiring no trusted third party — correctness is guaranteed by maths or protocol design alone. |
