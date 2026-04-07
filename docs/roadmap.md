# Roadmap

## Completed

- All four production contracts: GenomicRegistry, ModelMarketplace, PRSComputeEngine, ResultOracle
- Standalone BioETHPRS (HEPRS.sol) for onboarding/comparison
- Chunked model publication (uploadChunkSize decoupled from computeChunkSize)
- Staged SNP ingestion state machine (PENDING → UPLOADING → READY → COMPUTING → DONE)
- V1 quantization correction: `(partialSum + scoreOffset) − (weightZeroPoint × genoSum)`
- On-chain DP noise via `FHE.randEuint64(noiseUpperBound)` — removes zero-noise bypass
- `ResultOracle.expectedNoiseBias()` view — exposes `noiseUpperBound/2` for caller threshold adjustment
- Registry ACL enforced at job creation
- Per-requester private model authorization
- `finalizeAndClassify` path — oracle-only finalization, no raw score exposed to requester
- ACL revocation mid-compute documented and tested
- 83 tests passing (mock FHE)
- HEPRS fixture profiling (100/500/1000 SNPs on-chain; 5000 off-chain)
- Mock HCU ceiling measured: 20 SNPs/tx (60–74 ops/tx budget)
- Sepolia tooling ready: `deploy.ts`, `sepolia_validation.ts`, `probe_hcu_ceiling.ts`

---

## Active: Sepolia Deployment

Tooling is complete. Blocked on: testnet ETH + credentials.

```bash
npx hardhat vars set MNEMONIC
npx hardhat vars set INFURA_API_KEY
npm run deploy:sepolia
npm run validate:sepolia
npm run probe:hcu
```

After completion: update `docs/findings.md` with real HCU ceiling and gas costs. Update `computeChunkSize` in new model shells if ceiling changes.

---

## Future Engineering

**Marketplace:**
- Model versioning and deprecation semantics
- ERC-20 fee mechanism (incentivize quality researchers)
- Commitment-based storage for very large models

**Job lifecycle:**
- Job cancellation (requester-initiated)
- Expiry for abandoned jobs (never `finalizeSnpUpload`)
- `JobFinalized` event for off-chain indexers

**Quantization & types:**
- `euint16` intermediate accumulators (cheaper FHE ops for models with bounded weights)
- Decimal dosage support (imputed genotypes; requires dosage quantization)
- Threshold validation: `expectedNoiseBias()` now exposes the bias; tests should verify callers use it correctly

---

## Research / Paper Work

**Feasibility benchmark:**
- Mock baseline: ✓ (see `docs/findings.md`)
- Real Sepolia: pending
- Cost estimate: ~$150 naive → ~$45 optimized (trivial encryption, larger chunks)

**Scientific validation:**
- De-quantization comparison: on-chain encoded score vs PLINK/PRSice reference
- DP calibration: empirical backing for `noiseUpperBound` choice

**Security analysis:**
- Formalize threat model (who can learn what, under what assumptions)
- Prove DP noise calibration + categorical bucketing prevent weight extraction
- Analyze model probing attack surface (garbage SNP inputs)

**Cross-chain:**
- Evaluate Fhenix L2 and Inco Network as deployment targets
