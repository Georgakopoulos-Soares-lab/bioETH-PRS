# End-to-End Flow: Upgraded Realistic Scenario

This version keeps the same Alice/CardioLab toy inputs, but maps each step to the exact component that acts in the system.

We will keep:

- Alice SNPs: `[0,1,2]`
- CardioLab model weights: `[4,3,5]`
- Chunk size: `2`

---

## Phase 1: Input Preparation

### Step 1: Alice's app creates plaintext SNPs

Alice's local machine has a plaintext genome-derived SNP vector:

- `[0,1,2]`

Only Alice can see this at this point.

### Step 2: Alice encrypts with `fhevmjs`

Her app creates encrypted inputs and gets handles/proofs suitable for chain submission.

The onboarding flow shows the client using `fhevmjs` to:

- Add SNP values
- Encrypt
- Obtain `handles[]` and an input proof

Two worlds now exist:

- Alice may still have local plaintext (if the app keeps it)
- The fhEVM runtime now has ciphertext objects for those values

### Step 3: What is stored where

At this point:

- Plaintext values are on Alice's machine
- Ciphertext material is in the encrypted runtime/backend
- The contract will receive handles, not plaintext numbers

---

## Phase 2: Model Publication

### Step 4: CardioLab publishes model

`ModelMarketplace` stores either:

- Public plaintext weights (`uint64[]`), using cheaper `mulPlain`
- Encrypted weights (`euint64[]`), using full encrypted `mul`

In this scenario, the model is public:

- `modelId = 7`
- `weights = [4,3,5]`

Implications:

- Contracts know the weight values
- Genome data remains encrypted
- Per-term computation can use ciphertext x plaintext multiplication

---

## Phase 3: Job Creation On-Chain

### Step 5: Alice creates a PRS job shell

The job is created with:

```text
modelId = 7
uploadedSnpCount = 0
snpsFinalized = false
chunkSize = 2      (read from the finalized model)
chunkCount = 2
nextChunkIndex = 0
processedWeights = 0
partialSum = Enc(0)
requester = Alice
```

The current lifecycle initializes `nextChunkIndex = 0`, `processedWeights = 0`, and `partialSum = Enc(0)`.

### Step 6: Alice uploads SNP chunks and finalizes upload

Alice appends SNP chunks that align to the model's chunk geometry:

```text
appendSnpChunk(jobId, [Enc(0), Enc(1)])
appendSnpChunk(jobId, [Enc(2)])
finalizeSnpUpload(jobId)
```

What each component knows now:

Contract knows:

- A job exists
- Which handles belong to it
- Which model ID to use
- Who requested it

Contract does not know:

- Plaintext SNPs
- Plaintext score

Coprocessor knows:

- Ciphertexts behind those handles exist

---

## Phase 4: First Chunk Execution

### Step 6: Someone calls `computeChunk(jobId)`

In the current design, any party can call `computeChunk(jobId)`.

With model chunk size `2`, this transaction processes the first published model chunk, which aligns to SNP indices `0` and `1`.

For index `0`:

- SNP handle corresponds to encrypted `0`
- Weight is plaintext `4`
- Runtime performs `mulPlain`

For index `1`:

- SNP handle corresponds to encrypted `1`
- Weight is plaintext `3`
- Runtime performs `mulPlain`

The products are then added into `partialSum`.

#### What happens under the hood

For each encrypted operation:

1. Contract invokes an FHE library call.
2. EVM routes it to an FHE precompile.
3. Precompile triggers the coprocessor.
4. Coprocessor loads ciphertext(s).
5. Coprocessor computes the TFHE operation.
6. Coprocessor stores the result ciphertext.
7. A new handle is returned.
8. Contract updates job state with that handle.

So contract state may move from:

- `partialSum = h_zero`

to:

- `partialSum = h_after_chunk_1`

Conceptually this is now `Enc(3)`, but the contract still cannot see `3`.

Why validators still cannot "look":

- They see a handle change
- They can verify state transition validity
- They cannot see the hidden value behind the handle

---

## Phase 5: Second Chunk Execution

### Step 7: Another `computeChunk(jobId)`

Now `nextChunkIndex = 1` and `processedWeights = 2`, so only the last SNP is processed:

