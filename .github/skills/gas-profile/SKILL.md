---
name: gas-profile
description: "Run gas profiling for PRS computation, analyze gas costs per SNP count, and suggest optimizations. Use when benchmarking, optimizing gas, comparing chunk sizes, or preparing cost analysis data."
---
# Gas Profiling for bioETH PRS

## When to Use

- Benchmarking gas costs at different SNP counts
- Comparing gas between public vs private model weights
- Evaluating optimal chunk sizes
- Generating data for the "Gas vs SNP Count" curve
- Estimating per-run cost in ETH at a given gas price

## Prerequisites

- Node.js 20+ and `npm install` done
- Contracts compiled (`npm run build`)
- The script runs against the Hardhat mock by default — no external node needed for mock-mode profiling
- For real-FHE gas figures: Sepolia testnet access (see README)

## Procedure

### 1. Run the profiling script

```sh
# Default: SNP counts [100, 300, 600], computeChunkSize=20, gas price 30 gwei
npx hardhat run scripts/gas_profile.ts

# Custom parameters via environment variables
SNP_COUNTS="100,300,600,1000" COMPUTE_CHUNK_SIZE=20 GAS_PRICE_GWEI=30 npx hardhat run scripts/gas_profile.ts
```

Environment variables accepted by [gas_profile.ts](../../../scripts/gas_profile.ts):
- `SNP_COUNTS` — comma-separated list of SNP vector sizes to profile
- `COMPUTE_CHUNK_SIZE` — SNPs per `computeChunk` call (default: 20; mock HCU ceiling is 20)
- `GAS_PRICE_GWEI` — gas price for ETH cost estimation (default: 30)
- `BLOCK_TIME_SEC` — assumed block time for wall-time estimation (default: 12)

### 2. Interpret the output

Each SNP count produces:
- **Model list gas**: Cost to store the model weights
- **Start gas**: Cost of `createPRSJob()` + `appendSnpChunk()` + `finalizeSnpUpload()`
- **Compute gas**: Total gas across all `computeChunk()` calls (the dominant cost)
- **Total gas**: Sum of all operations
- **Estimated ETH**: Total gas × gas price

### 3. Analyze results

Key questions to answer:
- Is gas growth linear in SNP count? (Expected: yes, since each SNP = 1 trivial-encrypt + 1 `mul` + 1 `add`)
- What is the per-SNP marginal gas cost?
- At what SNP count does a single run exceed the target budget (~$45)?
- Does chunk size significantly affect total gas? (Overhead per chunk vs amortization)

### 4. Optimization levers

If gas costs are too high:
1. **Use public models** (`FHE.mul(snp, FHE.asEuint64(weight))` C×P instead of C×C) — ~60% savings per multiplication
2. **Reduce scaling factor** — smaller integers = potentially cheaper FHE ops
3. **Bit-depth optimization** (planned) — use `euint16` intermediates where possible
4. **SIMD/slot packing** (planned) — batch multiple SNPs per ciphertext
5. **Adjust chunk size** — find the sweet spot between per-chunk overhead and gas limit

## Target Metrics

- Naive FHE: ~$150 per run
- Optimized target: ~$45 per run
- Target SNP counts to profile: 100, 300, 600, 1000, 5000
