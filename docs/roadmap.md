# Roadmap

## Completed

- All four production contracts: GenomicRegistry, ModelMarketplace, PRSComputeEngine, ResultOracle
- Standalone BioETHPRS (HEPRS.sol) for onboarding/comparison
- Chunked model publication (uploadChunkSize decoupled from computeChunkSize)
- Staged SNP ingestion state machine (PENDING → UPLOADING → READY → COMPUTING → DONE)
- V1 quantization correction: `(partialSum + scoreOffset) − (weightZeroPoint × genoSum)`
- On-chain noisy categorical release via `FHE.randEuint64(noiseUpperBound)` — removes zero-noise bypass
- `ResultOracle.expectedNoiseBias()` view — exposes `noiseUpperBound/2` for caller threshold adjustment
- Sample manifest hash anchor via `GenomicRegistry.registerSampleWithManifest`
- Registry ACL enforced at job creation
- Per-requester private model authorization
- `finalizeAndClassify` path — oracle-only finalization, no raw score exposed to requester
- ACL revocation mid-compute documented and tested
- 94 tests passing (mock FHE)
- HEPRS fixture profiling — all four fixture sizes (100/500/1000/5000) confirmed on-chain
- Mock HCU ceiling measured: 20 SNPs/tx (60-74 ops/tx budget)
- `appendAndComputeChunk` streaming path implemented — 37% gas savings vs classic
- Sepolia tooling ready: `deploy.ts`, `sepolia_validation.ts`, `probe_hcu_ceiling.ts`
- Gas cost and deployment viability analysis complete (see `reports/`)
- Per-model per-wallet and per-sample rate limiting — windowed block-based query limits (`setRateLimit`)
- Oracle-required mode — `setOracleRequired` blocks `finalize`/`finalizeTo`/`readPartial`, forcing the noisy oracle path
- Minimum threshold gap in `ResultOracle` — `highThreshold - lowThreshold >= noiseUpperBound`
- Bug fix: `finalizeAndClassify` now grants oracle ACL access before handoff (`FHE.allow(score, oracle)`)
- 116 tests passing (mock FHE)

---

## Active: Sepolia Deployment

Tooling is complete. Blocked on: testnet ETH + credentials.

```bash
npx hardhat vars set MNEMONIC
npx hardhat vars set SEPOLIA_RPC_URL   # optional; defaults to PublicNode
npx hardhat vars set INFURA_API_KEY    # optional alternative to SEPOLIA_RPC_URL
npm run deploy:sepolia
npm run validate:sepolia
npm run probe:hcu
```

After completion: update `reports/classic-gas.md` Sepolia table with real HCU ceiling and gas costs. Update `computeChunkSize` in new model shells if ceiling changes.

---

## Future Engineering

**Marketplace:**

- Model versioning and deprecation semantics
- ERC-20 fee mechanism (incentivize quality researchers)
- Commitment-based storage for very large models

**Job lifecycle:**

- Job cancellation (requester-initiated)
- Expiry for abandoned jobs (never `finalizeSnpUpload`)
- SNP reuse across models (sample-keyed storage instead of job-keyed)

**Anti-probing:**

- Formal ε-δ differential privacy: adjacency definition, PRS sensitivity analysis, calibrated two-sided noise, and composition accounting (the shipped mechanism is a bounded randomized release only)
- Staking/deposit mechanism as economic Sybil deterrent

**Quantization & types:**

- `euint16` intermediate accumulators (cheaper FHE ops for models with bounded weights)
- Decimal dosage support (imputed genotypes; requires dosage quantization)
- Threshold validation: `expectedNoiseBias()` now exposes the bias; tests should verify callers use it correctly

---

## Research / Paper Work

**Feasibility benchmark:**

- Mock baseline: ✓ (see `reports/classic-gas.md`, `reports/streaming-gas.md`, `reports/deployment-cost.md`)
- Real Sepolia: pending
- Cost estimate: ~$150 naive → ~$45 optimized (trivial encryption, larger chunks)

**Scientific validation:**

- De-quantization comparison: on-chain encoded score vs PLINK/PRSice reference
- Formal differential-privacy calibration, or empirical backing for the `noiseUpperBound` choice

**Security analysis:**

- Formalize threat model (who can learn what, under what assumptions)
- Prove or quantify how noisy categorical bucketing and rate limits affect weight extraction
- Analyze model probing attack surface (garbage SNP inputs)

**Cross-chain:**

- Evaluate Fhenix L2 and Inco Network as deployment targets
