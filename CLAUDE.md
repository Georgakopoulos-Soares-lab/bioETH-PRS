# bioETH PRS — Claude Code Guide

> Full project context lives in [AGENTS.md](AGENTS.md). This file adds Claude-specific guidance on top.

## Project in One Line

Confidential on-chain Polygenic Risk Scoring via fhEVM — encrypted dot-product of genotype vectors × GWAS weights, no plaintext DNA ever touches validators.

## Build & Test

```sh
npm run build                    # hardhat compile (Solidity 0.8.24, evmVersion cancun)
npm run test                     # hardhat test via @fhevm/hardhat-plugin mock coprocessor
npm run profile:heprs            # HEPRS fixture timing + gas (real GWAS data, chunkSize=10)
npm run profile:gas              # gas vs SNP-count curve (synthetic data)
npm run advisor:quantization     # float-to-uint64 scaling advisor
npm run advisor:scale-ceilings   # quick uint64 overflow screen
```

> Contracts compile against `@fhevm/solidity` (the real Zama library). Locally, `@fhevm/hardhat-plugin` deploys a mock coprocessor that validates the full fhEVM protocol (handles, ACL, proofs) while performing plaintext arithmetic behind the scenes. The same contracts deploy to Sepolia for real FHE. Old transparent mock files are archived in `mock-archive/`.

## Contract Map

| Contract | File | Role |
|---|---|---|
| GenomicRegistry | [contracts/GenomicRegistry.sol](contracts/GenomicRegistry.sol) | URI registry + per-address ACL |
| ModelMarketplace | [contracts/ModelMarketplace.sol](contracts/ModelMarketplace.sol) | Public / private GWAS weight chunks (`ZamaEthereumConfig`) |
| PRSComputeEngine | [contracts/PRSComputeEngine.sol](contracts/PRSComputeEngine.sol) | Chunked dot-product state machine (`ZamaEthereumConfig`) |
| ResultOracle | [contracts/ResultOracle.sol](contracts/ResultOracle.sol) | DP noise + categorical classification (`ZamaEthereumConfig`) |
| BioETHPRS | [contracts/legacy/HEPRS.sol](contracts/legacy/HEPRS.sol) | Legacy standalone variant — no marketplace dependency |

## Security Invariants — Never Violate

1. **No raw scores publicly decryptable** — `FHE.makePubliclyDecryptable` only on risk categories (`euint8`), never on `partialSum` or final PRS scores (`euint64`).
2. **ACL on every encrypted output** — every `euint64` returned to a user must have `FHE.allow(handle, userAddress)` before the function returns.
3. **Quantization ceiling** — `scale × 2 × N_snps` must fit in `uint64` (max ~1.8×10^19). At scale 10^8 and 5000 SNPs: 10^12 ✓. Run `npm run advisor:quantization` before deploying new models.
4. **On-chain noise only** — `ResultOracle` generates noise via `FHE.randEuint64(noiseUpperBound)`. The old caller-supplied noise parameter has been removed. Zero-noise calls are impossible.
5. **Registry ACL enforced** — `PRSComputeEngine.createPRSJob` checks `GenomicRegistry.hasAccess(sampleId, msg.sender)`. Do not assume compute chunks also re-check (they don't).
6. **State machine integrity** — PRS job transitions: `PENDING → UPLOADING → READY → COMPUTING → DONE`. Never allow compute calls before `finalizeSnpUpload` completes.

## Key Conventions

- **Encrypted types**: `euint64` for SNP values and weights, `euint8` for categorical outputs, `ebool` for comparisons.
- **Multiplication**: Public weights use `FHE.mul(snp, FHE.asEuint64(weight))` (trivially encrypted — coprocessor optimizes C×P internally). Private weights use `FHE.mul(weight, snp)` (C×C).
- **Chunked pattern**: `createPRSJob → appendSnpChunk (×N) → finalizeSnpUpload → computeChunk (×N) → finalize`. Each step is a separate transaction.
- **Import path**: Contracts import directly from `@fhevm/solidity/lib/FHE.sol` and inherit `ZamaEthereumConfig` from `@fhevm/solidity/config/ZamaConfig.sol`.
- **Encrypted inputs**: Functions receiving user-encrypted data accept `externalEuint64` + `bytes inputProof`, then call `FHE.fromExternal()` + `FHE.allowThis()` before storing.
- **ACL discipline**: Call `FHE.allowThis(handle)` on every new handle stored in contract state. Call `FHE.allow(handle, user)` before returning handles to users.

## Slash Commands

| Command | Purpose |
|---|---|
| `/security-review` | FHE + blockchain security audit of contracts |
| `/gas-profile` | Run gas profiling and interpret results |

## Where to Look

| Question | Go to |
|---|---|
| Architecture, design decisions, threat model | [docs/architecture.md](docs/architecture.md) |
| Quantization math & overflow | [docs/quantization.md](docs/quantization.md) |
| Dev workflow commands, chunk sizes, validation tiers, Sepolia deployment | [docs/reference.md](docs/reference.md) |
| New contributor onboarding & e2e example | [docs/onboarding.md](docs/onboarding.md) |
| Benchmark findings & gas data | [docs/findings.md](docs/findings.md) |
| Roadmap & active work | [docs/roadmap.md](docs/roadmap.md) |
| HEPRS reference paper | [docs/PIIS2667237525003078.pdf](docs/PIIS2667237525003078.pdf) |
