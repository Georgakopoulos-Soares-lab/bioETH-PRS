# bioETH PRS — Claude Code Guide

## Project in One Line

Confidential on-chain Polygenic Risk Scoring via fhEVM — encrypted dot-product of genotype vectors × GWAS weights, no plaintext DNA ever touches validators.

## Build & Test

```sh
npm run build                    # hardhat compile (Solidity 0.8.24, evmVersion cancun)
npm run test                     # hardhat test via @fhevm/hardhat-plugin mock coprocessor
npm run profile:heprs            # HEPRS fixture timing + gas (real GWAS data, computeChunkSize=20)
npm run profile:gas              # gas vs SNP-count curve (synthetic data)
npm run advisor:quantization     # float-to-uint64 scaling advisor
npm run advisor:scale-ceilings   # quick uint64 overflow screen
```

> Contracts compile against `@fhevm/solidity` (the real Zama library). Locally, `@fhevm/hardhat-plugin` deploys a mock coprocessor that validates the full fhEVM protocol (handles, ACL, proofs) while performing plaintext arithmetic behind the scenes. The same contracts deploy to Sepolia for real FHE. Old transparent mock files are archived in `mock-archive/`.

## Contract Map

| Contract | File | Role |
|---|---|---|
| GenomicRegistry | [contracts/GenomicRegistry.sol](contracts/GenomicRegistry.sol) | URI registry + per-address ACL |
| ModelMarketplace | [contracts/ModelMarketplace.sol](contracts/ModelMarketplace.sol) | Public / private GWAS weight chunks + immutable per-model release policy (`ZamaEthereumConfig`) |
| PRSComputeEngine | [contracts/PRSComputeEngine.sol](contracts/PRSComputeEngine.sol) | Chunked dot-product state machine (`ZamaEthereumConfig`) |
| ResultOracle | [contracts/ResultOracle.sol](contracts/ResultOracle.sol) | Bounded randomized release + categorical classification (`ZamaEthereumConfig`) |
| BioETHPRS | [contracts/legacy/HEPRS.sol](contracts/legacy/HEPRS.sol) | Legacy standalone variant — no marketplace dependency |

## Security Invariants — Never Violate

