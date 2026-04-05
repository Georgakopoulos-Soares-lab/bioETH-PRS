# Colleague Briefing Pack

This document is a **speaker-oriented briefing pack** for explaining the whole
`bioETH PRS` repo to collaborators.

It is not a generic README.  It is designed to help you:

* explain the system clearly at different time horizons
* connect the contracts to the actual end-to-end workflow
* explain why the design looks the way it does
* answer common questions without overclaiming
* stay aligned with what is actually implemented in the repo today

For a single contract-grounded worked example, read
[`e2e-walkthrough-contract-grounded.md`](e2e-walkthrough-contract-grounded.md)
alongside this pack.

## How to use this pack

If you have:

* **30 seconds** — use the elevator pitch in §1
* **2 minutes** — use §1 + §2
* **5-10 minutes** — use §1 through §6
* **Q&A after the talk** — use §7 through §10

The order here is deliberate.  It is the order that usually makes the repo feel
coherent to new listeners.

## 1. The Short Version

### 15-second version

`bioETH PRS` is a prototype for computing polygenic risk scores on encrypted
genomic data using fhEVM, so the chain performs the PRS dot product without
seeing the raw DNA.

### 30-second version

The repo adapts the HEPRS paper's privacy-preserving PRS idea to Ethereum-style
smart contracts.  The main challenge is that PRS wants large signed
floating-point dot products, while fhEVM gives us encrypted unsigned integers and
gas-limited transactions.  So the design breaks the problem into four parts:
registry + ACL, chunked model publication, chunked SNP upload and compute, and a
result oracle that adds on-chain noise and returns a categorical risk label.

### 1-minute version

At a high level, a researcher publishes a quantized PRS model, a user registers a
sample reference, the user uploads encrypted SNP chunks into a PRS job, and the
engine computes the encrypted dot product chunk by chunk.  The tricky parts are:

* **chunking**, because one giant upload or compute transaction will not scale
* **permissions**, because we need to control who may start jobs, upload SNPs,
  read private models, and decrypt outputs
* **quantization**, because the source weights are signed floats but the
  contracts operate over unsigned encrypted integers

The repo's current `v1` is essentially the first coherent architecture that makes
those tradeoffs explicit and testable.

## 2. The Core Problem And Why The Repo Exists

The repo exists because PRS is naturally:

* a **large dot product**
* over **sensitive user genomic data**
* using **signed floating-point model weights**

That creates three constraints immediately:

1. We want privacy for the user's genome.
2. We may also want privacy for the model weights.
3. We cannot just upload and compute the whole thing in one transaction.

The project answer is:

* use fhEVM so the chain can operate on encrypted values
* publish models in bounded chunks
* upload SNPs in bounded chunks
* compute the PRS score chunk by chunk
* encode signed weights into an unsigned encrypted arithmetic domain

That is the design center of the whole repo.

## 3. The Mental Model Of The Architecture

The easiest way to explain the system is as four layers plus one client-side
bridge.

### Layer 1: `GenomicRegistry`

Purpose:

* stores sample URIs
* stores sample ownership
* stores per-sample ACL

What it does **not** do:

* store the genome itself
* verify that later SNP ciphertexts match the registered sample file

Best one-line explanation:

* "`GenomicRegistry` is the authorization layer for sample usage, not the
  sample-content verifier."

### Layer 2: `ModelMarketplace`

Purpose:

* stores PRS model metadata
* stores weights in chunks
* supports public weights or encrypted private weights

Best one-line explanation:

* "`ModelMarketplace` turns a GWAS model into an explicit, chunk-addressable
  on-chain artifact."

### Layer 3: `PRSComputeEngine`

Purpose:

* creates PRS job shells
* ingests SNP chunks
* computes the encrypted dot product chunk by chunk
* applies quantization correction at finalization

Best one-line explanation:

* "`PRSComputeEngine` is the state machine that turns a model plus encrypted
  SNP input into an encrypted PRS score."

### Layer 4: `ResultOracle`

Purpose:

* accepts an encrypted score input
* adds on-chain random noise
* compares against thresholds
* emits an encrypted Low / Medium / High category

