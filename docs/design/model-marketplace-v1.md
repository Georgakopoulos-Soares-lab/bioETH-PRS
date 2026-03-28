# Model Marketplace V1

## Purpose

This document explains the full `ModelMarketplace v1` design in `bioETH PRS`.

It is meant to help a collaborator understand:

* what changed from the old marketplace
* how model publication now works
* what each metadata field means
* how chunking fits into the broader design
* what the security and provenance story is
* what `v1` solves and what it does not solve yet

This document is intentionally broader than "chunking only." Chunking is one part of the design, but `v1` is really a marketplace and compute refactor.

---

## Problem statement

The old model flow was:

* upload the full model in one transaction
* read the full model back out during compute

That shape already hits a practical boundary in this repo on the copied HEPRS `5000`-SNP fixture. So `v1` changes the model lifecycle from "whole array now" to "metadata first, payload in chunks, then freeze."

The key change is not just chunking for its own sake. The key change is that the model becomes a structured artifact with:

* explicit metadata
* explicit ownership
* explicit publication progress
* explicit finalization
* chunk-addressed payload access

---

## High-level design

In `v1`, a model has two layers:

* a header
* a payload

The header is small and fixed-shape.
The payload is the set of weight chunks.

Conceptually:

```text
modelId -> header
modelId + chunkIndex -> payload chunk
```

So instead of one giant object:

```text
model = [w0, w1, w2, ... wN]
```

we now have:

```text
model header
chunk 0
chunk 1
chunk 2
...
chunk K
```

This is what people often mean informally by "shell first, fill in later." "Shell" is not a formal Solidity term or an Ethereum standard. It is just engineering shorthand for "create the metadata record first, then attach the large payload over time."

---

## Why this design was chosen

This version was chosen because it gives us the strongest immediate improvement without introducing too many new moving parts at once.

It keeps:

* on-chain model storage
* the current public/private split
* the current mock-fhEVM testing approach
* the current chunked PRS execution idea

It removes:

* one-shot model publication
* whole-array model reads inside compute

That makes it a strong paper-stage systems refactor:

* the change is meaningful
* the mechanism is easy to explain
* the evaluation can stay focused
* we can test it entirely in the current repo

---

## Header fields

The `ModelHeader` in `v1` contains:

* `owner`
* `isPrivate`
* `finalized`
* `weightCount`
* `chunkSize`
* `chunkCount`
* `uploadedWeightCount`
* `manifestURI`
* `manifestHash`
* `sourceModelHash`

### `owner`

The Ethereum address that controls publication.

The owner may:

* append chunks
* finalize the model
* grant readers for private models

This is the primary upload permission boundary in `v1`.

### `isPrivate`

This selects which payload type and arithmetic path the model uses.

If `false`:

* the payload chunks are `uint64[]`
* compute uses plaintext-times-ciphertext `mulPlain`

If `true`:

* the payload chunks are `euint64[]`
* compute uses encrypted-times-encrypted `mul`

### `finalized`

This tells us whether publication is complete and frozen.

Before finalization:

* the model is still a draft
* chunks may still be appended
* compute jobs should not use the model

After finalization:

* no more chunks may be appended
* the model becomes immutable for `v1`
* compute jobs may use the model

### `weightCount`

The total number of weights the model claims to contain.

This lets the contract know:

* how many weights should eventually be uploaded
* how many SNP inputs a PRS job must provide

It is one of the basic integrity checks for the whole workflow.

### `chunkSize`

The canonical chunk geometry for the model.

This determines:

* how publication is split into multiple transactions
* how compute slices the model
* how compute aligns the SNP vector to model chunks

In `v1`, the model's `chunkSize` is authoritative. Jobs do not choose an independent compute chunk size.

### `chunkCount`

The total number of chunks implied by `weightCount` and `chunkSize`.

For example:

* `weightCount = 5001`
* `chunkSize = 256`
* `chunkCount = ceil(5001 / 256) = 20`

We store this so other parts of the system can reason about chunk progress without recomputing it repeatedly.

### `uploadedWeightCount`

This tracks publication progress while the model is still a draft.

If:

* `weightCount = 5001`
* `uploadedWeightCount = 4096`

then the model is not complete yet.

This is also how the contract derives the next expected chunk position in `v1`.

### `manifestURI`

This is a pointer to the off-chain metadata document for the model.

Examples:

* `ipfs://...`
* `ar://...`

The manifest can describe:

* trait / phenotype
* SNP ordering expectations
* quantization choices
* threshold encoding
* dataset provenance
* publication notes

This is the human-useful and tool-useful entry point for off-chain metadata.

### `manifestHash`

This is the cryptographic fingerprint of the manifest content.

The purpose is integrity:

1. fetch the manifest from `manifestURI`
2. hash the exact bytes
3. compare that hash to `manifestHash`

If they match, you know the manifest you fetched is the exact one that was anchored on-chain.

### `sourceModelHash`

This is the cryptographic fingerprint of the upstream source model artifact that the on-chain weights came from.

Examples:

* the original beta file
* the original PRS weight table
* a canonical export from a research pipeline

This is different from `manifestHash`.

* `manifestHash` anchors the explanatory metadata
* `sourceModelHash` anchors the scientific source artifact itself

Together they give us provenance rather than just storage.

---

## Are `manifestURI`, `manifestHash`, and `sourceModelHash` standard?

The exact field names are not a universal blockchain standard.

So the honest answer is:

* the names are project-specific
* the pattern is standard-ish and good practice

What is standard in spirit:

* storing a pointer to off-chain content
* storing a content hash for integrity
* storing provenance metadata for reproducibility

You see versions of this pattern across:

* NFT metadata systems
* scientific data pipelines
* ML model registries
* data lake / artifact registry systems
* blockchain apps that anchor large off-chain artifacts on-chain

So I would call this:

* not a required standard
* not an ERC-style canonical schema
* but very much aligned with good provenance and reproducibility practice

For this repo, I think all three are worth keeping.

If we wanted to simplify later, the only one I would consider optional is `manifestURI`. The two hash fields are the stronger integrity anchors.

---

## Publication lifecycle

The `v1` publication lifecycle has three phases:

1. create model
2. append chunks
3. finalize model

### Phase 1: create the model

The publisher creates the model header first.

At this point:

* the model exists
* the owner is known
* the publication rules are known
* the payload is still incomplete

This is what we informally called the "model shell."

### Phase 2: append chunks

Chunks are appended sequentially.

For public models:

* `appendPublicModelChunk(modelId, weightsChunk)`

For private models:

* `appendEncryptedModelChunk(modelId, encryptedWeightsChunk)`

In `v1`, upload is intentionally strict:

* only the owner may append
* the contract decides the next chunk index
* no overwrite path exists
* the chunk length must match exactly
* the final chunk may be shorter only by the exact remaining amount

This is simpler and safer than allowing arbitrary chunk positions in the first version.

### Phase 3: finalize

Once all expected weights are uploaded, the owner calls:

* `finalizeModel(modelId)`

The contract checks that:

* the model exists
* the caller is the owner
* the model is not already finalized
* `uploadedWeightCount == weightCount`

After finalization:

* appends are blocked
* the model becomes usable by compute
* the artifact becomes stable for benchmarking and paper discussion

---

## Chunking model

Chunking is only one part of `v1`, but it is still central.

Suppose:

* `weightCount = 5001`
* `chunkSize = 256`

Then:

* `chunkCount = 20`
* chunks `0..18` contain `256` weights each
* chunk `19` contains `137` weights

This gives us bounded publication transactions and bounded retrieval work.

The key point is that chunking is no longer just a compute convenience. It is now part of how the model itself is represented.

---

## Compute alignment

The compute engine uses the model's chunk geometry as the source of truth.

That means:

* the model decides chunk boundaries
* the job follows those chunk boundaries
* the matching SNP slice is determined by the same indices

If chunk `7` corresponds to weights `[1792..2047]`, then the compute engine multiplies those weights against SNPs `[1792..2047]`.

This is why `startPRS()` in `v1` no longer takes an independent `chunkSize`.

That keeps the system internally consistent and makes correctness easier to reason about.

---

## Relationship to SNP ingestion

`v1` chunks model publication, but it does not yet chunk SNP submission.

`startPRS()` still receives the full SNP vector in one call.

So `v1` should be understood as:

* fixing the first proven bottleneck
* not claiming to fix every future scaling boundary

After this refactor, SNP ingestion may become the next practical ceiling, especially on real fhEVM infrastructure.

That is acceptable for `v1` because the system is being improved one bottleneck at a time.

---

## Compute strategy in V1