1. **No raw scores publicly decryptable** — `FHE.makePubliclyDecryptable` only on risk categories (`euint8`), never on `partialSum` or final PRS scores (`euint64`).
2. **ACL on every encrypted output** — every `euint64` returned to a user must have `FHE.allow(handle, userAddress)` before the function returns. `finalizeAndClassify` must call `FHE.allow(encodedScore, oracle)` before the oracle handoff.
3. **Quantization ceiling** — `scale × 2 × N_snps` must fit in `uint64` (max ~1.8×10^19). At scale 10^8 and 5000 SNPs: 10^12 ✓. Run `npm run advisor:quantization` before deploying new models.
4. **On-chain noise only** — `ResultOracle` generates noise via `FHE.randEuint64(noiseUpperBound)`. The old caller-supplied noise parameter has been removed. Zero-noise calls are impossible.
5. **Registry ACL enforced** — `PRSComputeEngine.createPRSJob` checks `GenomicRegistry.hasAccess(sampleId, msg.sender)`. Do not assume compute chunks also re-check (they don't).
6. **State machine integrity** — PRS job transitions: `PENDING → UPLOADING → READY → COMPUTING → DONE`. Never allow compute calls before `finalizeSnpUpload` completes.
7. **Rate limiting** — `createPRSJob` enforces per-model, per-wallet, block-windowed job count limits when configured via `ModelMarketplace.setRateLimit`. Default is unlimited (backwards-compatible).
8. **Oracle-required mode** — when a model's release policy sets `oracleRequired`, `finalize()`, `finalizeTo()`, and `readPartial()` revert. Only `finalizeAndClassify()` (oracle path with bounded randomized release) is allowed.
9. **Minimum threshold gap** — enforced twice. `ModelMarketplace.setReleasePolicy` rejects a policy whose gap is below the oracle's `noiseUpperBound` at configuration time, so a model cannot be published with a policy that would always revert. `ResultOracle._classifyScore` re-checks the same condition, which still guards the direct `classify()` entry point.
10. **Model-defined release policy — no requester-chosen thresholds** — `PRSComputeEngine.finalizeAndClassify(jobId)` takes *only* a job id. The oracle address and both classification thresholds are loaded from `ModelMarketplace.getReleasePolicy(modelId)`. Never add a threshold or oracle parameter to any classification entry point: a requester who can shift thresholds across calls performs a binary search on the encrypted score, which leaks far more per query than a ternary classification and largely defeats the randomized release.
11. **Release policy is immutable after model finalization** — `setReleasePolicy` is guarded by `_requireOwnedDraftModel`, so the policy can only be set while the model is a draft. There is deliberately no update or clear function, and `setOracleRequired` / `setApprovedOracle` no longer exist. A model that can serve jobs cannot have its oracle or thresholds swapped. `getApprovedOracle` and `isOracleRequired` remain as read-only views over the policy.
12. **Single-finalize per job** — `finalize()`, `finalizeTo()`, and `finalizeAndClassify()` set `job.finalized = true` and revert on any second call. Prevents redundant FHE ops and multiple oracle invocations per rate-limit slot.

## Key Conventions

- **Encrypted types**: `euint64` for SNP values and weights, `euint8` for categorical outputs, `ebool` for comparisons.
- **Multiplication**: Public weights use `FHE.mul(snp, FHE.asEuint64(weight))`; private weights use `FHE.mul(weight, snp)`. **Both are charged as ciphertext×ciphertext.** `FHE.asEuint64(w)` produces a real (trivially encrypted) handle, so the subsequent `mul` takes the `euint64 × euint64` overload, which passes `scalar = false` and costs 596,000 HCU for `Uint64` — not the 365,000 the scalar path costs. The scalar discount is only obtained via the `FHE.mul(euint64, uint64)` overload, which the code does not currently use. See `CD-022`: switching would save 38.8% HCU per multiplication and raise the compute-chunk ceiling from 21 to roughly 34. Public models are still ~28% cheaper than private ones in *host gas*, but that is from packed `uint64[]` storage reads, not from any coprocessor optimisation.
- **Classic chunked pattern**: `createPRSJob → appendSnpChunk (×N) → finalizeSnpUpload → computeChunk (×N) → finalize`. Each step is a separate transaction. SNP handles persisted in `snpData[]`.
- **Streaming pattern**: `createPRSJob → appendAndComputeChunk (×N) → finalize`. Upload and compute combined per chunk; no SNP handle storage. Saves ~37% gas. Preferred for single-requester flows.
- **Import path**: Contracts import directly from `@fhevm/solidity/lib/FHE.sol` and inherit `ZamaEthereumConfig` from `@fhevm/solidity/config/ZamaConfig.sol`.
- **Encrypted inputs**: Functions receiving user-encrypted data accept `externalEuint64` + `bytes inputProof`, then call `FHE.fromExternal()` + `FHE.allowThis()` before storing. Streaming path skips `allowThis` on intermediate handles.
- **ACL discipline**: Call `FHE.allowThis(handle)` on every new handle stored in contract state. Call `FHE.allow(handle, user)` before returning handles to users.

## Slash Commands

| Command | Purpose |
|---|---|
| `/security-review` | FHE + blockchain security audit of contracts |
| `/gas-profile` | Run gas profiling and interpret results |
| `/research` | Domain research on FHE, PRS, GWAS, genomic privacy, quantization |

## Coding Conventions

When writing contracts or tests, read the relevant instruction file:

| Working on | Read |
|---|---|
| Solidity contracts / FHE operations | [`.claude/instructions/solidity-fhevm.md`](.claude/instructions/solidity-fhevm.md) |
| Hardhat tests / test utilities | [`.claude/instructions/hardhat-tests.md`](.claude/instructions/hardhat-tests.md) |

## Where to Look

**Design & reference (`docs/`):**

| Question | Go to |
|---|---|
| Architecture, design decisions, threat model, quantization | [docs/design.md](docs/design.md) |
| Dev workflow commands, chunk sizes, validation tiers, Sepolia deployment | [docs/reference.md](docs/reference.md) |
| New contributor onboarding & e2e example | [docs/onboarding.md](docs/onboarding.md) |
| Roadmap & active work | [docs/roadmap.md](docs/roadmap.md) |
| HEPRS reference paper | [docs/PIIS2667237525003078.pdf](docs/PIIS2667237525003078.pdf) |

**Empirical findings (`reports/`):**

| Question | Go to |
|---|---|
| Classic path gas profile — HCU ceiling, phase breakdown, mock vs Sepolia | [reports/classic-gas.md](reports/classic-gas.md) |
| Streaming path gas profile — 37% savings, trade-offs | [reports/streaming-gas.md](reports/streaming-gas.md) |
| Quantization advisor — scale tiers, overflow safety | [reports/quantization-advisor.md](reports/quantization-advisor.md) |
| Deployment cost — ETH/USD costs, network scenarios, when the math works | [reports/deployment-cost.md](reports/deployment-cost.md) |
