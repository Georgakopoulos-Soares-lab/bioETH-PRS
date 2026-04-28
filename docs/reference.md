# Developer Reference

---

## Build & Test Commands

```bash
npm run build                    # hardhat compile (Solidity 0.8.24, evmVersion cancun)
npm run test                     # run all tests via mock coprocessor

# Run specific test files
npx hardhat test test/prs_compute_engine_chunked_snp_test.ts
npx hardhat test test/registry_marketplace_oracle_test.ts
npx hardhat test test/heprs_fixture_test.ts
npx hardhat test test/rate_limit_dp_test.ts

# Full offline validation bundle (build + test + profile + advisors)
npm run validate:local
```

No Docker required. The `@fhevm/hardhat-plugin` deploys a mock coprocessor in-process.

---

## Profiling

```bash
npm run profile:gas              # gas vs SNP-count curve (synthetic data)
npm run profile:heprs            # HEPRS fixture timing + gas (real GWAS data, computeChunkSize=20)
```

Override defaults with environment variables:

```bash
COMPUTE_CHUNK_SIZE=20 npm run profile:gas
UPLOAD_CHUNK_SIZE=32 COMPUTE_CHUNK_SIZE=20 npm run profile:heprs
```

The HEPRS fixture profiler runs 100/500/1000/5000 SNP sizes and reports per-phase timing and gas breakdown.

---

## Quantization Advisor

Run before publishing any new model to validate scale choices and check for overflow:

```bash
npm run advisor:quantization BETA_FILE.csv GENOTYPE_FILE.csv
```

Or for the built-in HEPRS fixtures:

```bash
npm run advisor:quantization     # uses bundled HEPRS fixture data
npm run advisor:scale-ceilings   # quick uint64 overflow screen table
```

**Output:** Three recommendations (`baseline`, `balanced`, `max_precision`) with `weightScale`, `weightZeroPoint`, `scoreOffset`, `rawMin`, `rawMax`, `encodedRange`, and whether `euint64` is sufficient.

**Default choice:** `balanced` (scale ~10⁶) — effectively machine-epsilon error on HEPRS fixtures, well within uint64 bounds at 5,000 SNPs.

The advisor is a decision-support tool, not a mandatory gate. The bottleneck on cost is SNP upload count, not scale choice.

---

## Chunk Size Quick Reference

| Parameter | Value | Constraint | Notes |
|---|---|---|---|
| `uploadChunkSize` | **32** | fhEVM input-proof budget: 2048 bits / 64 bits per euint64 | Same on mock and Sepolia |
| `computeChunkSize` | **20** (mock) | Mock HCU ~60-74 ops/tx; each SNP = 3 ops | Sepolia ceiling unknown — run `probe:hcu` |
| Private model upload | **≤ 32** | Same input-proof budget | Public model upload has no practical limit |

The two chunk sizes are independent. Upload uses 32-value batches; compute uses 20-value slices. Both index into the same flat storage array.

For a 100-SNP model:

- Upload transactions: `ceil(100/32) = 4`
- Compute transactions: `ceil(100/20) = 5`

---

## Scale & Overflow Quick Screen

The safe condition is: `encoded_range ≤ 2^64 - 1` (~1.8 × 10¹⁹), where:

```
encoded_range = raw_max - raw_min
raw_max = Σ(2 × max(qᵢ, 0))
raw_min = Σ(2 × min(qᵢ, 0))
```

Quick reference using the simplified bound `scale × 2 × N ≤ uint64_max` (assumes all weights have magnitude ≤ 1):

| Scale | Max safe SNPs |
|---|---|
| 10² | 9.2 × 10¹⁶ (no constraint in practice) |
| 10⁴ | 9.2 × 10¹⁴ |
| 10⁶ | 9.2 × 10¹² |
| 10⁸ | 9.2 × 10¹⁰ |
| 10¹⁰ | 9.2 × 10⁸ |
| 10¹² | 921,000 |

At balanced scale ~10⁶ and 5,000 SNPs: max accumulation ~10¹³ ✓

Use `npm run advisor:quantization` for exact bounds from the actual weight distribution. The simplified table is a quick screen, not a final safety proof.

---

## Validation Tiers

| Tier | Environment | FHE | What it validates |
|---|---|---|---|
| **1 — Mock** | Hardhat + `@fhevm/hardhat-plugin` | Plaintext arithmetic | Protocol correctness: handles, ACL, proofs, state machines, quantization math |
| **2 — Sepolia** | Sepolia testnet + Zama coprocessor | Real TFHE | Gas costs, real HCU ceiling, KMS decryption round-trip, real ciphertext handling |
| **3 — Docker devnet** | Local Zama devnet | Real TFHE | (Not currently available in this repo) |

**Recommendation:** Tier 1 (mock) for correctness; Tier 2 (Sepolia) for performance claims in the paper. All 94 tests pass on Tier 1. Tier 2 is pending.

**What mock validates:**

- Correct dot-product results at 100/500/1000 SNPs
- ACL enforcement at job creation
- State machine transitions (PENDING → UPLOADING → READY → COMPUTING → DONE)
- Quantization correction formula
- Oracle noise generation and classification
- Per-requester private model authorization

**What mock cannot validate:**

- Real gas costs (coprocessor precompile pricing differs)
- Real HCU ceiling (mock allows 20 SNPs/tx; Sepolia may allow more)
- KMS round-trip latency for user decryption
- Whether real TFHE ciphertexts are handled correctly end-to-end

---

## Sepolia Deployment

### Prerequisites

```bash
npx hardhat vars set MNEMONIC          # deployer wallet mnemonic
npx hardhat vars set SEPOLIA_RPC_URL   # optional; defaults to PublicNode
npx hardhat vars set INFURA_API_KEY    # optional alternative to SEPOLIA_RPC_URL
```

Deployer wallet needs Sepolia ETH. Estimate ~0.05-0.1 ETH for deploy + 100-SNP validation.

### Execution

```bash
npm run build                          # compile first
npm run deploy:sepolia                 # deploys GenomicRegistry, ModelMarketplace,
                                       # PRSComputeEngine, ResultOracle in dependency order
npm run validate:sepolia               # 100-SNP HEPRS fixture end-to-end
npm run probe:hcu                      # find real HCU ceiling → update computeChunkSize
```

### Decryption differences

On mock, tests use `debugDecryptEuint64(handle)` — direct plaintext bypass, ~0 ms.

On Sepolia, decryption requires a KMS re-encryption round-trip:

```typescript
const decryptedValue = await userDecryptEuint(handle, contractAddress, signer);
```

This is async and takes seconds. The `sepolia_validation.ts` script handles the wait automatically.

### After deployment

1. Record deployed contract addresses
2. Run `npm run probe:hcu` and note the real `computeChunkSize` ceiling
3. Update `computeChunkSize` in any new `createModelShell` calls accordingly
4. Fill in the "Sepolia" column in `reports/classic-gas.md`
5. Add a `§ Sepolia Validation` section to `reports/classic-gas.md` with full results

### Troubleshooting

| Error | Likely cause | Fix |
|---|---|---|
| `HCUTransactionLimitExceeded` | `computeChunkSize` too large | Lower it; run `probe:hcu` |
| `No registry access` | Sample ACL not set | Call `grantAccess` before `createPRSJob` |
| `Model not finalized` | Forgot `finalizeModel` | Call `finalizeModel(modelId)` |
| `Not authorized for private model` | Missing reader auth | Call `setPrivateModelReader(modelId, requester, true)` |
| Decryption times out | KMS round-trip | Increase timeout in test/script; Sepolia KMS can take 10-30s |