Best one-line explanation:

* "`ResultOracle` turns the numeric encrypted PRS score into a privacy-aware
  categorical output."

### Client / Gateway / KMS bridge

Purpose:

* encrypt inputs using `fhevmjs`
* submit `externalEuint64[]` plus `inputProof`
* request authorized decryption / re-encryption on outputs

Best one-line explanation:

* "The client and gateway bridge the user's plaintext world to the fhEVM
  encrypted world."

## 4. The End-to-End Story You Should Tell

If you are walking colleagues through the repo, this is the cleanest storyline:

1. A researcher starts with a PRS model as signed floating-point weights.
2. The researcher quantizes those weights off-chain and computes
   `weightZeroPoint` and `scoreOffset`.
3. The researcher creates a model shell in `ModelMarketplace`, uploads weight
   chunks, and finalizes the model.
4. A user registers a sample URI in `GenomicRegistry` and gets a `sampleId`.
5. The user creates a PRS job in `PRSComputeEngine` using `modelId` and
   `sampleId`.
6. The user encrypts SNP chunks for the engine contract and uploads them using
   `appendSnpChunk(jobId, handles, inputProof)`.
7. The user finalizes SNP upload.
8. Anyone may relay `computeChunk(jobId)` until the job is complete.
9. The requester finalizes the job and gets permission on the encrypted score.
10. The requester obtains the score through the authorized decrypt /
    re-encrypt path and then submits a fresh encrypted score input to
    `ResultOracle`.
11. `ResultOracle` adds on-chain noise and returns an encrypted risk category.

If you want a worked numeric example for exactly this flow, use
[`e2e-walkthrough-contract-grounded.md`](e2e-walkthrough-contract-grounded.md).

## 5. The Three Design Decisions You Must Be Able To Explain

Most of the repo becomes easy to explain once you can clearly explain these
three points.

### A. Why chunking exists

What to say:

* PRS is a large dot product, so both model publication and SNP submission can
  exceed practical transaction size and gas limits.
* The repo therefore uses a staged state-machine design instead of one-shot
  uploads or one-shot compute.
* The compute engine keeps one encrypted running `partialSum` and advances the
  job one chunk at a time.

What is subtle but important:

* there are **two** chunk sizes, not one
* `uploadChunkSize` is about batching inputs during upload
* `computeChunkSize` is about limiting per-transaction encrypted work

Good phrasing:

* "Upload chunking solves transport limits; compute chunking solves encrypted
  execution limits."

### B. Why permissions exist at multiple levels

What to say:

* There is no single ACL in the system.
* Different permissions protect different assets and phases.

The permission layers are:

* `GenomicRegistry` — who may open a PRS job for a sample
* `ModelMarketplace` owner checks — who may append/finalize models
* private-model reader ACL — who may read encrypted model chunks
* `PRSComputeEngine` requester checks — who may upload SNPs, finalize SNP
  upload, read partials, and finalize the score
* fhEVM ACL — who may decrypt or re-encrypt an encrypted output handle

Good phrasing:

* "The repo separates *who may initiate a workflow* from *who may operate on a
  ciphertext* from *who may decrypt the result*."

### C. Why quantization is not optional

What to say:

* Real PRS models are signed floats.
* The contracts operate over unsigned encrypted integers.
* That mismatch has to be resolved explicitly.

The repo's `v1` answer is:

1. scale floats into signed integers
2. shift weights by `weightZeroPoint` so they become nonnegative
3. accumulate `genoSum` so the engine can subtract the shift back out later
4. add `scoreOffset` so the final score also lives in a nonnegative encoded
   domain

Good phrasing:

* "Quantization in this repo is not just rounding.  It is the encoding scheme
  that makes signed PRS semantics survive inside unsigned encrypted arithmetic."

## 6. What Is Actually Implemented Today

When presenting the repo, it helps to separate implemented features from future
research goals.

### Implemented

