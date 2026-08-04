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
                            │  PRSComputeEngine           │
                            │  Chunked FHE dot product    │
                            └────────────┬───────────────┘
                                         │
                                         ▼
                            ┌────────────────────────────┐
                            │  ResultOracle              │
                            │  Noise + Low/Med/High      │
                            └────────────────────────────┘
```

| Contract | Role |
|----------|------|
| **GenomicRegistry** | Stores IPFS/Arweave URIs of encrypted SNP data with per-address access control. |
| **ModelMarketplace** | Lists GWAS weight vectors — **public** (`uint64[]`, cheaper C×P via `FHE.asEuint64`) or **private** (`euint64[]`, full C×C `FHE.mul`). |
| **PRSComputeEngine** | Creates PRS job shells, ingests SNPs in model-aligned chunks, and computes the encrypted dot product chunk by chunk. |
| **ResultOracle** | Adds on-chain random noise, compares against two thresholds, and emits an encrypted risk category (Low / Medium / High). This is a **bounded randomized categorical release**, not differential privacy: the noise is one-sided, uncalibrated, and unaccounted across queries, so it provides no `(epsilon, delta)` guarantee. |
| **BioETHPRS** (`contracts/legacy/HEPRS.sol`) | Legacy standalone prototype — embeds model directly, no marketplace dependency. Retained for onboarding and comparison. |

Docs: [design](docs/design.md) · [onboarding](docs/onboarding.md) · [reference & commands](docs/reference.md) · [roadmap](docs/roadmap.md)

---

## Repository Layout

```
contracts/
  GenomicRegistry.sol        Data layer — sample URIs + ACL
  ModelMarketplace.sol       Public & private GWAS model listing
  PRSComputeEngine.sol       Marketplace-aware chunked PRS engine
  legacy/HEPRS.sol               BioETHPRS — legacy standalone prototype (no marketplace)
  ResultOracle.sol           Noisy categorical classification
test/
  bioeth_prs_test.ts         Standalone HEPRS prototype tests
  model_marketplace_chunked_test.ts     Model marketplace unit tests
  prs_compute_engine_chunked_snp_test.ts PRS job-upload unit tests
  registry_marketplace_oracle_test.ts   End-to-end integration test
  heprs_fixture_test.ts      HEPRS fixture integration + overflow tests
  quantization_advisor_test.ts          Advisor recommendation tests
  rate_limit_randomized_release_test.ts   Rate limiting + randomized-release hardening
  scale_ceiling_reference_test.ts       Overflow-screen reference tests
  utils/fhevm-helpers.ts     fhevmjs helpers (encryptUint64Array, debugDecrypt)
scripts/
  gas_profile.ts             Gas vs. SNP-count profiling (synthetic data)
  heprs_fixture_profile.ts   HEPRS fixture timing + gas profiling
mock-archive/                Archived old transparent mocks (not imported)
```

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | 20.x or 22.x LTS | `node -v` — run `nvm use` to match the repo's supported range |
| **npm** (or **yarn / pnpm**) | ≥ 9 | Ships with Node.js |
| **Git** | any | For cloning the repo |

> **No Docker needed** for mock-mode development. The full local suite runs entirely in Hardhat's in-process EVM with a plaintext FHE mock — no external node required.

---

## Installation

### 1. Clone the repository

```bash
git clone <repo-url> blockchain_prs
cd blockchain_prs
```

### 2. Install npm dependencies

```bash
nvm use   # if you use nvm; repo pins Node 22 in .nvmrc
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
| `Source not found: @fhevm/solidity/…` | Run `npm install` — the `@fhevm/solidity` and `@fhevm/hardhat-plugin` packages must be present in `node_modules/`. |
| Solidity version mismatch | Ensure `0.8.24` in `hardhat.config.ts` and all `.sol` files. |

---

## Running Tests

### Mock FHE — Hardhat in-process (no Docker, no external node)

All tests use the **`@fhevm/hardhat-plugin` mock coprocessor**, which validates handles, ACL, and input proofs while performing plaintext arithmetic. Contracts import from `@fhevm/solidity` (the real Zama library) — the same code deploys to Sepolia for real FHE. Tests run directly:

```bash
npm test
# or:
npx hardhat test
```

Expected output: the full mock-mode suite passes.

For the full offline verification bundle, including the mock end-to-end validation script, gas/fixture profilers, HCU probe, and quantization CLI runs across all shipped HEPRS fixtures, run:

```bash
npm run validate:local
```

For a fuller command cookbook, including single-file test runs, `--grep` usage, advisor commands, and profiling commands, see [docs/reference.md](docs/reference.md).

### Test files

