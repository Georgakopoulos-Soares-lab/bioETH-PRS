# V1 SNP Ingestion Design

## Purpose

This document explains how `PRSComputeEngine` handles PRS jobs in the current `v1` design.

It focuses on:

- why the old one-shot `startPRS(...)` shape was replaced
- how job creation and SNP upload now work
- how SNP chunks line up with model chunks
- what permissions and invariants exist in the new flow

## Problem statement

After chunked model publication was introduced, the next practical scaling bottleneck became SNP submission.

The old flow created a job and stored the full encrypted SNP vector in one call:

```text
startPRS(modelId, encryptedSnps)
```

That shape had two problems:

- it reintroduced a large single-transaction payload
- it made the compute engine less symmetric with the chunked model lifecycle

So `v1` replaces that with a staged job-upload flow.

## High-level job lifecycle

The PRS job lifecycle is now:

1. `createPRSJob(modelId, sampleId)`
2. `appendSnpChunk(jobId, encryptedSnpsChunk)`
3. `finalizeSnpUpload(jobId)`
4. `computeChunk(jobId)` repeated until complete
5. `finalize(jobId)`

This mirrors the model flow:

```text
create shell
append chunks
finalize
use
```

## Data model

The engine stores a small `Job` header plus chunk-addressed SNP payloads.

Conceptually:

```text
jobId -> job header
jobId + chunkIndex -> SNP chunk
```

The `Job` header tracks:

- `modelId`
- `weightCount`
- `chunkSize`
- `chunkCount`
- `uploadedSnpCount`
- `nextChunkIndex`
- `processedWeights`
- `partialSum`
- `requester`
- `isPrivate`
- `snpsFinalized`
- `complete`

The SNP values themselves are stored by:

```text
snpChunks[jobId][chunkIndex]
```

## Why chunk size is aligned to the model

In `v1`, the model's chunk geometry is the source of truth.

That means:

- the requester does not choose an independent SNP chunk size
- job upload follows the model's `chunkSize`
- compute processes chunk `k` of the model against chunk `k` of the SNPs

Example:

- model `chunkSize = 256`
- `weightCount = 5001`
- `chunkCount = 20`

Then:

- SNP chunk `0` must contain indices `[0..255]`
- SNP chunk `1` must contain indices `[256..511]`
- ...
- SNP chunk `19` contains the final remainder

This keeps the indexing model simple and deterministic.

## Why `v1` does not use a separate SNP chunk size

That would add flexibility, but it would also add more moving parts:

- two chunk geometries
- alignment rules between them
- more complex compute indexing
- more edge cases to test

For `v1`, the simpler choice is better:

- one chunk geometry
- one chunk count
- one set of boundaries

## Chunk-size constraints in practice

Two independent hardware/protocol limits bound what `chunkSize` can safely be.
Understanding both is essential before publishing a model.

### Limit 1 — Input-proof budget (upload): 32 values

Every `appendSnpChunk` call packages the encrypted SNP values into a single
`fhevmjs` input proof.  That proof has a **2048-bit budget**.  Each `euint64`
value occupies 64 bits, so a single call can carry at most:

```
2048 / 64 = 32 encrypted SNP values
```

Chunks larger than 32 values will be rejected by the fhEVM input-proof
validation layer before the transaction even reaches contract storage.

### Limit 2 — HCU budget (compute): 10 values

Each SNP processed in `computeChunk` requires **3 FHE operations**:

1. `FHE.asEuint64(weight)` — trivially encrypt the public weight
2. `FHE.mul(snp, encWeight)` — ciphertext multiplication
3. `FHE.add(partialSum, product)` — accumulate into the running sum

The mock coprocessor enforces a per-transaction Homomorphic Compute Unit (HCU)
budget of approximately **30 operations**.  At 3 ops per SNP that gives:

```
30 HCU / 3 ops per SNP = 10 SNPs per computeChunk call
```

Exceeding this triggers `HCUTransactionLimitExceeded()` at the first
`computeChunk` call.  This was confirmed empirically: `chunkSize = 32` triggers
the error immediately (32 × 3 = 96 ops > 30 HCU budget).

### The binding constraint is compute, not upload

| Phase | Limit | Source |
|---|---|---|
| `appendSnpChunk` | 32 values | 2048-bit input-proof budget |
| `computeChunk` | 10 values | ~30 HCU per transaction |

Upload could handle 32 values per call, but compute can only process 10.
**`v1` therefore uses `chunkSize = 10` for both** to keep the chunk geometry
uniform and avoid the model having a different granularity for upload vs compute.

### Real fhEVM (Sepolia) HCU ceiling is unknown

The mock coprocessor's ~30 HCU/tx limit is a local development constraint.
The Sepolia coprocessor may allow a significantly larger HCU budget.  If it
supports 300 HCU/tx, `chunkSize` becomes 100, reducing the 5000-SNP transaction
count from ~1005 to ~155.  This is the most impactful unknown for production
feasibility and will only be measurable after a Sepolia deployment.

