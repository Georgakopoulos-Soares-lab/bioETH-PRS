# End-to-End Walkthrough: Contract-Grounded V1 PRS Example

This document is a **full contract-grounded walkthrough** of the current `bioETH PRS`
`v1` flow.

The only toy part is the small numeric example.  The control flow, state fields,
permissions, quantization path, and oracle handoff all match the way the repo is
currently designed and tested.

This walkthrough ties together:

* `GenomicRegistry`
* `ModelMarketplace`
* `PRSComputeEngine`
* `ResultOracle`
* off-chain quantization metadata
* fhEVM input proofs, ACL, and output access

It is meant for a reader who is new to the repo and wants one place to see the
whole system in motion.

## What this example covers

This example uses:

* a **public model** with nonzero `weightZeroPoint` and `scoreOffset`
* a registered sample in `GenomicRegistry`
* chunked model publication
* chunked SNP upload
* chunked encrypted PRS compute
* requester-only result access
* oracle classification with on-chain random noise

It also calls out where the private-model path differs.

## The cast

Actors:

* **CardioLab** — model publisher
* **Alice** — sample owner and PRS requester
* **Carol** — optional relayer who pays gas for `computeChunk`

Contracts:

* **`GenomicRegistry`** — sample metadata and access control
* **`ModelMarketplace`** — model header + weight payload publication
* **`PRSComputeEngine`** — staged SNP upload and chunked PRS computation
* **`ResultOracle`** — on-chain random-noise addition and categorical output

Off-chain components:

* **`fhevmjs`** — client encryption / input-proof generation
* **Gateway / KMS** — authorized decryption and re-encryption path on Sepolia

## Example data

### 1. The scientific model before quantization

Suppose CardioLab starts with a 5-SNP PRS model:

```text
beta = [-0.30, 0.10, 0.25, -0.05, 0.40]
```

Alice's hardcall SNP vector is:

```text
g = [0, 2, 1, 0, 1]
```

The original floating-point PRS is:

```text
0*(-0.30) + 2*(0.10) + 1*(0.25) + 0*(-0.05) + 1*(0.40) = 0.85
```

So the human-readable answer for this example is `0.85`.

### 2. Quantization choices

CardioLab chooses:

```text
scale = 100
```

Signed quantized weights:

```text
q = [-30, 10, 25, -5, 40]
```

Weight zero-point:

```text
weightZeroPoint = -min(q) = 30
```

Unsigned stored weights:

```text
u = q + weightZeroPoint = [0, 40, 55, 25, 70]
```

Exact score bounds under hardcalls `g_i in {0,1,2}`:

```text
rawMin = 2*(-30) + 2*(-5) = -70
rawMax = 2*(10 + 25 + 40) = 150
scoreOffset = -rawMin = 70
encodedRange = rawMax - rawMin = 220
```

That means the contract will work in the encoded unsigned domain:

```text
encodedScore = raw_score_q + 70
```

For Alice's example:

```text
raw_score_q = 85
encodedScore = 85 + 70 = 155
```

The PRS engine does not compute `85` directly on-chain.  It computes:

```text
weighted_sum = sum(g_i * u_i)
geno_sum = sum(g_i)
encodedScore = weighted_sum + scoreOffset - weightZeroPoint * geno_sum
```

For this example:

```text
weighted_sum = 0*0 + 2*40 + 1*55 + 0*25 + 1*70 = 205
geno_sum = 0 + 2 + 1 + 0 + 1 = 4
encodedScore = 205 + 70 - 30*4 = 155
```

This is exactly the contract formula used in `PRSComputeEngine.finalize()`.

### 3. Example model metadata

Off-chain, CardioLab would publish a manifest containing at least:

```text
trait = "Example cardiovascular PRS"
weightScale = 100
weightZeroPoint = 30
scoreOffset = 70
rawMin = -70
rawMax = 150
encodedRange = 220
genotypeMode = "hardcall_0_1_2"
thresholdsEncoded = { low: 140, high: 180 }
sourceModelHash = 0x...
```

On-chain, the model header stores only part of this:

* `weightCount`
* `uploadChunkSize`
* `computeChunkSize`
* `manifestURI`
* `manifestHash`
* `sourceModelHash`
* `weightZeroPoint`
* `scoreOffset`

The remaining scientific details stay in the manifest.