* registry ACL at job creation
* chunked model publication
* chunked SNP upload
* decoupled upload vs compute chunk sizes
* public and private model paths
* quantization metadata threading through model and engine
* `genoSum` accumulation and quantization correction in `finalize`
* requester-only output access in the engine
* on-chain bounded-noise generation in `ResultOracle`
* integration tests across registry, marketplace, engine, and oracle

### Not fully solved

* proving that uploaded SNP ciphertexts match the registered sample URI
* final client UX around gateway-assisted decrypt / re-encrypt flow
* calibrated DP analysis with formal privacy guarantees
* payment / fee / commercialization layer
* model lifecycle features like deprecation or versioning
* bit-width / gas optimization beyond the current `euint64` baseline

This section is important because it keeps you from accidentally mixing
"implemented architecture" with "research roadmap."

## 7. The Security Story You Should Tell

Explain the security story as a set of **positive guarantees** plus **explicit
non-guarantees**.

### Positive guarantees

The current repo guarantees:

* validators do not see plaintext SNP values during compute
* model publication is owner-controlled
* sample usage is ACL-gated at job creation
* SNP upload is requester-controlled
* compute starts only after SNP upload is finalized
* compute may be relayed by anyone without giving them result access
* the final engine score remains encrypted unless the requester is granted ACL
* the oracle category can be intentionally made public-decryptable

### Non-guarantees

The current repo does **not** guarantee:

* that the off-chain sample file and the on-chain uploaded SNP ciphertexts are
  the same data
* that a model publisher is scientifically honest
* that the current bounded-uniform oracle noise is a complete formal DP answer
* that the mock environment proves Sepolia gas / latency / KMS behavior

Good phrasing:

* "Our `v1` security story is real, but it is scoped.  It enforces encrypted
  compute and access control; it does not yet cryptographically bind every
  off-chain artifact to every on-chain encrypted input."

## 8. The Validation Story You Should Tell

You should be able to answer "How do we know this is real?" with something more
specific than "we have tests."

### The strongest validation points in the repo

* `test/model_marketplace_chunked_test.ts`
  * proves model shell creation, sequential chunk upload, finalization, and
    private-reader behavior
* `test/prs_compute_engine_chunked_snp_test.ts`
  * proves PRS job creation, requester-only SNP upload, finalize-before-compute,
    relayable compute, quantization correction path, and registry ACL
* `test/registry_marketplace_oracle_test.ts`
  * proves cross-contract flow from registry + marketplace + engine to oracle
* `test/heprs_fixture_test.ts`
  * proves the flow on copied HEPRS fixtures rather than only toy vectors
* `scripts/probe_hcu_ceiling.ts`
  * probes the safe compute chunk ceiling
* `scripts/heprs_fixture_profile.ts`
  * measures timing and gas phase by phase on real fixture data

### The short validation summary

Good phrasing:

* "The architecture is not just described in docs.  It is exercised in unit
  tests, integration tests, fixture-backed tests, and profiling harnesses."

### How to avoid overstating validation

Do **not** say:

* "mock mode proves real FHE performance"
* "the registry proves the SNP upload matches the genome file"
* "the oracle already gives a formal DP guarantee"

Say instead:

* "mock mode validates contract logic, fhEVM protocol wiring, ACL, and input
  proofs, but not real Sepolia latency or final privacy calibration."

## 9. The Questions Colleagues Are Likely To Ask

### "Why blockchain at all?"

Good answer:

* The point is not "put genomics on-chain" in a naive sense.
* The point is to replace a trusted evaluator with an immutable public
  evaluator, while still preserving genomic privacy with FHE.

### "Why not use SGX / a TEE?"

Good answer:

* TEEs reduce trust but still rely on hardware trust assumptions and trusted
  operators.
* This repo explores a different trust model: mathematical confidentiality plus
  immutable contract logic.

### "Why not keep everything off-chain?"

Good answer:

* Off-chain compute is operationally easier, but then correctness and access
  rules depend on the operator.
* This repo is specifically asking how far we can push a trust-minimized
  on-chain evaluator.

### "Why is the model marketplace separate from the compute engine?"

Good answer:

