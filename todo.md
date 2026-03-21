# TODO

## Open Questions

- What is the target v1 scope?
  - public models only, or public + private together?
  - raw score output, categorical output only, or both?
  - what SNP count do we want to support credibly in v1: `100`, `1000`, `5000`, or higher?
- What should the model publication path look like?
  - one generic marketplace, or different paths for small vs large models?
  - fully on-chain storage, chunked on-chain storage, or on-chain commitments plus off-chain chunk retrieval?
  - should each PRS model live in marketplace storage, or in a dedicated per-model contract?
- What should the SNP submission path look like?
  - keep `startPRS()` as full-array input, or move to chunked SNP ingestion?
  - if SNP input is chunked, where is the temporary encrypted state stored?
- What should the trust and permission model be?
  - should `computeChunk(jobId)` stay permissionless for relayers, or be restricted?
  - how do we prove the submitted encrypted SNPs correspond to a registered sample with valid ACL access?
  - what level of model integrity attestation do we want: open listing, curator whitelist, or signed manifests?
- What should the quantization publication flow be?
  - is the advisor mandatory before upload?
  - what manifest fields must every published model include?
  - when do we move beyond hardcoded `uint64[]` / `euint64[]` assumptions?
- What is the v1 privacy/security target?
  - caller-supplied DP noise with safeguards, or on-chain/generated noise only?
  - how much noise is acceptable before clinical utility degrades?
  - do we want only categorical outputs publicly decryptable, with raw scores always access-controlled?
- What is the target deployment environment?
  - Sepolia only for the next milestone, or a more chain-agnostic abstraction?
  - what mock-vs-real parity level do we require before calling the system “production-ready”?

## Phases

### Phase 1 — Define the v1 target state

- Choose the v1 scope:
  - public-only vs public+private
  - target SNP sizes we intend to support
  - whether the primary output is raw PRS, risk category, or both
- Define success criteria:
  - end-to-end Sepolia demo requirements
  - required security properties
  - required test coverage and benchmark evidence
- Decide what “publishable model” means:
  - minimum metadata
  - versioning expectations
  - integrity/attestation expectations

### Phase 2 — Lock the quantization and manifest flow

- Keep HEPRS fixtures as the main correctness reference sets.
- Standardize the advisor output into a first manifest format:
  - source model hash
  - SNP count
  - scale
  - weight zero-point
  - score offset
  - encoded thresholds
  - required weight bits
  - required accumulator bits
  - target mode (`public` / `private`)
- Decide the default recommendation policy:
  - `baseline` as comparison floor
  - `balanced` as default unless a dataset proves otherwise
  - `max_precision` as opt-in mode
- Produce model-size evidence:
  - scaling factor × SNP count → error table
  - advisor recommendation behavior across copied HEPRS fixtures
- Plan for future advisor improvements:
  - split heuristic cost model into storage/mul/add/chunk components
  - separate public `mulPlain` and private encrypted `mul` cost curves
  - replace heuristic costs with measured gas/HCU data later

### Phase 3 — Make model publication scalable

- Redesign `ModelMarketplace.listPublicModel()` so large models are not uploaded in one transaction.
- Evaluate chunked model publication:
  - create model shell first
  - append weight chunks over multiple transactions
  - finalize/freeze the model once complete
- Decide whether private models need a different upload path from public models.
- Revisit storage reads:
  - avoid returning full arrays once models become large
  - define how chunks are addressed and retrieved during compute
- Add model lifecycle features:
  - versioning
  - deprecation/update path
  - optional pricing/fee mechanism

### Phase 4 — Make SNP ingestion scalable

- Decide whether `startPRS()` should remain full-array or become chunked.
- If chunked SNP ingestion is adopted:
  - define request/job creation flow
  - define encrypted SNP chunk append flow
  - define when a job becomes ready for computation
- Validate lengths and job invariants as early as possible:
  - reject empty inputs if undesired
  - reject mismatched model/SNP lengths at job creation rather than first chunk
- Add cleanup mechanics:
  - job cancellation
  - expired/incomplete job cleanup

### Phase 5 — Wire access control and execution permissions correctly

- Connect `GenomicRegistry` ACL checks into PRS job creation.
- Define the exact authorization rule:
  - sample owner
  - delegated grantee
  - researcher/model owner access if any
- Decide the `computeChunk()` permission model:
  - permissionless relay
  - requester-only
  - allow-list / operator model
- If permissionless relay remains:
  - document it clearly
  - reason about griefing and wasted-gas scenarios
- Preserve safe state-machine behavior:
  - keep checks-effects-interactions discipline
  - think through race/reordering assumptions around chunk execution

### Phase 6 — Add real model-extraction defenses

- Decide the DP strategy for v1:
  - caller-supplied noise with constraints
  - on-chain/generated noise
  - commitment-based noise enforcement
- Calibrate noise:
  - benchmark utility loss vs protection
  - produce ROC/AUC or equivalent utility curves at several noise levels
- Decide output exposure policy:
  - raw scores access-controlled
  - categories publicly decryptable
  - no public raw-score path by default
- Remove the zero-noise loophole before claiming security against model extraction.

### Phase 7 — Validate the real fhEVM client flow

- Integrate the end-to-end client path:
  - `fhevmjs` encryption
  - ciphertext submission
  - gateway/re-encryption flow
  - category decryption for user-visible results
- Run real-fhEVM tests on Sepolia:
  - verify ACL behavior
  - verify ciphertext handling
  - verify output decryption flow
- Compare mock vs real behavior:
  - gas
  - ciphertext/storage overhead
  - chunk-size limits
  - API/ACL differences

### Phase 8 — Benchmark and tune for feasibility

- Profile separately:
  - model publication cost by weight count
  - SNP ingestion cost by SNP count
  - `computeChunk()` cost by chunk size
- Find the practical boundaries for:
  - `100`
  - `500`
  - `1000`
  - `5000`
  - larger synthetic datasets if needed
- Revisit type strategy once measured data exists:
  - whether `euint64` everywhere is too conservative
  - whether mixed-width paths are worth the complexity
- Evaluate planned optimizations:
  - `euint16` intermediates / widening accumulators
  - SIMD / slot-packing

### Phase 9 — Hardening and research-grade validation

- Perform formal security analysis of:
  - DP noise calibration
  - categorical bucketing
  - adaptive model-extraction resistance
- Validate scientific fidelity:
  - compare de-quantized on-chain outputs against PLINK/PRSice or equivalent references
  - quantify MSE / rank correlation / AUC degradation
- Reassess portability:
  - Sepolia path
  - Fhenix / Inco / future fhEVM-compatible chains
- Decide what evidence is required before calling the system feasible, secure, and ready to demo publicly.
