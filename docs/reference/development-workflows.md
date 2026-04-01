# Development Workflows

This document is the practical command guide for engineers working in this repo.

Use it when you want to:

- build the contracts
- run the full test suite
- run a specific unit or integration test
- run the quantization advisor
- run the scale-ceiling reference script
- run the local profiling scripts

For architecture and design context, see:

- [`../architecture-roadmap.md`](../architecture-roadmap.md)
- [`../design/v1/overview.md`](../design/v1/overview.md)
- [`../design/v1/model-marketplace.md`](../design/v1/model-marketplace.md)
- [`../design/v1/snp-ingestion.md`](../design/v1/snp-ingestion.md)
- [`../design/v1/quantization.md`](../design/v1/quantization.md)

## Environment

Local development uses:

- Hardhat
- `@fhevm/hardhat-plugin` mock coprocessor (validates handles, ACL, and proofs; runs plaintext arithmetic)
- no Docker
- no local fhEVM node

That means:

- `npm test` works entirely in Hardhat
- the advisor and profiling scripts run locally
- real fhEVM / Sepolia validation is a separate workflow

## Install and build

Install dependencies:

```bash
npm install
```

Compile contracts:

```bash
npm run build
```

Direct Hardhat equivalent:

```bash
npx hardhat compile
```

## Run all tests

Run the complete local suite:

```bash
npm test
```

Equivalent:

```bash
npx hardhat test
```

Current expectation:

- all tests run in mock mode
- no extra environment variables are needed

## Run a specific test file

Marketplace unit tests:

```bash
npx hardhat test test/model_marketplace_chunked_test.ts
```

Marketplace + engine + oracle integration:

```bash
npx hardhat test test/registry_marketplace_oracle_test.ts
```

HEPRS-backed integration:

```bash
npx hardhat test test/heprs_fixture_test.ts
```

Standalone `BioETHPRS` tests:

```bash
npx hardhat test test/bioeth_prs_test.ts
```

Quantization advisor tests:

```bash
npx hardhat test test/quantization_advisor_test.ts
```

PRSComputeEngine chunked-SNP unit tests:

```bash
npx hardhat test test/prs_compute_engine_chunked_snp_test.ts
```

Scale ceiling reference tests:

```bash
npx hardhat test test/scale_ceiling_reference_test.ts
```

## Run a subset of tests by name

You can also filter with `--grep`:

```bash
npx hardhat test --grep "ModelMarketplace"
```

Example:

```bash
npx hardhat test test/heprs_fixture_test.ts --grep "1000-SNP"
```

## What each main test file covers

- `test/model_marketplace_chunked_test.ts`: focused `ModelMarketplace v1` unit coverage
- `test/prs_compute_engine_chunked_snp_test.ts`: focused `PRSComputeEngine` job shell and SNP upload coverage
- `test/registry_marketplace_oracle_test.ts`: cross-contract integration flow
- `test/heprs_fixture_test.ts`: copied HEPRS fixtures with fixed advisor recommendations
- `test/bioeth_prs_test.ts`: standalone `HEPRS.sol` prototype behavior
- `test/quantization_advisor_test.ts`: advisor ranking and CLI summary logic
- `test/scale_ceiling_reference_test.ts`: overflow quick-screen reference logic

## Run the quantization advisor

Primary command:

```bash
npm run advisor:quantization -- <weights.csv> [genotypes.csv]
```

Verbose mode:

```bash
npm run advisor:quantization -- <weights.csv> [genotypes.csv] --verbose
```

Write JSON output:

```bash
npm run advisor:quantization -- <weights.csv> [genotypes.csv] --out advisor-report.json
```

Direct script equivalent:

```bash
ts-node scripts/quantization_advisor.ts <weights.csv> [genotypes.csv]
```

Use the advisor when you want a candidate scale recommendation before model publication.

## Run the scale-ceiling reference

Quick overflow-screen reference:

```bash
npm run advisor:scale-ceilings
```

Direct script equivalent:

```bash
ts-node scripts/scale_ceiling_reference.ts
```

Use this for a simple scale-vs-SNP sanity screen. Use the quantization advisor for model-aware analysis.

## Run gas profiling

Default gas-profile run:

```bash
npm run profile:gas
```

Direct script equivalent:

```bash
npx hardhat run scripts/gas_profile.ts
```

Useful overrides:

```bash
SNP_COUNTS=100,500,1000,5000 CHUNK_SIZE=50 npx hardhat run scripts/gas_profile.ts
```

Environment variables:

- `SNP_COUNTS`: comma-separated SNP sizes
- `CHUNK_SIZE`: chunk size used for publication / compute profiling
- `GAS_PRICE_GWEI`: assumed gas price for ETH estimates
- `BLOCK_TIME_SEC`: assumed block time for timing estimates

## Run HEPRS fixture profiling

Default HEPRS run:

```bash
npm run profile:heprs
```

Profile one fixture:

```bash
npm run profile:heprs -- --fixture 1000
```

Verbose run:

```bash
npm run profile:heprs -- --fixture 5000 --chunk-size 128 --verbose
```

Write JSON output:

```bash
npm run profile:heprs -- --json-out /tmp/heprs-profile.json
```

Use this when you want local timing evidence on the copied HEPRS fixtures under the current mock-mode contract flow.

## Recommended workflow for a visiting engineer

1. Install and compile:

```bash
npm install
npm run build
```

1. Run the full local suite:

```bash
npm test
```

1. If working on the marketplace or PRS job lifecycle, start with:

```bash
npx hardhat test test/model_marketplace_chunked_test.ts
npx hardhat test test/prs_compute_engine_chunked_snp_test.ts
```

1. If working on end-to-end behavior, run:

```bash
npx hardhat test test/registry_marketplace_oracle_test.ts
npx hardhat test test/heprs_fixture_test.ts
```

1. If working on quantization choices, run:

```bash
npm run advisor:scale-ceilings
npm run advisor:quantization -- <weights.csv> [genotypes.csv]
```

1. If you need timing / feasibility evidence, run:

```bash
npm run profile:gas
npm run profile:heprs
```

## Notes

- The HEPRS integration tests use a fixed recommendation map in `test/utils/heprs.ts`; they do not rerun the advisor every time.
- The HEPRS profiling script should be rerun after major contract changes before its timing expectations are treated as current.
- Real fhEVM / Sepolia validation is not covered by this local runbook.
