# TODO

## Current Snapshot

The repo is at a stable, tested v1 state with real fhEVM library integration.
Sepolia deployment infrastructure is complete and ready to run.

The current implemented state is:

- `ModelMarketplace v1` is implemented with chunked publication lifecycle
- `PRSComputeEngine` implements staged SNP ingestion, chunked compute, and the V1 quantization correction
- Contracts import from `@fhevm/solidity` (real Zama library) and inherit `ZamaEthereumConfig`
- Local testing via `@fhevm/hardhat-plugin` mock coprocessor — validates handles, ACL, and input proofs while performing plaintext arithmetic
- Same contract bytecode deploys to Sepolia for real FHE — no contract changes needed
- **64 tests pass** under the mock coprocessor (~21s)
- **chunkSize = 10** default in all profiling and tests; **chunkSize = 20** confirmed safe on mock (systematic HCU probe, 2 Apr 2026)
- **Mock HCU budget corrected**: ~60–74 ops/tx (not ~30 as previously stated); ceiling is chunkSize=20, not 10
- HEPRS profiler captures both timing and gas per phase across all 4 fixtures
- All 50 individuals × 4 fixtures (200 checks) verified safe within `uint64` bounds
- Design docs include chunk-size constraints, local vs Sepolia comparison, and V1 quantization worked example
- **Mock validation baseline captured**: `reports/mock-validation-findings.md` — 100-SNP end-to-end PASS, full gas/timing table, HCU probe results
- **Sepolia tooling complete**: `hardhat.config.ts` has Sepolia network block; `scripts/deploy.ts`, `scripts/sepolia_validation.ts`, `scripts/probe_hcu_ceiling.ts` are ready; `npm run deploy:sepolia`, `validate:sepolia`, `probe:hcu` commands wired

## Recently Completed

### fhEVM library migration

- Migrated contracts from transparent local mock (`contracts/fhevm/FHE.mock.sol`) to official `@fhevm/solidity` library
- All contracts now inherit `ZamaEthereumConfig` and import from `@fhevm/solidity/lib/FHE.sol`
- Replaced `mulPlain` with `FHE.mul(snp, FHE.asEuint64(weight))` (trivially-encrypted C×P path)
- SNP upload now uses `fhevm.createEncryptedInput()` → `externalEuint64[]` + `inputProof`
- Score retrieval via `JobFinalized` event + `fhevm.debugger.decryptEuint()`
- Old transparent mock files archived in `mock-archive/` — not on any import path

### Profiling overhaul

- Profiler (`scripts/heprs_fixture_profile.ts`) runs as Mocha `describe/it` block so mock coprocessor is fully initialised
- Added per-phase gas tracking from transaction receipts (publishModel, createJob, uploadSnps, finalizeSnpUpload, compute, finalize)
- Fixed `scripts/gas_profile.ts` — was broken (old contract API, wrong command); now runs as `hardhat test` with proper encrypted inputs
- `package.json`: `profile:gas` now runs `hardhat test scripts/gas_profile.ts`
- Reports updated with fresh timing and gas data

### Testing additions

- Added overflow safety test suite: all 50 individuals × 4 fixtures = 200 checks, all within `[0, 2^64)`
- Test count: 55 → 59 passing
- Confirmed: `chunkSize = 32` and `chunkSize = 25` trigger `HCUTransactionLimitExceeded`; `chunkSize = 20` is the highest confirmed safe value on mock (systematic probe, 2 Apr 2026)

### Documentation patches

- `docs/design/v1/snp-ingestion.md` — new "Chunk-size constraints in practice" section: HCU math, 10/32 limits, binding constraint, Sepolia guidance; updated 2 Apr 2026 with correct ceiling (20, not 10)
- `docs/design/v1/overview.md` — chunk-size ceiling noted under core design decisions; links to snp-ingestion.md
- `docs/architecture-roadmap.md` — Local vs Sepolia comparison table in §3-E; §7 renamed from "Known Edge Cases" to "Known Implementation Gaps"; §7-I updated with measured mock baseline
- `docs/design/v1/quantization.md` — test count corrected (55 → 59)
- `README.md` — stale mock file paths removed, chunk size corrected, Running Tests section updated, Real FHE section corrected
- `docs/onboarding/contributor-onboarding.md` — missing Step 4 fixed
- `CLAUDE.md` — `profile:heprs` added to Build & Test section

### Mock validation baseline + HCU systematic probe (2 April 2026)

- `npm run validate:mock` — 100-SNP HEPRS fixture end-to-end PASS; score 758,685 matches expected; full gas/timing captured
- `npm run probe:hcu:mock` — systematic HCU ceiling probe across chunkSizes [10, 15, 20, 25, 32]; ceiling confirmed 20 < C ≤ 25 (corrects prior claim of 10)
- `reports/mock-validation-findings.md` — new report with full phase gas, per-chunk gas, HCU probe table, and recommended chunkSize guidance
- `reports/heprs-fixture-findings.md` — HCU ceiling section corrected; chunk-size table updated
- `docs/design/v1/snp-ingestion.md` — HCU limit section rewritten with probe data; practical guidance updated

### Marketplace and compute refactor (prior work, still current)