## Phase 1: Sample registration and access control

Alice stores her encrypted genome file off-chain and registers the pointer:

```text
registerSample("ipfs://QmAliceEncryptedGenome")
```

Assume this returns:

```text
sampleId = 7
```

Registry state now conceptually contains:

```text
samples[7] = {
  uri: "ipfs://QmAliceEncryptedGenome",
  owner: Alice
}
access[7][Alice] = true by ownership
```

What this means:

* `sampleId` is a registry identifier, not the genome itself
* the contract stores a pointer plus owner / ACL metadata
* the sample file contents remain off-chain

Important security meaning:

* `createPRSJob(modelId, sampleId)` later checks `hasAccess(sampleId, msg.sender)`
* a stranger who does not own `sampleId` and was not granted access cannot open a PRS job for it

Important limitation:

* the engine does **not** verify that later-uploaded ciphertexts truly match the
  file behind `ipfs://QmAliceEncryptedGenome`
* today, `sampleId` is an **authorization anchor**, not a cryptographic binding
  between registry metadata and submitted ciphertexts

## Phase 2: Model publication in `ModelMarketplace`

CardioLab now publishes the quantized model.

### 1. Create the model shell

CardioLab calls:

```text
createModelShell(
  isPrivate = false,
  weightCount = 5,
  uploadChunkSize = 4,
  computeChunkSize = 2,
  manifestURI = "ipfs://QmCardioLabManifest",
  manifestHash = 0x...,
  sourceModelHash = 0x...,
  weightZeroPoint = 30,
  scoreOffset = 70
)
```

Assume this returns:

```text
modelId = 12
```

The model header now contains:

```text
owner = CardioLab
isPrivate = false
finalized = false
weightCount = 5
uploadChunkSize = 4
computeChunkSize = 2
chunkCount = ceil(5 / 2) = 3
uploadedWeightCount = 0
manifestURI = "ipfs://QmCardioLabManifest"
weightZeroPoint = 30
scoreOffset = 70
```

Why these chunk sizes differ:

* `uploadChunkSize = 4` controls weight publication batching
* `computeChunkSize = 2` controls how many weight/SNP pairs the compute engine
  will process per `computeChunk`

The system stores weights flat and slices them by `computeChunkSize` when the
engine reads them.

### 2. Upload the model payload

Because `uploadChunkSize = 4`, CardioLab publishes:

```text
appendPublicModelChunk(12, [0, 40, 55, 25])
appendPublicModelChunk(12, [70])
```

After both calls:

```text
uploadedWeightCount = 5
```

### 3. Finalize the model

CardioLab calls:

```text
finalizeModel(12)
```

Now:

```text
finalized = true
```

What the engine will later read as compute chunks:

```text
compute chunk 0 -> [0, 40]
compute chunk 1 -> [55, 25]
compute chunk 2 -> [70]
```

Security meaning:

* only the model owner may append or finalize
* jobs may not use a draft model
* once finalized, the model is immutable in `v1`

## Phase 3: PRS job creation in `PRSComputeEngine`

Alice now starts a PRS job against the finalized model:

```text
createPRSJob(modelId = 12, sampleId = 7)
```

The engine checks:

* `GenomicRegistry.hasAccess(7, Alice)` is true
* model `12` exists and is finalized
* if the model were private, the engine itself would need reader authorization

Assume the returned value is:

```text
jobId = 3
```

The stored job looks like this conceptually:

```text
Job[3] = {
  modelId: 12,
  sampleId: 7,
  weightCount: 5,
  uploadChunkSize: 4,
  computeChunkSize: 2,
  chunkCount: 3,
  uploadedSnpCount: 0,
  nextChunkIndex: 0,
  processedWeights: 0,
  partialSum: Enc(0),
  genoSum: Enc(0),
  requester: Alice,
  isPrivate: false,
  snpsFinalized: false,
  complete: false,
  weightZeroPoint: 30,
  scoreOffset: 70
}
```

Meaning of the fields:

* `uploadedSnpCount` tracks upload progress
* `nextChunkIndex` tracks **compute** progress, not upload progress
* `processedWeights` is the number of weight/SNP pairs already computed
* `partialSum` is the encrypted running sum of shifted-weight products
* `genoSum` is the encrypted running sum of genotype dosages
* `requester` is the address that controls upload and final output access

Security meaning:

