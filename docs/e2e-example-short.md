# End-to-End Scenario: Computing a Polygenic Risk Score (PRS)

This walkthrough shows a **complete realistic execution flow** of the system described in the onboarding guide.  
It illustrates how a user computes a PRS score **without revealing their genome or the model weights**.

Actors involved:

- **Alice** > patient / client
- **CardioLab** > researcher publishing a PRS model
- **GenomicRegistry** > contract storing genome metadata
- **ModelMarketplace** > contract storing PRS models
- **PRSComputeEngine** > performs encrypted computation
- **ResultOracle** > converts encrypted score to a risk category
- **Gateway/KMS** > performs controlled decryption

## Toy Example Data

Alice's SNP vector: `[0, 1, 2]`

Interpretation:

- SNP1 dosage = 0  
- SNP2 dosage = 1  
- SNP3 dosage = 2  

CardioLab's PRS model weights: `[4, 3, 5]`

Plaintext PRS calculation (for intuition only): `0*4 + 1*3 + 2*5 = 13`

In the real system this value **is never visible during computation**.

## Step 1: Genome converted to SNP dosages

Alice's genome is converted to a numeric SNP dosage vector.

Example: `[0, 1, 2]`

This is the input used by the PRS system.

This step happens **off-chain**.

## Step 2: Alice encrypts the SNP vector

Alice uses the client library (fhevmjs) to encrypt the SNP values.

Conceptually:

```text
add64(0)  
add64(1)  
add64(2)  
encrypt()
```

The encryption produces:

- encrypted handles
- a proof object

Important:

The blockchain **never receives plaintext SNP values**.

Instead it receives **encrypted handles referencing ciphertexts**.

## Step 3: Alice uploads the encrypted genome

Alice uploads the encrypted SNP dataset to decentralized storage.

Example storage systems:

- IPFS
- Arweave
- encrypted cloud storage

Example URI: `ipfs://QmAliceEncryptedGenome`

Alice optionally registers the dataset in the registry contract: `registerSample("ipfs://QmAliceEncryptedGenome")`

Registry entry:

```text
sampleID: 17  
owner: Alice  
uri: ipfs://QmAliceEncryptedGenome  
```

This step records **metadata and ownership**, not the genome itself.

## Step 4: Researcher publishes a PRS model

CardioLab publishes a PRS model to the ModelMarketplace.

Example weights: `[4, 3, 5]`

Two possible storage types:

- **Public model**: `uint64[] weights`
- **Private model**: `euint64[] weights`

Public models are cheaper to compute because multiplication can use plaintext weights.

The model is registered and receives an identifier: `modelID = 7`

## Step 5: Alice starts a PRS computation job

Alice calls the compute engine:

```text
startPRS(modelId=7, encryptedSNPHandles, chunkSize=2)
```

The compute engine creates a job structure:

```text
modelId = 7  
snps = encrypted handles  
nextIndex = 0  
chunkSize = 2  
partialSum = Enc(0)  
requester = Alice  
complete = false  
```

The partial sum is an **encrypted accumulator**.

## Step 6: First computeChunk transaction

Someone calls: `computeChunk(jobId)`

The engine processes SNP indices 0-1.

Conceptually (plaintext intuition): `0*4 + 1*3 = 3`

Encrypted operations performed internally:

```text
partialSum = Enc(0) + Enc(3)
```

State after chunk:

```text
nextIndex = 2  
partialSum = Enc(3)  
complete = false  
```

The blockchain still cannot see the value 3.

---

## Step 7: Second computeChunk transaction

Another transaction calls: `computeChunk(jobId)`

The engine processes SNP index 2.

Conceptual plaintext intuition: `2*5 = 10`

Added to the previous encrypted sum: `3 + 10 = 13`

Updated state:

```text
nextIndex = 3  
partialSum = Enc(13)  
complete = true  
```

The job is now finished.

---

## Step 8: Alice finalizes the job

Alice calls: `finalize(jobId)`

The compute engine returns the encrypted score handle.

It also grants permission:

```text
FHE.allow(partialSum, Alice)
```

Meaning Alice is authorized to decrypt or re-encrypt this value through the gateway.

Alice now possesses a handle representing: `Enc(13)`

But the value 13 is still hidden.

---

## Step 9: Alice sends score to ResultOracle

Alice calls: `classify(encryptedScore, encryptedNoise, lowThreshold, highThreshold)`

Example thresholds:

```text
lowThreshold = 5  
highThreshold = 12  
```

Example noise: `+1`

Oracle computation conceptually: `noisyScore = 13 + 1 = 14`

The oracle then determines which category the value belongs to.

Categories:

```text
0 = Low  
1 = Medium  
2 = High
```

Because 14 ≥ 12:

category = High

All comparisons occur on encrypted values.

---

## Step 10: Oracle makes result decryptable

The oracle performs:

`FHE.makePubliclyDecryptable(category)`

This allows the category to be decrypted safely.

Why safe?

Because the category reveals only:

`Low / Medium / High`

It does not expose the raw PRS score.

---

## Step 11: Alice retrieves the result

Alice queries the gateway.

The gateway decrypts the category and returns a plaintext integer: `2`

The application interprets:

`2 → High risk`

Alice receives her result without exposing:

- her genome
- the model weights
- the raw PRS score

## Full System Flow

1. Alice prepares SNP vector  
2. Alice encrypts SNPs off-chain  
3. Alice uploads encrypted genome to IPFS  
4. Alice registers metadata in `GenomicRegistry`  
5. CardioLab publishes PRS model in `ModelMarketplace`  
6. Alice calls `startPRS()`  
7. Multiple `computeChunk()` transactions run encrypted multiplications  
8. `finalize()` returns encrypted PRS score  
9. Alice sends score to `ResultOracle`  
10. `ResultOracle` adds noise and classifies result  
11. Gateway decrypts final category for Alice  

## Key Architectural Ideas

- **Encrypted inputs:** Genome data is encrypted before entering the system.
- **Off-chain storage:** Large genomic files are stored outside the blockchain.
- **On-chain verification:** Smart contracts enforce the computation rules.
- **Chunked computation:** Large encrypted calculations are split across multiple transactions.
- **Privacy-preserving output:** Only a coarse risk category is revealed to the user.

## Two Important Implementation Caveats

1. The compute engine currently accepts encrypted SNP arrays directly and does not always verify they correspond to a registered genome in the registry.

2. The noise used in `ResultOracle` is currently supplied by the caller rather than generated on-chain.

These areas are potential improvement targets for future development.