The compute job uses:

* one `partialSum`
* one `nextChunkIndex`
* one monotonic progression through the model

Each `computeChunk(jobId)` call:

1. fetches the next model chunk
2. reads the matching SNP slice by index
3. computes that chunk's multiply-add work
4. adds into `partialSum`
5. increments `nextChunkIndex`

This is a sequential accumulator design.

We intentionally did not choose a chunk-parallel map-reduce design for `v1` because that would add:

* per-chunk partial storage
* duplicate-work prevention
* a reduction phase
* more complex testing and edge cases

For the first serious implementation, the sequential path is the better tradeoff.

---

## Security model

### Owner-controlled publication

Only the owner may:

* append chunks
* finalize the model
* manage private readers

This is the main publication permission boundary.

### Freeze before use

The model must be finalized before compute may use it.

This prevents jobs from depending on a half-uploaded or still-mutating model.

### Sequential append discipline

Because chunks are appended only in order:

* callers cannot skip ahead
* callers cannot overwrite an earlier chunk
* the contract derives the next chunk position itself

This removes a large class of state-management bugs from `v1`.

### Private chunk readers

Private chunk access is protected by a simple allowlist:

* the owner can always read
* the owner may authorize specific readers such as a compute engine

This is not the final privacy model for all future versions, but it is the right shape for the current mock repo.

### Permissionless compute

`computeChunk(jobId)` remains permissionless in `v1`.

That is acceptable because:

* the caller pays the gas
* the caller learns no plaintext score
* the job state remains deterministic

But output access is still requester-gated:

* `readPartial(jobId)` is requester-only
* `finalize(jobId)` is requester-only

### Provenance and auditability

The provenance fields and event stream are also part of the security story, even though they are not access-control checks.

The header stores:

* `manifestURI`
* `manifestHash`
* `sourceModelHash`

Together these make the model more auditable and more reproducible.

They answer different questions:

* `manifestURI`: where to fetch the model metadata
* `manifestHash`: whether the fetched metadata matches the version anchored on-chain
* `sourceModelHash`: what upstream source artifact the on-chain model was derived from

In addition, the events emitted during:

* shell creation
* chunk append
* finalization
* private reader permission changes

create an observable publication trail.

This is useful for:

* collaborator trust
* benchmarking provenance
* paper-writing and reproducibility
* future indexers or dashboards

---

## Security controls matrix

The table below summarizes the main `v1` controls.

| Control | Where it is enforced | What it mitigates | What it does **not** solve |
|---|---|---|---|
| Owner-only chunk append | `appendPublicModelChunk`, `appendEncryptedModelChunk` | Unauthorized modification of draft models | It does not judge whether the model is scientifically valid |
| Owner-only finalize | `finalizeModel` | Third-party freezing or tampering with publication state | It does not add curation or governance |
| Finalize-before-use | `startPRS` requires finalized model | Jobs running against incomplete or mutable models | It does not solve SNP access-control |
| Sequential append only | Contract derives next chunk index and expected length | Skipped chunks, out-of-order writes, malformed progress | It is less flexible than arbitrary chunk scheduling |
| No overwrite of stored chunk | Chunk storage must be empty before write | Silent replacement of earlier payloads | It does not verify chunk semantics beyond shape |
| Public/private path separation | Public and private append/getter checks | Type confusion between plaintext and encrypted model paths | It does not make public models confidential |
| Private reader allowlist | `setPrivateModelReader`, `getEncryptedWeightChunk` | Arbitrary reading of private model chunks | It is a simple allowlist, not the final real-fhEVM privacy story |
| Engine authorization for private compute | `startPRS` checks engine authorization | Late failure when a private model has not authorized the engine | It does not validate off-chain encrypted input provenance |
| Length validation at job start | `startPRS` compares SNP length to `weightCount` | Wasting compute on obviously invalid jobs | It does not solve large-SNP ingestion scaling |
| Requester-only partial/final output access | `readPartial`, `finalize` | Granting decrypt access to arbitrary observers | It does not stop anyone from paying gas to advance `computeChunk` |
| Event trail for publication lifecycle | model creation/append/finalize/reader-set events | Opaque state changes with poor observability | Events do not prove scientific correctness by themselves |
| Provenance hashes and metadata pointer | `manifestURI`, `manifestHash`, `sourceModelHash` | Unverifiable metadata drift and unclear model origin | The contract anchors these fields but does not prove they are truthful |