* Separating publication from compute makes models reusable across jobs, keeps
  the state machine explicit, and avoids baking one model directly into each
  compute contract.

### "Why do we need both `sampleId` and `inputProof`?"

Good answer:

* `sampleId` answers "is this caller authorized to start a job over this sample?"
* `inputProof` answers "are these encrypted values valid fhEVM external inputs?"
* They solve different problems.

### "Why can anyone call `computeChunk`?"

Good answer:

* That is an intentional relayer-friendly choice.
* Upload control and result access remain requester-controlled.
* Permissionless compute helps separate "who pays gas" from "who owns the job."

### "Why do we store public weights on-chain if privacy is the goal?"

Good answer:

* The system supports both public and private model paths.
* Public models are cheaper and align with open-science use cases.
* Private models exist for IP-sensitive settings, at higher encrypted compute
  cost.

### "Why is the oracle fed via a re-encryption path instead of directly from the engine?"

Good answer:

* Because the current oracle API consumes fresh `externalEuint64` inputs rather
  than another contract's internal handle directly.
* So the real flow today is engine output -> authorized user-side recovery /
  re-encryption -> oracle input.

### "What is the biggest unresolved gap?"

Good answer:

* The biggest conceptual gap is that sample authorization is enforced, but data
  integrity between the registered sample URI and the submitted SNP ciphertexts
  is not cryptographically enforced on-chain.

## 10. What You Should Not Overclaim

This section is here to keep your explanation trustworthy.

Do not say:

* "The system proves that uploaded SNPs are the user's real genome."
* "The mock suite proves Sepolia production readiness."
* "The DP mechanism is already fully calibrated for formal privacy guarantees."
* "The oracle takes the engine handle directly."
* "Chunking is only about gas."

Say instead:

* "The system enforces encrypted compute and access control, but not full
  off-chain data provenance."
* "Mock mode validates protocol wiring and logic; Sepolia is still needed for
  real FHE behavior."
* "Current oracle noise is an implemented mitigation, not the end of the
  privacy-analysis story."
* "Chunking addresses both upload constraints and compute constraints."

## 11. Recommended Presentation Flow

If you have a whiteboard or slides, the cleanest order is:

1. Problem: PRS is a large sensitive dot product.
2. Why FHE: we want encrypted compute, not trusted cleartext compute.
3. Four contracts: registry, marketplace, engine, oracle.
4. End-to-end flow from model publication to classification.
5. Deep dive on the three hard parts:
   * chunking
   * permissions
   * quantization
6. What is validated today.
7. What remains future work.

That order usually lands better than walking file by file through the repo.

## 12. Recommended Reading Order Before You Present

If you want to prepare quickly but thoroughly, read in this order:

1. [`../../README.md`](../../README.md)
2. [`e2e-walkthrough-contract-grounded.md`](e2e-walkthrough-contract-grounded.md)
3. [`../design/overview.md`](../design/overview.md)
4. [`../design/model-marketplace.md`](../design/model-marketplace.md)
5. [`../design/snp-ingestion.md`](../design/snp-ingestion.md)
6. [`../design/quantization.md`](../design/quantization.md)
7. [`../../test/prs_compute_engine_chunked_snp_test.ts`](../../test/prs_compute_engine_chunked_snp_test.ts)
8. [`../../test/registry_marketplace_oracle_test.ts`](../../test/registry_marketplace_oracle_test.ts)

If you only have time for two things:

* read this document
* read [`e2e-walkthrough-contract-grounded.md`](e2e-walkthrough-contract-grounded.md)

## 13. Final Prep Checklist

Before explaining the repo to colleagues, make sure you can answer all of these
without looking things up:

* What problem is the repo solving?
* Why is quantization necessary?
* Why are there two chunk sizes?
* What does `sampleId` protect?
* What does `inputProof` protect?
* Why does the engine track both `partialSum` and `genoSum`?
* Why can anyone call `computeChunk` but not `finalize`?
* What is the current oracle handoff path?
* What is actually implemented vs. still future work?
* What is the biggest thing we should not overclaim?

If you can answer those cleanly, you are already in strong shape.
