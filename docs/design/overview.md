# V1 System Design Overview

## Purpose

This folder describes the current target architecture for the repo's `v1` system design.

`v1` is the first coherent design target we can implement, test locally, and use as the basis for feasibility work and paper writing.

The `v1` design is split into focused documents:

- [`model-marketplace.md`](model-marketplace.md)
- [`snp-ingestion.md`](snp-ingestion.md)
- [`quantization.md`](quantization.md)

## What `v1` means in this repo

In this repo, `v1` means:

- public and private models are both supported
- models are published in chunks, not one giant transaction
- PRS jobs are also staged in chunks, not one giant SNP submission
- compute is chunk-addressed and aligned to the model geometry
- everything still runs against the local mock fhEVM stack for development

It does **not** mean the system is already fully production-ready.

It is the current target architecture for:

- local correctness testing
- scaling experiments
- HEPRS-backed feasibility work
- design discussion with collaborators

## Canonical `v1` flow

The full `v1` flow is now:

1. Publisher creates a model shell in `ModelMarketplace`.
2. Publisher appends model weight chunks.
3. Publisher finalizes the model.
4. Requester creates a PRS job shell in `PRSComputeEngine`.
5. Requester appends SNP chunks to that job.
6. Requester finalizes SNP upload.
7. Anyone may relay `computeChunk(jobId)` until the job is complete.
8. Requester reads the partial or final encrypted score.
9. `ResultOracle` can classify the encrypted result into a category.

In shorthand:

```text
createModelShell
appendModelChunks*
finalizeModel

createPRSJob
appendSnpChunks*
finalizeSnpUpload
computeChunk*
finalize
```

## Why this design was chosen

This `v1` shape was chosen because it gives the cleanest next step from the original prototype:

- it removes the one-shot model upload bottleneck
- it removes the one-shot SNP upload bottleneck
- it keeps the state machines explicit and testable
- it stays grounded in this repo's current contracts and mock-mode workflow

It also aligns with common large-artifact engineering patterns:

- create metadata / index first
- upload payload in bounded chunks
- freeze the artifact before use

## Core design decisions

### 1. Model chunk size is canonical

The model carries two independent chunk-size parameters:

- `uploadChunkSize` — how many values per upload call (capped at 32 by the
  fhEVM input-proof budget for encrypted SNPs)
- `computeChunkSize` — how many SNP×weight pairs per `computeChunk` call
  (bounded by the HCU budget)

**Recommended values: `uploadChunkSize=32`, `computeChunkSize=20` (mock).**
SNPs are stored flat and sliced by `computeChunkSize` during compute, so the
two parameters are fully independent.  Setting `uploadChunkSize=32` cuts SNP
upload transactions by ~3× versus the old coupled default of 10.

The Sepolia `computeChunkSize` ceiling is unknown — run `npm run probe:hcu`
after a Sepolia deployment to measure it.

See [`snp-ingestion.md § Chunk-size constraints in practice`](snp-ingestion.md)
for the full breakdown.

### 2. Uploads are sequential

Both model publication and SNP upload are sequential in `v1`.

This keeps the state machine simple:

- no sparse chunk sets
- no out-of-order repair logic
- no overwrite path
- easier invariants and tests

### 3. Finalization gates use

Artifacts are not usable until they are finalized.

For models:

- no compute against mutable draft models

For SNP jobs:

- no compute until the requester has fully uploaded and finalized the SNP payload

### 4. Compute remains permissionless

`computeChunk(jobId)` remains open to relayers in `v1`.

That means:

- the requester controls upload and output access
- anyone may pay gas to progress compute

This is a deliberate tradeoff, not an accident.

## What is covered where

Use the more specific docs for details:

- [`model-marketplace.md`](model-marketplace.md): model headers, chunk publication, provenance, publication permissions
- [`snp-ingestion.md`](snp-ingestion.md): PRS job shells, SNP chunk upload, ready state, compute alignment, job permissions
- [`quantization.md`](quantization.md): integer encoding strategy, signed-weight handling, overflow bounds, manifest expectations

## What is still outside `v1`

Important unresolved items remain outside this target:

- `GenomicRegistry` ACL is not yet enforced inside job creation
- DP noise is still caller-supplied in `ResultOracle`
- no pricing / fee layer exists
- no model deprecation / versioning semantics exist yet
- mock-mode behavior still needs real fhEVM / Sepolia validation

The V1 quantization math (`weightZeroPoint`, `genoSum` accumulation, `scoreOffset`) is now implemented — see [`quantization.md`](quantization.md).

For the broader roadmap and risk register, see [`../../architecture-roadmap.md`](../../architecture-roadmap.md).
