# TODO

## Current State

77 tests pass. Contracts compile against `@fhevm/solidity` and run identically on
the local mock coprocessor and on Sepolia. All core engineering work is complete.
The remaining priority is to execute the Sepolia deployment and record real-FHE
results.

Implemented and tested:

- All four contracts: `GenomicRegistry`, `ModelMarketplace`, `PRSComputeEngine`, `ResultOracle`
- Standalone `BioETHPRS` (`HEPRS.sol`)
- Chunked model publication lifecycle and staged SNP ingestion state machine
- V1 quantization correction: `(weighted_sum + scoreOffset) - (weightZeroPoint × genoSum)`
- `ResultOracle` on-chain DP noise via `FHE.randEuint64(noiseUpperBound)`; threshold sanity check (`low < high`)
- Upload and compute chunk sizes decoupled: `uploadChunkSize=32`, `computeChunkSize=20`; private models capped at `uploadChunkSize=32`
- Flat weight and SNP storage; `getPublicWeightChunk` slices by `computeChunkSize`
- Registry ACL enforced at `createPRSJob`; per-requester private model authorization; permissionless `computeChunk` relay documented
- Mock HCU ceiling confirmed at 20 SNPs/tx (60-74 ops/tx budget); real Sepolia ceiling TBD
- `reports/mock-validation-findings.md` — 100-SNP end-to-end PASS, gas/timing baseline
- Sepolia tooling complete: `deploy.ts`, `sepolia_validation.ts`, `probe_hcu_ceiling.ts`

---

## Active Work

### Sepolia deployment

Tooling is complete. This item requires credentials and testnet ETH to execute.

Pre-flight (see `docs/reference/sepolia-deployment.md`):

- Obtain Sepolia ETH (~0.2 ETH covers deploy + validation + HCU probe)
- `npx hardhat vars set MNEMONIC`
- `npx hardhat vars set INFURA_API_KEY`

Execution sequence:

```bash
npm run deploy:sepolia       # deploy all 4 contracts → deployments/sepolia.json
npm run validate:sepolia     # 100-SNP HEPRS fixture end-to-end with real TFHE ciphertext
npm run probe:hcu            # find real Sepolia computeChunkSize ceiling
```

After runs complete:

- Fill in "Sepolia observed" column in `docs/architecture-roadmap.md §7-I`
- Create `reports/sepolia-validation-findings.md` with gas and timing data
- Update `computeChunkSize` defaults in scripts if the real ceiling differs from 20
- Update `docs/design/snp-ingestion.md` "Chunk-size constraints" with the real ceiling

---

## Future Engineering

These items are not blocking any current work. Pick them up after Sepolia results
are in hand, or when the paper needs evidence for a specific claim.

### Marketplace

- Model versioning and deprecation semantics
- Pricing and fee mechanics (decide whether in scope)
- Commitment-based weight storage as an alternative to full on-chain storage

### Job lifecycle

- Job cancellation and cleanup for incomplete uploads
- Expiry semantics for stale jobs

### Quantization and type strategy

- Measure scale choice vs. MSE tradeoff with real weight distributions
- Evaluate whether `euint64` accumulators are too conservative once Sepolia gas costs
  are known; consider `euint16` weights or narrower intermediates
- Validate encoded thresholds for `ResultOracle` against real score distributions

---

## Research / Paper Work

### Feasibility benchmark

- Produce a clean benchmark story for mock and real fhEVM across all phases:
  model publication, SNP ingestion, chunked compute, finalize / output path
- Mock baseline exists in `reports/heprs-fixture-findings.md` and `reports/mock-validation-findings.md`
- Real Sepolia numbers are the missing piece

### Scientific validation

- Compare de-quantized on-chain outputs against PLINK / PRSice reference
- Quantify MSE, rank correlation, and AUC across HEPRS fixtures
- Cross-check formula against HEPRS paper Python reference with the same betas and genotypes

### Differential privacy calibration

- Calibrate `noiseUpperBound` against real score distributions
- Formal DP analysis: uniform vs. Laplacian noise, query budget, epsilon calibration
- Default `noiseUpperBound = 1_048_576` in `deploy.ts` needs empirical backing before
  model-extraction resistance claims can be made

### Security analysis

- Formalize threat model: model extraction, repeated queries, noisy categorical release,
  sample access abuse
- Document which protections are implemented, which are assumed, and which are future work