---

## Unresolved security limitations in V1

The `v1` controls are real and useful, but they are not the whole future security story.

The most important unresolved items are:

* `GenomicRegistry` is still not wired into `PRSComputeEngine.startPRS()`
  * so model execution still accepts arbitrary SNP vectors directly
* there is no anti-spam or fee mechanism for model publication
* there is no on-chain scientific validation of model quality
* public models are intentionally public
* private-model behavior in mock mode is structurally useful but not identical to real fhEVM encrypted-input semantics
* provenance hashes are anchored, but the contract does not verify that the publisher is honest about what they mean

For the broader repo-wide risk picture beyond `ModelMarketplace v1`, see also [docs/architecture-roadmap.md](/Users/galano/Developer/patternforge/utexas-lab/bioeth-prs-project/bioETH-PRS/docs/architecture-roadmap.md).

---

## Public vs private symmetry

The marketplace lifecycle is intentionally symmetric across public and private models.

Both use:

* header creation
* chunk append
* finalization
* chunk-oriented compute

The difference is only:

* payload type
* read permissions
* arithmetic path during compute

That symmetry is useful because collaborators can learn one model lifecycle while still preserving the important distinction between public and private weights.

---

## What V1 improves

`v1` immediately improves:

* publishability of larger models
* retrieval efficiency during compute
* artifact integrity through finalization
* provenance clarity through header metadata
* testability of the end-to-end flow

---

## What V1 does not solve yet

`v1` does not yet solve:

* the long-term economics of storing very large public models in ordinary contract storage
* chunked SNP submission
* a chunk-parallel map-reduce reduction pipeline
* final production fhEVM input-proof semantics for private model upload

Those are future steps, not reasons to avoid `v1`.

---

## Why this is a good paper-stage design

This design gives us a strong experimental story:

* chunked compute alone was not enough
* model publication and retrieval also needed redesign
* `ModelMarketplace v1` addresses that gap while preserving correctness and provenance

That is a meaningful result for this repo and a much better base for later benchmarking and writing.
* easier to audit
* easier to benchmark cleanly

It still supports permissionless relayers because anyone may call `computeChunk(jobId)`, but the job state itself remains linear and deterministic.

---

## Security model in V1

### Upload permissions

Only the model owner may:

* append chunks
* finalize the model
* grant or revoke private-model readers

This prevents arbitrary third parties from mutating draft models.

### Finalization

The model cannot be finalized until:

* all declared weights have been uploaded

After finalization:

* appends are blocked forever

This protects integrity and reproducibility.

### Sequential append rules

Because chunks are appended in order:

* no caller-chosen chunk index exists for upload
* no overwrite path exists
* the contract derives the next chunk position itself

This substantially reduces accidental or malicious chunk corruption risk.

### Private-model reader permissions

Private chunk reads are protected by a simple reader allowlist:

* the model owner can always read
* the owner may authorize specific readers, including a compute engine

This keeps the mock design compatible with the idea that private model chunks should not be freely retrievable through the contract interface.

### Compute permissions

`computeChunk(jobId)` remains permissionless in `v1`.

That is acceptable because:

* the caller learns no plaintext score
* the caller pays the gas
* the job state remains deterministic

However:

* `readPartial(jobId)` is requester-only
* `finalize(jobId)` is requester-only

That keeps encrypted outputs from being granted to arbitrary observers through the contract API.

---

## Public and private models in V1

The publication lifecycle is intentionally symmetric.

Both public and private models use:

* model shell
* chunk append
* finalize
* chunk-oriented compute

The only difference is the payload type and the arithmetic path:

* public chunk: `uint64[]`, used with `mulPlain`
* private chunk: `euint64[]`, used with encrypted `mul`

This symmetry is useful because it keeps the mental model shared across both modes while still respecting the cost and privacy differences between them.

---

## Main tradeoffs of V1

### What V1 improves immediately

* removes one-shot model publication
* removes whole-array model reads from compute
* gives us immutable finalized model artifacts
* gives us a cleaner benchmark story for larger fixtures

### What V1 still does not solve

* public models still consume ordinary on-chain storage
* very large public models may still become economically unattractive
* SNP submission is still monolithic
* true map-reduce parallel chunk execution is not implemented

That is why `v1` should be viewed as the first serious scaling refactor, not the final architecture.