* only an authorized sample owner or delegate can create the job
* whoever creates the job becomes the `requester`
* the registry owner and the requester may be the same person, but do not have
  to be

Practical implication:

* if Alice granted Bob access to `sampleId = 7` and Bob created the job, then
  Bob would become the `requester` for that job and would control upload and
  result access on that job instance

## Phase 4: Alice encrypts and uploads SNP chunks

Alice's plaintext SNP vector is:

```text
[0, 2, 1, 0, 1]
```

The PRS engine address is the encryption target.

### 1. First chunk upload

Because `uploadChunkSize = 4`, Alice encrypts the first four values for the
engine contract using `fhevmjs`:

```text
createEncryptedInput(engineAddress, Alice)
add64(0)
add64(2)
add64(1)
add64(0)
encrypt()
```

This yields:

```text
handles = [ext0, ext1, ext2, ext3]
inputProof = proofA
```

Alice submits:

```text
appendSnpChunk(3, [ext0, ext1, ext2, ext3], proofA)
```

The engine:

* checks `msg.sender == requester`
* derives the next required upload length as `4`
* runs `FHE.fromExternal(handle, proofA)` for each handle
* runs `FHE.allowThis(snp)` for each imported ciphertext
* stores the imported ciphertext handles into the flat `snpData[3]` array

Job state after the first upload:

```text
uploadedSnpCount = 4
snpsFinalized = false
nextChunkIndex = 0
processedWeights = 0
complete = false
```

The next upload chunk is derived from:

```text
uploadedSnpCount / uploadChunkSize = 4 / 4 = 1
```

### 2. Second chunk upload

Alice encrypts the remaining SNP:

```text
createEncryptedInput(engineAddress, Alice)
add64(1)
encrypt()
```

This yields:

```text
handles = [ext4]
inputProof = proofB
```

Alice submits:

```text
appendSnpChunk(3, [ext4], proofB)
```

Job state after the second upload:

```text
uploadedSnpCount = 5
snpsFinalized = false
nextChunkIndex = 0
processedWeights = 0
complete = false
```

### 3. Finalize the SNP payload

Alice calls:

```text
finalizeSnpUpload(3)
```

This requires:

* `msg.sender == requester`
* `uploadedSnpCount == weightCount`
* job still in upload phase

Job state now:

```text
uploadedSnpCount = 5
snpsFinalized = true
nextChunkIndex = 0
processedWeights = 0
complete = false
```

Security meaning of the SNP upload path:

* only the `requester` may upload SNP chunks
* the contract derives the expected chunk length, so the caller cannot upload
  sparse, out-of-order, or oversized chunks
* compute is blocked until the SNP payload is finalized

### What `inputProof` really proves

`inputProof` is part of the fhEVM encrypted-input protocol.

What it proves:

* the submitted external encrypted handles are valid for the fhEVM input path
* the contract may import them with `FHE.fromExternal(...)`

What it does **not** prove:

* that the plaintext SNPs are scientifically correct
* that the ciphertexts match the genome file pointed to by `sampleId`
* that the requester is honest about the off-chain preprocessing

So the real `v1` security boundary is:

* `sampleId` proves the caller is authorized to open a job
* `inputProof` proves the encrypted inputs are valid fhEVM inputs
* neither one proves that the ciphertext payload is the exact content of the
  registered sample file

## Phase 5: Chunked PRS computation

Now the job is ready for compute.

Anyone may relay:

```text
computeChunk(3)
```

Assume Carol pays gas and calls all three compute transactions.

### Compute chunk 0

The engine reads:

```text
SNP slice    = [0, 2]
weight slice = [0, 40]
```

Contribution:

```text
0*0 + 2*40 = 80
```

Updated encrypted state:

```text
partialSum = Enc(80)
genoSum = Enc(2)
processedWeights = 2
nextChunkIndex = 1
complete = false
```

### Compute chunk 1

The engine reads:

```text
SNP slice    = [1, 0]
weight slice = [55, 25]
```

Contribution:

```text
1*55 + 0*25 = 55
```

Updated encrypted state:

```text
partialSum = Enc(135)
genoSum = Enc(3)
processedWeights = 4
nextChunkIndex = 2
complete = false
```

### Compute chunk 2

The engine reads:

```text
SNP slice    = [1]
weight slice = [70]
```

Contribution:

```text
1*70 = 70
```

Updated encrypted state:

```text
partialSum = Enc(205)
genoSum = Enc(4)
processedWeights = 5
nextChunkIndex = 3
complete = true
```

### What the contracts know during compute

The chain can see:

* which job is being advanced
* which chunk index is being processed
* that the job becomes complete after the third chunk

The chain cannot see:

* plaintext SNP values
* plaintext intermediate products
* plaintext `partialSum`
* plaintext final score

The contract stores encrypted handles, not readable integers.

Security meaning:

* compute relayers can pay gas to advance the job
* relayers do **not** gain decryption rights
* relayers do **not** control upload or final score access

## Phase 6: Finalize the PRS job and recover the encoded score

Only Alice, the `requester`, may finalize:

```text
finalize(3)
```

At this point the engine applies the quantization correction:

```text
withOffset  = partialSum + scoreOffset
correction  = genoSum * weightZeroPoint
encodedScore = withOffset - correction
```

Substituting the example numbers:

```text
withOffset  = 205 + 70 = 275
correction  = 4 * 30 = 120
encodedScore = 275 - 120 = 155
```

This is the encoded unsigned score for Alice's PRS job.

To interpret it off-chain:

```text
raw_score_q = encodedScore - scoreOffset = 155 - 70 = 85
decoded_float_score = raw_score_q / scale = 85 / 100 = 0.85
```

Why the contract computes it in this order:

* the signed PRS may be negative
* `euint64` arithmetic is unsigned
* `(partialSum + scoreOffset) - correction` avoids an intermediate underflow

After computing `encodedScore`, the engine does two things:

* keeps the encrypted handle available to the contract itself
* grants the requester decrypt / re-encryption rights with `FHE.allow(...)`

Security meaning:

* only the requester may ask for the final score from the engine
* `allow` is an authorization step, not plaintext release
* the output is still encrypted after `finalize`

## Phase 7: Actual oracle handoff in the current implementation

This is one of the most important "real system" details.

The engine's output handle is an encrypted contract result handle.  The oracle
does **not** consume that handle directly.

The current oracle API is:

```text
classify(externalEuint64 encryptedScore, bytes inputProof, lowThreshold, highThreshold)
```

That means the oracle expects a fresh encrypted input submitted through the
external input path.

### What happens today

1. Alice finalizes the PRS job and receives permission on the engine score handle.
2. Alice retrieves the score through the authorized decryption / re-encryption path.
3. Alice encrypts that score again targeting the oracle contract.
4. Alice calls `ResultOracle.classify(...)`.

### Mock vs. Sepolia

In local tests:

* the test suite uses mock-only debug decryption to inspect the engine score
* then re-encrypts the plaintext score for the oracle

On Sepolia:

* the user uses the fhEVM gateway / KMS re-encryption path to obtain the score
* then the client encrypts the score again targeting the oracle

So the current cross-contract flow is:

```text
engine encrypted score
-> authorized user decrypt / re-encrypt flow
-> user-side plaintext or client-side recovered value
-> fresh encrypted oracle input
-> oracle classification
```

This is not just a teaching convenience.  It is the actual path reflected in
the current contracts and integration tests.

## Phase 8: Oracle classification

Assume the oracle is deployed with:

```text
noiseUpperBound = 8
```

This means noise is drawn uniformly from:

```text
noise in [0, 8)
```

Alice uses the encoded-domain thresholds from the manifest:

```text
lowThreshold = 140
highThreshold = 180
```

Alice re-encrypts `encodedScore = 155` for the oracle and submits:

```text
classify(Enc(155), oracleInputProof, 140, 180)
```

The oracle computes:

```text
noise = random integer in [0, 7]
noisyScore = 155 + noise
```

So in this example:

```text
noisyScore in [155, 162]
```

Since every possible noisy score is:

```text
140 <= noisyScore < 180
```

the category is always:

```text
Medium = 1
```

The oracle then:

* emits `ResultClassified`
* returns the encrypted category handle
* calls `FHE.makePubliclyDecryptable(category)`

That last step is important:

* the full score stays protected
* the category becomes public-decryptable

This matches the intended privacy shape:

* detailed PRS output is requester-controlled
* coarse categorical output can be made publicly visible if desired

## Public-model path vs. private-model path

This walkthrough used a public model because it is easier to read.

