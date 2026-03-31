# Gas Profiling — bioETH PRS

Run gas profiling for PRS computation and interpret the results.

## Steps

1. First make sure contracts are compiled:
```sh
npm run build
```

2. Run the default gas profiling script (SNP counts: 100, 300, 600 — mock FHE mode, no external node needed):
```sh
npx hardhat run scripts/gas_profile.ts
```

Or with custom parameters:
```sh
SNP_COUNTS="100,300,600,1000,5000" CHUNK_SIZE=100 GAS_PRICE_GWEI=30 npx hardhat run scripts/gas_profile.ts
```

3. For HEPRS fixture timing (per-phase and per-chunk breakdown):
```sh
npm run profile:heprs
```

## Interpreting Results

For each SNP count you will see:
- **Model list gas** — cost to publish the GWAS weight chunks
- **Start gas** — cost of `createPRSJob` + `appendSnpChunk` + `finalizeSnpUpload`
- **Compute gas** — total across all `computeChunk` calls (dominant cost)
- **Total gas** and **Estimated ETH** at the given gas price

**Key questions to answer:**
- Is compute gas growing linearly with SNP count? (Expected: yes — each SNP = 1 `mulPlain` or `mul` + 1 `add`)
- What is the marginal gas cost per SNP?
- At what SNP count does a single run exceed the $45 target? (At 30 gwei, $45 ≈ 150M gas)
- Does changing chunk size significantly affect total gas?

## Optimization Levers

If costs are too high, suggest in order of impact:
1. **Switch to public model weights** — `mulPlain` (C×P) is ~60% cheaper than `mul` (C×C)
2. **Reduce scaling factor** — smaller integers may reduce FHE op cost
3. **Adjust chunk size** — find the sweet spot between per-chunk overhead and gas limit per block
4. **Bit-depth optimization** (planned) — `euint16` intermediates instead of `euint64` throughout
5. **SIMD/slot packing** (planned) — multiple SNPs per ciphertext

## Targets

| Mode | Target cost per run |
|---|---|
| Naive FHE (C×C, private weights) | ~$150 |
| Optimized (C×P, public weights) | ~$45 |

## Reference

See [docs/reference/development-workflows.md](../../docs/reference/development-workflows.md) for the full workflow guide and [.github/skills/gas-profile/SKILL.md](../../.github/skills/gas-profile/SKILL.md) for the detailed skill definition.