### Practical guidance

When publishing a model today:

- set `chunkSize = 10` for local mock-mode development and testing
- do not set `chunkSize > 10` — `computeChunk` will revert
- do not set `chunkSize > 32` — `appendSnpChunk` will reject the input proof
- re-profile after any Sepolia deployment to determine the real HCU ceiling

## Detailed flow

### `createPRSJob(modelId, sampleId)`

This creates a job shell.

It:

- checks that `msg.sender` is the owner or a granted delegate of `sampleId` in `GenomicRegistry` (reverts with `"No registry access"` or `"Invalid sample"` otherwise)
- reads the finalized model config from `ModelMarketplace`
- checks that the model is finalized
- checks private-model engine authorization if needed
- stores the job metadata (including `sampleId`)
- sets `uploadedSnpCount = 0`
- sets `nextChunkIndex = 0`
- sets `partialSum = Enc(0)`

At this point, the job exists but cannot compute yet.

### `appendSnpChunk(jobId, encryptedSnpsChunk)`

This stores exactly one sequential SNP chunk.

The engine derives:

- which chunk index is expected next
- how long that chunk must be

So the caller cannot upload out of order.

The function rejects:

- non-requester uploads
- wrong-length chunks
- extra chunks after the declared length is reached
- uploads after SNP finalization

### `finalizeSnpUpload(jobId)`

This marks the SNP payload as complete and frozen.

It requires:

- requester ownership
- all SNPs uploaded
- job still in upload phase

After this point:

- no more SNP chunks may be appended
- compute becomes allowed

### `computeChunk(jobId)`

This processes exactly one aligned chunk.

For chunk `k`, the engine:

1. checks that SNP upload is finalized
2. loads SNP chunk `k`
3. loads model chunk `k`
4. multiplies them element-wise
5. adds the contributions into `partialSum`
6. advances `nextChunkIndex`
7. marks the job complete after the final chunk

Public models use:

- `FHE.mul(snp, FHE.asEuint64(weight))` (trivially-encrypted C×P)

Private models use:

- `FHE.mul(encryptedWeight, snp)` (C×C)

### `finalize(jobId)`

This remains the encrypted-result handoff step.

It requires:

- job complete
- requester ownership

It grants the requester access to the encrypted score handle and returns it.

## Example

Suppose:

- weights = `[4, 3, 5, 2, 1, 6]`
- SNPs = `[0, 1, 2, 1, 0, 2]`
- `chunkSize = 2`

Model chunks:

- chunk 0 = `[4, 3]`
- chunk 1 = `[5, 2]`
- chunk 2 = `[1, 6]`

SNP chunks:

- chunk 0 = `[0, 1]`
- chunk 1 = `[2, 1]`
- chunk 2 = `[0, 2]`

Computation:

- chunk 0 contribution = `0*4 + 1*3 = 3`
- chunk 1 contribution = `2*5 + 1*2 = 12`
- chunk 2 contribution = `0*1 + 2*6 = 12`

Final score:

```text
3 + 12 + 12 = 27
```

## Security controls in `v1`

### Requester-controlled upload

Only the job requester may:

- append SNP chunks
- finalize SNP upload
- read the partial score
- finalize the final score

### Finalize-before-compute

`computeChunk(jobId)` requires `snpsFinalized == true`.

So relayers cannot begin compute while the SNP payload is still mutable.

### Sequential chunk discipline

The engine derives:

- next chunk index
- exact required chunk length

That prevents:

- sparse uploads
- out-of-order uploads
- accidental gaps
- appending beyond the declared model length

### Permissionless relays remain allowed

Anyone may still call `computeChunk(jobId)`.

That is intentional in `v1`.

The requester controls:

- the SNP payload
- when the job becomes ready
- access to the encrypted result

Relayers only help pay for chunk execution.

## Why `v1` is still sequential, not map-reduce

We intentionally keep one running `partialSum` in `v1`.

We do **not** store one encrypted partial per chunk and reduce them later.

Why:

- simpler state machine
- fewer storage writes
- easier invariants
- easier tests
- cleaner first paper implementation

Map-reduce style partials may still be worth exploring later, but they are a `v2` complexity.

## Known limitations

This design solves the large one-shot SNP submission problem, but it does not solve everything.

Open issues include:

- job cancellation / cleanup is not implemented
- no expiry semantics exist for incomplete jobs
- private-model behavior is still being reasoned about under mock-mode assumptions before real fhEVM validation

## Relationship to the other `v1` docs

- [`overview.md`](overview.md): complete `v1` system target
- [`model-marketplace.md`](model-marketplace.md): model publication lifecycle and provenance
- [`quantization.md`](quantization.md): integer encoding assumptions feeding into both model and SNP processing