The private-model path changes only a few pieces, but they matter:

### 1. Model publication

Instead of:

```text
appendPublicModelChunk(modelId, uint64[])
```

the publisher uses:

```text
appendEncryptedModelChunk(modelId, externalEuint64[], inputProof)
```

So private-model publication itself uses fhEVM encrypted inputs plus
`inputProof`.

### 2. Engine authorization

Before jobs can use that private model, the engine contract must be explicitly
authorized as a reader:

```text
setPrivateModelReader(modelId, engineAddress, true)
```

Otherwise `createPRSJob(...)` reverts with:

```text
"Engine not authorized"
```

### 3. Compute path

Public model compute uses:

```text
FHE.mul(snp, FHE.asEuint64(weight))
```

Private model compute uses:

```text
FHE.mul(encryptedWeight, snp)
```

So the semantics of chunking, `partialSum`, `genoSum`, `weightZeroPoint`,
`scoreOffset`, and `finalize()` stay the same.  The main differences are:

* private weight upload path
* engine reader authorization
* higher encrypted compute cost
* weights hidden from the chain

## The actual transaction sequence

For this example, the transaction sequence is:

1. Alice: `GenomicRegistry.registerSample("ipfs://QmAliceEncryptedGenome")`
2. CardioLab: `ModelMarketplace.createModelShell(...)`
3. CardioLab: `ModelMarketplace.appendPublicModelChunk(12, [0,40,55,25])`
4. CardioLab: `ModelMarketplace.appendPublicModelChunk(12, [70])`
5. CardioLab: `ModelMarketplace.finalizeModel(12)`
6. Alice: `PRSComputeEngine.createPRSJob(12, 7)`
7. Alice: `PRSComputeEngine.appendSnpChunk(3, [ext0,ext1,ext2,ext3], proofA)`
8. Alice: `PRSComputeEngine.appendSnpChunk(3, [ext4], proofB)`
9. Alice: `PRSComputeEngine.finalizeSnpUpload(3)`
10. Carol: `PRSComputeEngine.computeChunk(3)`
11. Carol: `PRSComputeEngine.computeChunk(3)`
12. Carol: `PRSComputeEngine.computeChunk(3)`
13. Alice: `PRSComputeEngine.finalize(3)`
14. Alice client: authorized decrypt / re-encrypt handoff from engine output
15. Alice client: encrypt score for oracle
16. Alice: `ResultOracle.classify(...)`

## Security summary

### What `v1` enforces

* sample owner / delegate ACL at `createPRSJob`
* requester-only SNP upload
* requester-only `finalizeSnpUpload`
* requester-only engine `finalize`
* model owner-only publication and finalization
* private-model reader ACL for encrypted model weights
* finalize-before-compute for SNP jobs
* sequential chunk discipline for model and SNP uploads
* permissionless relaying for compute only
* requester-scoped score access via `FHE.allow`
* optional public visibility for the final category via `FHE.makePubliclyDecryptable`

### What `v1` does not yet enforce

* it does not prove the uploaded SNP ciphertexts correspond to the registered
  sample URI
* it does not prove the publisher is scientifically honest about the manifest or
  source model semantics
* it does not include anti-spam / pricing / fee controls
* it does not eliminate KMS / gateway trust questions on real deployments

## Why this walkthrough matters

A newcomer can summarize the repo's real `v1` like this:

* the registry controls **who may start a job for a sample**
* the marketplace controls **what model geometry and metadata a job inherits**
* the compute engine controls **how encrypted SNPs are uploaded, frozen, and
  processed in chunks**
* quantization metadata controls **how signed scientific weights are represented
  safely in unsigned encrypted arithmetic**
* the oracle consumes a **fresh encrypted score input**, adds on-chain random
  noise, and returns an encrypted category

That is the current end-to-end design in operational terms.

## Where to look next

After reading this walkthrough, the most useful deeper reads are:

* [`../design/model-marketplace.md`](../design/model-marketplace.md)
* [`../design/snp-ingestion.md`](../design/snp-ingestion.md)
* [`../design/quantization.md`](../design/quantization.md)
* [`../../test/prs_compute_engine_chunked_snp_test.ts`](../../test/prs_compute_engine_chunked_snp_test.ts)
* [`../../test/registry_marketplace_oracle_test.ts`](../../test/registry_marketplace_oracle_test.ts)