- Chunked model publication lifecycle: `createModelShell` → `appendPublicModelChunk` × N → `finalizeModel`
- Staged SNP ingestion: `createPRSJob(modelId, sampleId)` → `appendSnpChunk` × N → `finalizeSnpUpload` → `computeChunk` × N → `finalize`
- Registry ACL wired into job creation: `createPRSJob` calls `GenomicRegistry.hasAccess(sampleId, msg.sender)`; owner, delegate, revoked, and invalid-sample paths all tested
- V1 quantization correction: `(weighted_sum + scoreOffset) - (weightZeroPoint × genoSum)`
- `JobFinalized` event emitted by `finalize()` — used by profiler and off-chain indexers

## Active Priorities

### 1. Sepolia deployment — run and record results

Tooling is complete. Remaining work is execution and recording findings.

Pre-flight (see `docs/reference/sepolia-deployment.md`):

- Obtain Sepolia ETH (~0.2 ETH covers deploy + validation + HCU probe)
- `npx hardhat vars set MNEMONIC`
- `npx hardhat vars set INFURA_API_KEY`

Execution sequence:

- `npm run deploy:sepolia` — deploy all 4 contracts, save to `deployments/sepolia.json`
- `npm run validate:sepolia` — 100-SNP HEPRS fixture end-to-end with real TFHE ciphertext
- `npm run probe:hcu` — find real Sepolia HCU ceiling across chunkSizes 10/15/20/25/32

After runs complete:

- Fill in "Sepolia observed" column in `docs/architecture-roadmap.md §7-I`
- Create `reports/sepolia-validation-findings.md` with timing + gas data
- Update `docs/design/v1/snp-ingestion.md` "Chunk-size constraints" with real HCU ceiling
- Move this item to Recently Completed

### 3. Harden the DP / output story

The oracle still trusts caller-supplied noise.

- Decide near-term DP posture: caller-supplied with guardrails / commitment-based / on-chain generated
- Decide user-facing output policy: encrypted raw score (requester-only) vs risk category (public)
- Zero-noise loophole must be addressed before making model-extraction claims
- Tracked in `docs/architecture-roadmap.md §7-D`

### 4. Decouple upload and compute chunk sizes

Currently both use `chunkSize = 10` for uniformity.

- Upload can safely handle up to 32 values per proof (2048-bit budget)
- Compute is bound to 10 on the mock; real HCU ceiling on Sepolia is unknown
- Decoupling reduces upload transactions by ~3× at no contract cost
- Should be done after measuring real Sepolia HCU ceiling (Priority 1)

## Secondary Engineering Work

### Marketplace improvements

- Add model versioning / deprecation semantics
- Decide whether pricing / fee mechanics are in scope
- Decide whether public-model storage should remain fully on-chain or move toward commitment-based storage

### Job lifecycle improvements

- Add job cancellation / cleanup for incomplete jobs
- Decide whether stale job state needs expiry semantics

### Quantization and type strategy

- Expand measured evidence: scale choice vs MSE tradeoff, encoded threshold quality for `ResultOracle`, overflow headroom under real weight distributions
- Revisit whether `euint64` everywhere is too conservative once real Sepolia measurements exist
- Evaluate V2 optimizations: narrower intermediates (`euint16` weights), widening accumulators, SIMD / slot-packing

## Research / Paper Work

### Feasibility evidence

- Produce a clean benchmark story for mock and real fhEVM:
  - model publication, SNP ingestion, chunked compute, finalize / output path
  - mock timing baseline now exists in `reports/heprs-fixture-findings.md`
  - real Sepolia numbers are the missing piece
- Compare mock gas estimates against real fhEVM precompile costs

### Scientific validation

- Compare de-quantized on-chain outputs against reference PRS tooling (PLINK / PRSice)
- Quantify MSE, rank correlation, AUC or equivalent clinical utility measures
- Cross-check formula against HEPRS paper Python reference with same betas / genotypes

### Security analysis

- Formalize threat model: model extraction, repeated query attacks, noisy categorical release, sample access abuse
- Be explicit about which protections are implemented, mocked, assumed, or future work

## Items No Longer Open

Previously open questions that now have an implemented and tested answer:

- `v1` supports both public and private model publication paths
- Marketplace uses chunked on-chain storage — not one-shot upload
- Compute uses chunk-addressed reads — not whole-model reads
- 5000-SNP fixture completes end-to-end (staged SNP upload removes the old OOG boundary)
- V1 quantization correction is implemented, tested, and documented
- `computeChunk` permission model decided: permissionless relay is intentional (documented in `docs/design/v1/snp-ingestion.md`)
- `JobFinalized` event is implemented — used by profiler and available to off-chain indexers
- Full profiling with timing + gas now exists in `reports/heprs-fixture-findings.md`
- Chunk-size constraints (10 for compute, 32 for upload) are empirically confirmed and documented
- Mock vs real fhEVM distinction is clearly documented and the contracts are ready for Sepolia without code changes

## Keep This File Useful

When updating this file:

- move completed items into `Recently Completed` or `Items No Longer Open`
- remove questions that already have an implemented answer
- keep `Active Priorities` short and execution-oriented
- keep paper/research work separate from core engineering work
