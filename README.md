# bioETH PRS — Confidential Polygenic Risk Scoring on Ethereum

> **High-Performance Confidential GWAS: Optimizing Polygenic Risk Scoring via fhEVM**

A Hardhat prototype that computes Polygenic Risk Scores (PRS) entirely on-chain using Fully Homomorphic Encryption (FHE).  Validators execute dot-product arithmetic on encrypted genotype data without ever seeing the plaintext DNA.

Built on top of [Zama's fhEVM](https://github.com/zama-ai/fhevm) TFHE stack.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Repository Layout](#repository-layout)
3. [Prerequisites](#prerequisites)
4. [Installation](#installation)
5. [Building](#building)
6. [Running Tests](#running-tests)
7. [Gas Profiling](#gas-profiling)
8. [HEPRS Profiling](#heprs-profiling)
9. [Configuration Reference](#configuration-reference)
10. [Troubleshooting](#troubleshooting)
11. [Contributing](#contributing)
12. [License](#license)

---

## Architecture

```
┌───────────────────┐
│  Client (fhevmjs) │ encrypts SNP vector + sends ciphertext handles
└────────┬──────────┘
         │
         ▼
┌──────────────────────────┐     ┌──────────────────────┐
│  GenomicRegistry         │     │  ModelMarketplace     │
│  (sample URIs + ACL)     │     │  (GWAS weights,       │
│                          │     │   public or encrypted) │
└──────────────────────────┘     └───────────┬──────────┘
                                             │
                                             ▼
                            ┌────────────────────────────┐
                            │  PRSComputeEngine / HEPRS  │
                            │  Chunked FHE dot product    │
                            └────────────┬───────────────┘
                                         │
                                         ▼
                            ┌────────────────────────────┐
                            │  ResultOracle              │
                            │  DP noise + Low/Med/High   │
                            └────────────────────────────┘
```

| Contract | Role |
|----------|------|
| **GenomicRegistry** | Stores IPFS/Arweave URIs of encrypted SNP data with per-address access control. |
| **ModelMarketplace** | Lists GWAS weight vectors — **public** (`uint64[]`, cheaper `mulPlain`) or **private** (`euint64[]`, full FHE `mul`). |
| **PRSComputeEngine** | Reads models from the marketplace and computes the encrypted dot product in configurable chunks to stay within block gas limits. |
| **HEPRS** | Standalone variant that embeds models directly (useful for quick experiments). |
| **ResultOracle** | Adds encrypted DP noise, compares against two thresholds, and emits an encrypted risk category (Low / Medium / High). |

For the documentation map, see [docs/README.md](docs/README.md). For the practical command guide, see [docs/reference/development-workflows.md](docs/reference/development-workflows.md). For the full theory, edge cases, roadmap, and known risks, see [docs/architecture-roadmap.md](docs/architecture-roadmap.md). For the current chunked marketplace design, see [docs/design/model-marketplace-v1.md](docs/design/model-marketplace-v1.md). For the dedicated signed-weight and quantization design, see [docs/design/quantization-design.md](docs/design/quantization-design.md). For the standalone advisor workflow, see [docs/reference/quantization-advisor.md](docs/reference/quantization-advisor.md). For the quick scale-vs-SNP overflow screen, see [docs/reference/scaling-ceilings.md](docs/reference/scaling-ceilings.md). For collaborator-facing result reports, see [reports/scaling-ceiling-findings.md](reports/scaling-ceiling-findings.md), [reports/advisor-findings.md](reports/advisor-findings.md), and [reports/heprs-fixture-findings.md](reports/heprs-fixture-findings.md).

---

## Repository Layout

```
contracts/
  GenomicRegistry.sol        Data layer — sample URIs + ACL
  ModelMarketplace.sol       Public & private GWAS model listing
  PRSComputeEngine.sol       Marketplace-aware chunked PRS engine
  HEPRS.sol (contains `BioETHPRS`)   Standalone chunked PRS engine
  ResultOracle.sol           DP noise + categorical classification
  TFHE.sol                   Thin wrapper forwarding to Zama FHE
  fhevm/
    FHE.sol                  Local plaintext mock of FHE for Hardhat
    EncryptedTypes.sol       UDVTs (ebool, euint8, euint64)
test/
  bioeth_prs_test.ts         Chunked PRS unit test
  registry_marketplace_oracle_test.ts   End-to-end integration test
  utils/fhevm.ts             fhevmjs helpers (encrypt64Array, getInstance)
scripts/
  gas_profile.ts             Gas vs. SNP-count profiling script
```

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | ≥ 20 LTS | `node -v` |
| **npm** (or **yarn / pnpm**) | ≥ 9 | Ships with Node.js |
| **Git** | any | For cloning the repo |

> **No Docker needed** for mock-mode development. All 47 tests run entirely in Hardhat's in-process EVM with a plaintext FHE mock — no external node required.

---

## Installation

### 1. Clone the repository

```bash
git clone <repo-url> blockchain_prs
cd blockchain_prs
```

### 2. Install npm dependencies

```bash
npm install
```

This pulls in `hardhat`, `@nomicfoundation/hardhat-toolbox`, `fhevmjs`, TypeScript tooling, and the official fhEVM packages `@fhevm/solidity` plus `@fhevm/hardhat-plugin`.

---

## Building

Compile all contracts:

```bash
npm run build
# or directly:
npx hardhat compile
```

Expected output: ABI + bytecode in `artifacts/contracts/`.

### Common compilation errors

| Error | Fix |
|-------|-----|
| `Source not found: contracts/fhevm/…` | The local mock is missing — ensure `contracts/fhevm/FHE.sol` and `contracts/fhevm/EncryptedTypes.sol` exist. |
| Solidity version mismatch | Ensure `0.8.24` in `hardhat.config.ts` and all `.sol` files. |

---

## Running Tests

### Mock FHE — Hardhat in-process (no Docker, no external node)

All tests use a **plaintext FHE mock** (`contracts/fhevm/FHE.sol`) where `euint64` is just `uint64`. There is no `FHEVM=1` guard; tests run directly:

```bash
npm test
# or:
npx hardhat test
```

Expected output: **47 passing**.

For a fuller command cookbook, including single-file test runs, `--grep` usage, advisor commands, and profiling commands, see [docs/reference/development-workflows.md](docs/reference/development-workflows.md).

### Test files

| File | What it covers |
|------|---------------|
| `test/model_marketplace_chunked_test.ts` | Focused `ModelMarketplace v1` unit coverage for shells, chunk appends, finalization, permissions, and edge cases. |
| `test/registry_marketplace_oracle_test.ts` | Cross-contract integration test covering registry ACL, marketplace-backed PRS, and oracle classification. |
| `test/heprs_fixture_test.ts` | HEPRS-backed integration coverage using fixed advisor recommendations, including the current `5000`-SNP boundary. |
| `test/bioeth_prs_test.ts` | Standalone `HEPRS.sol` prototype behavior using the older embedded-model path. |
| `test/quantization_advisor_test.ts` | Advisor recommendation ranking and CLI-summary behavior. |
| `test/scale_ceiling_reference_test.ts` | Quick overflow-screen reference logic. |

### Real FHE — Sepolia testnet

Zama's local Docker node approach has been discontinued. Real FHE encryption is only available on the **Sepolia testnet** via Zama's `@fhevm/hardhat-plugin` and relayer infrastructure. Migrating to Sepolia requires:

1. Refactoring contracts to use `@fhevm/solidity` instead of the local mock.
2. Updating contract imports and config to the current package-based Zama workflow.
3. Sepolia ETH (free from a faucet) and an Infura/Alchemy RPC key.
4. Deploying through `@fhevm/hardhat-plugin`.

The mock mode covers 100% of contract logic. Real-FHE migration is a separate milestone.

---

## Gas Profiling

The profiling script deploys `ModelMarketplace` + `PRSComputeEngine` and iterates over several SNP counts measuring gas per phase (model listing, job start, chunk computation).

```bash
npm run profile:gas
# or:
npx hardhat run scripts/gas_profile.ts
```

### Environment variable overrides

| Variable | Default | Description |
|----------|---------|-------------|
| `SNP_COUNTS` | `100,300,600` | Comma-separated SNP vector sizes to profile. |
| `CHUNK_SIZE` | `100` | Number of SNPs processed per `computeChunk` call. |
| `GAS_PRICE_GWEI` | `30` | Assumed gas price for ETH cost estimation. |
| `BLOCK_TIME_SEC` | `12` | Assumed block time for wall-time estimation. |

Example:

```bash
SNP_COUNTS=100,500,1000,5000 CHUNK_SIZE=50 npx hardhat run scripts/gas_profile.ts
```

---

## HEPRS Profiling

For the copied HEPRS fixtures, use the dedicated profiling harness:

```bash
npm run profile:heprs
```

This script runs the current mock contract flow with the HEPRS fixture data and reports:

* total runtime per fixture
* load / quantization / upload / start / finalize timings
* per-chunk timing summary
* the current `5000`-SNP boundary, which now appears at `startPRS()` because SNP ingestion is still monolithic

Default behavior:

* fixtures: `100`, `500`, `1000`, `5000`
* chunk size: `128`

Common examples:

```bash
npm run profile:heprs -- --fixture 1000
npm run profile:heprs -- --fixture 5000 --chunk-size 128 --verbose
npm run profile:heprs -- --json-out /tmp/heprs-profile.json
```

These timings are local Hardhat mock timings. They are useful for collaborator discussion and regression tracking, but they are not real fhEVM/Sepolia timings and not gas costs.

See also:

* [reports/heprs-fixture-findings.md](reports/heprs-fixture-findings.md)
* [reports/advisor-findings.md](reports/advisor-findings.md)

---

## Configuration Reference

### `hardhat.config.ts`

```typescript
solidity: {
  version: "0.8.24",
  settings: { optimizer: { enabled: true, runs: 200 } }
},
networks: {
  hardhat: { blockGasLimit: 30_000_000 }
}
```

To target a live fhEVM node, add a network entry with the node's RPC URL and a funded account private key:

```typescript
networks: {
  fhevm: {
    url: process.env.FHEVM_NETWORK_URL ?? "http://localhost:8545",
    chainId: Number(process.env.FHEVM_CHAIN_ID ?? 9000),
    accounts: [process.env.DEPLOYER_PRIVATE_KEY!]
  }
}
```

Then deploy / test with:

```bash
npx hardhat test --network fhevm
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Error: Debug Failure. Output generation failed` | ts-node incompatible with TypeScript ≥ 5.8 | Ensure `tsconfig.json` has `"ts-node": { "swc": true }` and `@swc/core` is installed (`npm install --save-dev @swc/core`). |
| `Module '"hardhat"' has no exported member 'ethers'` | Wrong `module`/`moduleResolution` in tsconfig | Set `"module": "CommonJS"` and `"moduleResolution": "node"` in `tsconfig.json`. |
| `out of gas` during `computeChunk` | Model chunk size is too large for the chain's gas limit | Publish the model with a smaller `chunkSize` or increase `blockGasLimit` in `hardhat.config.ts`. |
| `out of gas` during `startPRS` | SNP vector submission is too large for the current chain / mock limit | Treat this as the next scaling boundary after chunked model publication; future work is chunked SNP ingestion. |
| `typechain-types` out of date | Generated types stale after contract edits | Run `npx hardhat compile` to regenerate. |
| `Source not found: contracts/fhevm/…` | Local mock missing | Ensure `contracts/fhevm/FHE.sol` and `contracts/fhevm/EncryptedTypes.sol` exist. |

---

## Contributing

1. Fork & create a feature branch.
2. Keep contracts under `contracts/`, tests under `test/`.
3. Run `npx hardhat compile` and `npm test` before pushing.
4. Open a PR with a clear description and any gas impact.

---

## License

MIT — see individual file headers for details.
