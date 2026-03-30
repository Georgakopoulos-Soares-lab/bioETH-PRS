# TODO

## Current Snapshot

The repo is no longer at the "what should v1 be?" stage.

The current implemented state is:

- `ModelMarketplace v1` is implemented with:
  - model shell creation
  - sequential public/private chunk append
  - model finalization / freeze
  - chunk-addressed reads instead of whole-array reads
- `PRSComputeEngine` now:
  - creates PRS job shells from finalized model metadata
  - ingests SNPs in aligned chunks
  - finalizes SNP upload before compute begins
  - processes one published model chunk per `computeChunk`
  - supports both public `mulPlain` and private encrypted-chunk reads
- Dedicated marketplace unit coverage exists in `test/model_marketplace_chunked_test.ts`.
- HEPRS-backed integration tests use fixed advisor recommendations instead of recomputing them every run.
- Documentation has been reorganized into:
  - `docs/onboarding/`
  - `docs/design/`
  - `docs/reference/`
- Current local status:
  - tests have not yet been rerun after the current chunked SNP-ingestion refactor
  - the old `5000`-SNP model-publication bottleneck is removed in design and code
  - chunked SNP ingestion is now implemented in design and code

## Recently Completed

### Marketplace and compute refactor

- Replace one-shot model upload with chunked publication lifecycle:
  - `createModelShell(...)`
  - `appendPublicModelChunk(...)`
  - `appendEncryptedModelChunk(...)`
  - `finalizeModel(...)`
- Replace whole-model compute reads with chunk-oriented retrieval.
- Add owner-only publication controls and private-reader allowlist behavior.
- Align compute chunking to the model's published chunk size.
- Replace monolithic PRS job creation with staged SNP ingestion:
  - `createPRSJob(...)`
  - `appendSnpChunk(...)`
  - `finalizeSnpUpload(...)`
- Add dedicated engine unit coverage for the new PRS job upload lifecycle.

### Testing

- Add dedicated `ModelMarketplace` unit tests covering:
  - shell creation
  - chunk geometry
  - append rules
  - finalize rules
  - reader permissions
  - edge cases and invalid reads
- Update integration coverage for:
  - marketplace + engine + oracle flow
  - HEPRS-backed fixtures
- Lock HEPRS test scaling to the fixed recommendation map in `test/utils/heprs.ts`.

### Documentation cleanup

- Restructure the design docs around a single `v1` system target:
  - `docs/design/v1/overview.md`
  - `docs/design/v1/model-marketplace.md`
  - `docs/design/v1/snp-ingestion.md`
  - `docs/design/v1/quantization.md`
- Reorganize docs into onboarding / design / reference folders.
- Add `docs/README.md` as the documentation entrypoint.
- Convert top-level `ONBOARDING.md` into a lightweight pointer to the onboarding folder.

## Active Priorities

### 1. Wire registry ACL into job creation

The compute engine still accepts arbitrary encrypted SNP chunks from the requester.

- Decide whether the PRS job flow should:
  - accept raw encrypted SNP chunks
  - accept a `sampleId`
  - accept both paths with different trust assumptions
- Enforce `GenomicRegistry` access checks in the compute path if sample-linked execution is the intended default.
- Add tests for:
  - owner access
  - delegated access
  - unauthorized access rejection

### 2. Test and benchmark the chunked SNP-ingestion path

- Run the dedicated engine unit tests and updated integration tests.
- Verify the HEPRS `5000` fixture end-to-end under the staged SNP upload flow.
- Rerun profiling so the docs and reports reflect:
  - model publication
  - PRS job creation
  - SNP upload
  - SNP upload finalization
  - chunked compute

### 3. Decide and document the `computeChunk` permission model

Current behavior is permissionless relaying.

- Decide whether this remains the intended design.
- If yes:
  - document the relay model clearly in the design docs
  - reason about griefing / wasted-gas scenarios
- If no:
  - restrict execution to requester or approved operators
  - update tests and docs accordingly

### 4. Harden the output and DP story

The current oracle still trusts caller-supplied noise.

- Decide the near-term DP posture:
  - caller-supplied noise with guardrails
  - commitment-based enforcement
  - on-chain/generated noise later
- Decide the user-facing output policy:
  - encrypted raw score available only to requester
  - risk category as the main public-facing output
- Remove or mitigate the zero-noise loophole before making strong model-extraction claims.

### 5. Validate the real fhEVM / Sepolia path

Local mock correctness is no longer the main unknown.

- Run the end-to-end flow on Sepolia with real fhEVM packages.
- Validate:
  - ciphertext input flow
  - ACL behavior
  - gateway / re-encryption / decryption flow
  - chunk-size limits under real fhEVM costs
- Record the main mock-vs-real differences in the docs.

## Secondary Engineering Work

### Marketplace improvements

- Add model versioning / deprecation semantics.
- Decide whether pricing / fee mechanics are in scope.
- Decide whether public-model storage should remain fully on-chain in later versions or move toward commitment-based storage.

### Job lifecycle improvements

- Add job cancellation / cleanup for incomplete jobs.
- Consider a `JobFinalized` event for off-chain indexing.
- Decide whether stale job state needs expiry semantics.

### Quantization and type strategy

- Keep using the advisor + HEPRS fixtures as the main correctness reference.
- Expand measured evidence for:
  - scale choice
  - encoded threshold quality
  - overflow headroom
- Revisit whether `euint64` everywhere is too conservative once real measurements exist.
- Evaluate later optimizations:
  - narrower intermediates
  - widening accumulators
  - SIMD / slot-packing

## Research / Paper Work

### Feasibility evidence

- Produce a clean benchmark story for:
  - model publication
  - SNP ingestion
  - chunked compute
  - finalize / output path
- Compare:
  - small fixture behavior
  - HEPRS-backed fixture behavior
  - mock vs real fhEVM behavior

### Scientific validation

- Compare de-quantized on-chain outputs against reference PRS tooling such as PLINK / PRSice.
- Quantify:
  - MSE
  - rank correlation
  - AUC or equivalent clinical utility measures

### Security analysis

- Formalize the threat model for:
  - model extraction
  - repeated query attacks
  - noisy categorical release
  - sample access abuse
- Be explicit about which protections are implemented, mocked, assumed, or future work.

## Items No Longer Open In The Same Way

These were previously major open design questions, but the repo now has an implemented answer for `v1`:

- `v1` supports both public and private model publication paths.
- The marketplace now uses chunked on-chain storage instead of one-shot upload.
- Compute no longer uses whole-model reads.
- The current collaborator-facing design doc is the implemented marketplace design, not just a brainstorm.
- The main bottleneck is no longer model publication for the HEPRS `5000` fixture; it is SNP ingestion.

## Keep This File Useful

When updating this file:

- move completed items into `Recently Completed`
- remove questions that already have an implemented answer
- keep `Active Priorities` short and execution-oriented
- keep paper/research work separate from core engineering work
