# HEPRS — Confidential Polygenic Risk Scoring on fhEVM

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
8. [Configuration Reference](#configuration-reference)
9. [Troubleshooting](#troubleshooting)
10. [Contributing](#contributing)
11. [License](#license)

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

For the full theory, edge cases, and roadmap, see [INSTRUCTIONS.md](INSTRUCTIONS.md).

---

## Repository Layout

```
contracts/
  GenomicRegistry.sol        Data layer — sample URIs + ACL
  ModelMarketplace.sol       Public & private GWAS model listing
  PRSComputeEngine.sol       Marketplace-aware chunked PRS engine
  HEPRS.sol                  Standalone chunked PRS engine
  ResultOracle.sol           DP noise + categorical classification
  TFHE.sol                   Thin wrapper forwarding to Zama FHE
  fhevm/
    FHE.sol                  Local plaintext mock of FHE for Hardhat
    EncryptedTypes.sol       UDVTs (ebool, euint8, euint64)
test/
  heprs_test.ts              Chunked PRS unit test
  registry_marketplace_oracle_test.ts   End-to-end integration test
  utils/fhevm.ts             fhevmjs helpers (encrypt64Array, getInstance)
scripts/
  gas_profile.ts             Gas vs. SNP-count profiling script
vendor/
  fhevm/                     Zama fhEVM repo checkout (git-cloned)
```

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | ≥ 20 LTS | `node -v` |
| **npm** (or **yarn / pnpm**) | ≥ 9 | Ships with Node.js |
| **Docker** | ≥ 24 | Only needed for a local fhEVM node |
| **Git** | any | For cloning `vendor/fhevm` |

> **Apple Silicon note:** Make sure Docker is running with Rosetta or native ARM images. Zama's fhEVM Docker images may require `--platform linux/amd64`.

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

This pulls in `hardhat`, `@nomicfoundation/hardhat-toolbox`, `encrypted-types`, `fhevmjs`, and TypeScript tooling.

### 3. Clone the Zama fhEVM vendor library (if not already present)

```bash
git clone https://github.com/zama-ai/fhevm vendor/fhevm
```

Make sure the following path exists after cloning:

```
vendor/fhevm/library-solidity/lib/FHE.sol
```

### 4. Verify remappings

`remappings.txt` should contain:

```
encrypted-types/=node_modules/encrypted-types/
fhevm/=vendor/fhevm/library-solidity/lib/
```

Hardhat does not natively consume `remappings.txt`, but IDE tooling (e.g., Solidity extension in VS Code) uses it for resolution. Actual path resolution is handled by the `encrypted-types` npm package and the `contracts/fhevm/` local mock during Hardhat compilation.

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
| `Source not found: encrypted-types/…` | Run `npm install` — the `encrypted-types` package must be in `node_modules`. |
| `Source not found: vendor/fhevm/…` | Clone the Zama repo into `vendor/fhevm` (see step 3 above). |
| Solidity version mismatch | Ensure `0.8.24` in `hardhat.config.ts` and all `.sol` files. |

---

## Running Tests

### Local Hardhat simulation (mock FHE — no Docker needed)

The tests guard behind `FHEVM=1`. To run them against the **local plaintext mock** you need to either:

1. **Remove or skip the guard** in the test files, or
2. Set the env var — but note that `fhevmjs` calls will fail without a real node.

For quick Hardhat-only simulation you can create a wrapper that bypasses the `fhevmjs` path. This is documented in the test files as a TODO.

### Full fhEVM tests (Docker node required)

1. **Start the local fhEVM node** (see Zama's docs for the Docker Compose setup):

```bash
cd vendor/fhevm
docker compose up -d
```

2. **Export the required environment variables:**

```bash
export FHEVM=1
export FHEVM_NETWORK_URL=http://localhost:8545
export FHEVM_GATEWAY_URL=http://localhost:7077
export FHEVM_ACL_ADDRESS=0x...       # from the fhEVM deployment output
export FHEVM_KMS_ADDRESS=0x...       # from the fhEVM deployment output
export FHEVM_CHAIN_ID=9000           # default for local fhEVM
```

> **Tip:** Create a `.env` file (git-ignored) and source it: `source .env`

3. **Run the test suite:**

```bash
npm test
# or:
npx hardhat test
```

### Test files

| File | What it covers |
|------|---------------|
| `test/heprs_test.ts` | Uploads a 3-weight model, starts a job with chunk size 2, computes two chunks, finalises, and reads the encrypted result. |
| `test/registry_marketplace_oracle_test.ts` | Registers a sample, grants access, lists a public model, runs PRS via the compute engine, and classifies the result through the oracle. |

---

## Gas Profiling

The profiling script deploys `ModelMarketplace` + `PRSComputeEngine` and iterates over several SNP counts measuring gas per phase (model listing, job start, chunk computation).

```bash
# Requires FHEVM=1 + a running fhEVM node
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
| `Set FHEVM=1 …` error in tests | The env guard in `before()` fired | Export `FHEVM=1` or remove the guard for mock-only runs. |
| `Missing required env var: FHEVM_NETWORK_URL` | `fhevmjs` helper needs connection info | Set all `FHEVM_*` env vars (see above). |
| Docker container crashes on Apple Silicon | Image is x86-only | Run with `--platform linux/amd64` or use Rosetta. |
| `out of gas` during `computeChunk` | Chunk size too large for the chain's gas limit | Lower `chunkSize` in `startPRS()` or increase `blockGasLimit` for Hardhat. |
| Compilation OK but test reverts with unexpected value | Mock FHE (plaintext math) behaves differently from real TFHE | Run against a real fhEVM Docker node to validate. |
| `typechain-types` out of date | Generated types stale after contract edits | Run `npx hardhat compile` to regenerate. |

---

## Contributing

1. Fork & create a feature branch.
2. Keep contracts under `contracts/`, tests under `test/`.
3. Run `npx hardhat compile` and `npm test` before pushing.
4. Open a PR with a clear description and any gas impact.

---

## License

MIT — see individual file headers for details.  
Zama fhEVM vendor code is under its own license (BSD-3-Clause-Clear); see `vendor/fhevm/LICENSE`.
