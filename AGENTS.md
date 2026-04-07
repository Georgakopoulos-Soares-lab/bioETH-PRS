# bioETH PRS — Project Guidelines

## Identity

Confidential on-chain Polygenic Risk Scoring (PRS) via fhEVM. Computes encrypted dot-products of genotype vectors × GWAS weights without exposing raw DNA.

**Reference paper:** Knight et al., 2026, "Homomorphic encryption enables privacy preserving polygenic risk scores" (HEPRS). PDF at `docs/PIIS2667237525003078.pdf`. Original protocol uses CKKS; this project adapts it to TFHE + smart contracts.

## Stack

- **Solidity 0.8.24** (optimizer 200 runs) — Hardhat toolbox
- **TFHE integers** via Zama fhEVM — types: `ebool`, `euint8`, `euint64`
- **TypeScript** tests + scripts (ts-node, ethers v6)
- **fhevmjs** client library for encryption/decryption

## Build & Test

```sh
npm run build          # hardhat compile
npm run test           # hardhat test (mock FHE) — no external node needed
npm run profile:gas    # gas profiling script (mock mode, Hardhat only)
```

> Real FHE (actual ciphertext encryption) requires Sepolia testnet via `@fhevm/hardhat-plugin`. There is no local Docker node — Zama deprecated that approach.

## Architecture (4 contracts + 1 standalone)

| Contract | Role |
|---|---|
| `GenomicRegistry` | URI-based encrypted SNP sample registry + per-address ACL |
| `ModelMarketplace` | Public (`uint64[]`) and private (`euint64[]`) GWAS model listing |
| `PRSComputeEngine` | Marketplace-aware chunked dot-product with staged SNP upload and sequential chunk accumulation |
| `ResultOracle` | DP noise injection + encrypted categorical classification (Low/Med/High) |
| `BioETHPRS` (HEPRS.sol) | Standalone variant — embeds model directly, no marketplace |

## Key Conventions

- **Mock vs Real FHE**: Contracts compile against `@fhevm/solidity` (the real Zama library). Locally, `@fhevm/hardhat-plugin` deploys a mock coprocessor that validates the full fhEVM protocol (handles, ACL, proofs) while performing plaintext arithmetic. The same contracts deploy to Sepolia for real FHE. Old transparent mock files are archived in `mock-archive/`.
- **Import path**: Contracts import directly from `@fhevm/solidity/lib/FHE.sol` and inherit `ZamaEthereumConfig` from `@fhevm/solidity/config/ZamaConfig.sol`. Use `FHE.asEuint64()`, `FHE.add()`, `FHE.mul()`, `FHE.allow()`, `FHE.makePubliclyDecryptable()`. There is no `mulPlain` — trivially encrypt a plaintext first: `FHE.mul(snp, FHE.asEuint64(weight))`.
- **Chunked computation**: FHE dot-products exceed block gas limits. Marketplace-backed PRS jobs use `createPRSJob → appendSnpChunk (×N) → finalizeSnpUpload → computeChunk (×N) → finalize` with an on-chain state machine accumulating `partialSum`.
- **Quantization**: Float weights are scaled to `uint64` integers (e.g., `0.0045 × 10^8 = 450000`). Accumulation of N terms must stay within `2^64`.
- **ACL**: `FHE.allow(handle, address)` grants decrypt rights. `FHE.makePubliclyDecryptable(handle)` for public outputs like risk category.

## Documentation

| Doc | Purpose |
|---|---|
| `docs/architecture.md` | Architecture, design decisions, threat model, known gaps, benchmark baseline |
| `docs/quantization.md` | Signed-weight quantization and overflow-safe encoding |
| `docs/onboarding.md` | New contributor guide — biology, FHE background, concepts glossary, e2e example |
| `docs/reference.md` | Dev commands, chunk sizes, scale ceilings, validation tiers, Sepolia deployment |
| `docs/findings.md` | Benchmark findings — gas, timing, HCU probe, advisor results |
| `docs/roadmap.md` | Completed work, active priorities, future engineering |
| `docs/PIIS2667237525003078.pdf` | HEPRS reference paper |
