# bioETH PRS — Claude Code Guide

> Full project context lives in [AGENTS.md](AGENTS.md). This file adds Claude-specific guidance on top.

## Project in One Line

Confidential on-chain Polygenic Risk Scoring via fhEVM — encrypted dot-product of genotype vectors × GWAS weights, no plaintext DNA ever touches validators.

## Build & Test

```sh
npm run build                    # hardhat compile (Solidity 0.8.24)
npm run test                     # hardhat test in mock-FHE mode (no external node)
npm run profile:gas              # gas vs SNP-count curve
npm run advisor:quantization     # float-to-uint64 scaling advisor
npm run advisor:scale-ceilings   # quick uint64 overflow screen
```

> Mock FHE (`contracts/fhevm/FHE.sol`) performs plaintext arithmetic locally. Real ciphertext tests require Sepolia + `@fhevm/hardhat-plugin`. There is no supported local Docker node.

## Contract Map

| Contract | File | Role |
|---|---|---|
| GenomicRegistry | [contracts/GenomicRegistry.sol](contracts/GenomicRegistry.sol) | URI registry + per-address ACL |
| ModelMarketplace | [contracts/ModelMarketplace.sol](contracts/ModelMarketplace.sol) | Public / private GWAS weight chunks |
| PRSComputeEngine | [contracts/PRSComputeEngine.sol](contracts/PRSComputeEngine.sol) | Chunked dot-product state machine |
| ResultOracle | [contracts/ResultOracle.sol](contracts/ResultOracle.sol) | DP noise + categorical classification |
| BioETHPRS | [contracts/HEPRS.sol](contracts/HEPRS.sol) | Standalone variant (no marketplace) |
| TFHE wrapper | [contracts/TFHE.sol](contracts/TFHE.sol) | Thin FHE op wrappers |
| FHE mock | [contracts/fhevm/FHE.sol](contracts/fhevm/FHE.sol) | Plaintext mock for local tests |

## Security Invariants — Never Violate

1. **No raw scores publicly decryptable** — `FHE.makePubliclyDecryptable` only on risk categories (`euint8`), never on `partialSum` or final PRS scores (`euint64`).
2. **ACL on every encrypted output** — every `euint64` returned to a user must have `FHE.allow(handle, userAddress)` before the function returns.
3. **Quantization ceiling** — `scale × 2 × N_snps` must fit in `uint64` (max ~1.8×10^19). At scale 10^8 and 5000 SNPs: 10^12 ✓. Run `npm run advisor:quantization` before deploying new models.
4. **No arbitrary-noise bypass** — `ResultOracle.classify()` accepts caller-supplied noise. Until on-chain noise generation is implemented, document that zero-noise calls break DP guarantees.
5. **Registry ACL wiring** — `PRSComputeEngine` does not yet verify `GenomicRegistry` ACL. Do not assume it does. Tracked in `docs/architecture-roadmap.md` § 7-A.
6. **State machine integrity** — PRS job transitions: `PENDING → UPLOADING → READY → COMPUTING → DONE`. Never allow compute calls before `finalizeSnpUpload` completes.

## Key Conventions

- **Encrypted types**: `euint64` for SNP values and weights, `euint8` for categorical outputs, `ebool` for comparisons.
- **Multiplication cost**: Use `TFHE.mulPlain(snp, weight)` (C×P, ~60% cheaper) when model weights are public. Use `TFHE.mul(weight, snp)` (C×C) only for private-weight models.
- **Chunked pattern**: `createPRSJob → appendSnpChunk (×N) → finalizeSnpUpload → computeChunk (×N) → finalize`. Each step is a separate transaction.
- **Import path**: Contracts use `./TFHE.sol` wrapper → forwards to `./fhevm/FHE.sol` in mock mode. Do not import `FHE.sol` directly except in `ResultOracle`.

## Slash Commands

| Command | Purpose |
|---|---|
| `/security-review` | FHE + blockchain security audit of contracts |
| `/gas-profile` | Run gas profiling and interpret results |

## Where to Look

| Question | Go to |
|---|---|
| Architecture & threat model | [docs/architecture-roadmap.md](docs/architecture-roadmap.md) |
| Quantization math & overflow | [docs/design/v1/quantization.md](docs/design/v1/quantization.md) |
| SNP ingestion lifecycle | [docs/design/v1/snp-ingestion.md](docs/design/v1/snp-ingestion.md) |
| Model marketplace design | [docs/design/v1/model-marketplace.md](docs/design/v1/model-marketplace.md) |
| Dev workflow commands | [docs/reference/development-workflows.md](docs/reference/development-workflows.md) |
| HEPRS reference paper | [docs/PIIS2667237525003078.pdf](docs/PIIS2667237525003078.pdf) |
| Known edge cases & risks | [docs/architecture-roadmap.md § 7](docs/architecture-roadmap.md) |