| File | What it covers |
|------|---------------|
| `test/model_marketplace_chunked_test.ts` | Focused `ModelMarketplace v1` unit coverage for shells, chunk appends, finalization, permissions, and edge cases. |
| `test/prs_compute_engine_chunked_snp_test.ts` | Focused `PRSComputeEngine` unit coverage for job shells, SNP upload, readiness, compute relays, and requester-only outputs. |
| `test/registry_marketplace_oracle_test.ts` | Cross-contract integration test covering registry ACL, marketplace-backed PRS, and oracle classification. |
| `test/heprs_fixture_test.ts` | HEPRS-backed integration coverage using fixed advisor recommendations across the staged job-upload flow. |
| `test/bioeth_prs_test.ts` | Legacy `BioETHPRS` prototype behavior using the older embedded-model path (`contracts/legacy/HEPRS.sol`). |
| `test/rate_limit_randomized_release_test.ts` | Rate limiting (windowed per-model per-wallet and per-sample), oracle-required mode, and minimum threshold gap enforcement. |
| `test/quantization_advisor_test.ts` | Advisor recommendation ranking and CLI-summary behavior. |
| `test/scale_ceiling_reference_test.ts` | Quick overflow-screen reference logic. |

### Real FHE — Sepolia testnet

Zama's local Docker node approach has been discontinued. Real FHE encryption is only available on the **Sepolia testnet**. Contracts already import from `@fhevm/solidity` and inherit `ZamaEthereumConfig`, so the same code runs locally (mock) and on Sepolia (real FHE). Deploying to Sepolia requires:

1. Sepolia ETH (free from a faucet) and an Infura/Alchemy RPC key.
2. A network entry in `hardhat.config.ts` pointing to the Sepolia RPC.
3. Deploying through `npx hardhat test --network sepolia`.

The mock coprocessor covers 100% of contract logic and protocol-level validation (handles, ACL, input proofs). Real TFHE ciphertext correctness is only confirmable on Sepolia.

---

## Gas Profiling

The profiling script deploys `ModelMarketplace` + `PRSComputeEngine` with synthetic data and measures gas per phase (model listing, job creation, SNP upload, chunk computation). Runs as a Hardhat test with the `@fhevm/hardhat-plugin` mock coprocessor.

```bash
npm run profile:gas
# or:
npx hardhat test scripts/gas_profile.ts
```

### Environment variable overrides

| Variable | Default | Description |
|----------|---------|-------------|
| `SNP_COUNTS` | `100,300,600` | Comma-separated SNP vector sizes to profile. |
| `UPLOAD_CHUNK_SIZE` | `32` | SNPs per `appendSnpChunk` call (fhEVM input-proof limit). |
| `COMPUTE_CHUNK_SIZE` | `20` | SNPs per `computeChunk` call (HCU-constrained; mock ceiling is 20). |
| `GAS_PRICE_GWEI` | `30` | Assumed gas price for ETH cost estimation. |

Example:

```bash
SNP_COUNTS=100,500,1000,5000 npx hardhat test scripts/gas_profile.ts
```

For gas profiling with **real HEPRS fixture data** (including timing breakdowns), use `npm run profile:heprs` instead.

---

## HEPRS Profiling

For the copied HEPRS fixtures, use the dedicated profiling harness:

```bash
npm run profile:heprs
```

This script runs the current mock contract flow with the HEPRS fixture data and reports:

* total runtime per fixture
* load / quantization / publication / job-upload / finalize timings
* per-chunk timing summary
* how the staged job shell + SNP chunk upload flow behaves on the copied HEPRS fixtures

Default behavior:

* fixtures: `100`, `500`, `1000`, `5000`
* `uploadChunkSize=32` (fhEVM input-proof limit), `computeChunkSize=20` (mock HCU ceiling — see [reports/classic-gas.md](reports/classic-gas.md))

Common examples:

```bash
npm run profile:heprs -- --fixture 1000
npm run profile:heprs -- --fixture 5000 --upload-chunk-size 32 --compute-chunk-size 20 --verbose
npm run profile:heprs -- --json-out /tmp/heprs-profile.json
```

These timings are local Hardhat mock timings. They are useful for collaborator discussion and regression tracking, but they are not real fhEVM/Sepolia timings and not gas costs.

See also:

* historical baseline and advisor findings: [reports/classic-gas.md](reports/classic-gas.md) · [reports/streaming-gas.md](reports/streaming-gas.md)

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
| `out of gas` during `computeChunk` | `computeChunkSize` is too large for the chain's HCU/gas limit | Publish the model with a smaller `computeChunkSize` or increase `blockGasLimit` in `hardhat.config.ts`. Mock ceiling is 20. |
| `out of gas` during `appendSnpChunk` | `uploadChunkSize` exceeds the fhEVM input-proof budget | Reduce `uploadChunkSize`; the hard limit is 32 `euint64` values per input proof. |
| `typechain-types` out of date | Generated types stale after contract edits | Run `npx hardhat compile` to regenerate. |
| `Source not found: @fhevm/solidity/…` | Missing npm packages | Run `npm install` to restore `@fhevm/solidity` and `@fhevm/hardhat-plugin`. |

---

## Contributing

1. Fork & create a feature branch.
2. Keep contracts under `contracts/`, tests under `test/`.
3. Run `npx hardhat compile` and `npm test` before pushing.
4. Open a PR with a clear description and any gas impact.

---

## License

MIT — see individual file headers for details.