- SNP handle corresponds to encrypted `2`
- Weight is plaintext `5`
- Product becomes encrypted `10`
- Added to prior encrypted partial sum

Conceptual plaintext math:

- Prior sum: `3`
- New term: `10`
- Total: `13`

Real runtime outcome:

- New ciphertext stored in coprocessor
- Contract receives a new handle (for example `h_final_score`)
- Job is marked complete

Again:

- Contract sees handles
- Coprocessor sees ciphertext objects
- No network observer sees plaintext `13`

---

## Phase 6: Granting Decryption Rights

### Step 8: Alice calls `finalize(jobId)`

The flow has `finalize(jobId)` triggering:

```text
FHE.allow(partialSum, client_address)
```

This is authorization, not decryption.

Before `finalize`:

- Ciphertext exists
- Alice is not yet formally authorized for gateway release

After `finalize`:

- ACL authorizes Alice to request decryption/re-encryption for that handle

Critical distinction:

- `allow` does not mean "decrypt now"
- `allow` means "Alice is permitted when she later uses the gateway path"

This is policy declaration versus output delivery.

---

## Phase 7: Sending Score into the Oracle

### Step 9: Alice calls `ResultOracle.classify`

Client passes:

- Encrypted score handle
- Encrypted noise
- Low threshold
- High threshold

The oracle returns an encrypted category handle, then calls:

```text
FHE.makePubliclyDecryptable(category)
```

Suppose:

- Encrypted score = handle to `Enc(13)`
- Encrypted noise = handle to `Enc(1)`
- Thresholds = `5` and `12`

Oracle computes:

- Encrypted add: `13 + 1 = 14`
- Encrypted compare with `5`
- Encrypted compare with `12`
- Encrypted selects to produce category `2` (High)

Runtime components involved:

- Contract orchestrates logic
- Precompiles delegate encrypted operations
- Coprocessor computes over ciphertexts
- Contract receives category handle

Still no plaintext appears on-chain.

---

## Phase 8: `allow` vs `makePubliclyDecryptable`

This is one of the most important distinctions in the guide.

- `FHE.allow(h, address)` grants one specific address decryption rights
- `FHE.makePubliclyDecryptable(h)` allows anyone to trigger decryption through the gateway

Example 1: Raw score handle

- Use `allow(scoreHandle, Alice)`
- Reason: raw score is sensitive and should remain Alice-only

Example 2: Final category handle

- Use `makePubliclyDecryptable(categoryHandle)`
- Reason: category is the intended released output and is coarser than the raw score

The guide also notes that in `ResultOracle`, the category is made publicly decryptable while the noisy score is not.

---

## Phase 9: Gateway Request

### Step 10: Alice asks for the result

Alice's client sends a signed request to the gateway, effectively saying:

- I am Alice
- I want the result for handle `h_category`
- Here is my fresh ephemeral public key for this session

Gateway behavior:

- Verifies request signature
- Verifies ACL/public-decryptability status
- KMS re-encrypts for Alice's ephemeral public key

Why the ephemeral key matters:

- KMS does not need to send plaintext
- It transforms ciphertext so only Alice's fresh key can open it
- Plaintext does not traverse the network from KMS to Alice
- Alice decrypts locally

---

## Phase 10: KMS Re-Encryption

### Step 11: KMS performs re-encryption

Re-encryption converts ciphertext under the network key into ciphertext under Alice's ephemeral public key, without revealing plaintext.

So the KMS does not need to send raw plaintext in the gateway response.

It can return:

- Ciphertext-for-Alice-session

Then Alice decrypts locally.

This is cleaner and safer than "KMS decrypts and sends plaintext over the wire."

---

## Phase 11: Local Client Decryption

### Step 12: Alice decrypts locally

Alice's app decrypts the re-encrypted response using the ephemeral private key and gets:

- `2`

UI interpretation:

- `2 = High risk`

At the end of the process:

Alice saw:

- Her input SNPs
- Final category

Contract saw:

- Handles, job state, thresholds, permissions

Coprocessor saw:

- Ciphertext objects and encrypted operations

KMS saw:

- An authorized request and performed re-encryption

Validators saw:

- Valid state transitions and handle updates

Nobody except Alice saw the plaintext result.

That is the full privacy story.
