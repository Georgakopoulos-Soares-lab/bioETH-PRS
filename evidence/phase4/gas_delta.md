# Phase 4 gas delta — attributed by phase

Three measurements of `scripts/gas_profile.ts`, all Hardhat mock, node v22.23.1:

- **baseline** — `evidence/baseline/wide/gas_profile.txt`, pre-Phase-2, equivalent to the
  submitted manuscript's configuration (zero manifest hashes).
- **afterP2** — `evidence/phase2/gas_profile_after.txt`, release policy shipped.
- **afterP4** — `evidence/phase4/gas_profile_after.txt`, real provenance hashes shipped.

Attribution matters: Phase 2 moved several figures by a few tens of gas through Solidity
selector-dispatch reordering, and Phase 4 moves `Model publish gas` materially by storing
two nonzero `bytes32` values where zeros were stored before. Reporting a single combined
delta would conflate the two.

| Metric | SNPs | Baseline | After P2 | After P4 | P2 delta | P4 delta | P4 % |
|---|---:|---:|---:|---:|---:|---:|---:|
| Model publish gas | 100 | 1,084,966 | 1,084,966 | 1,125,534 | +0 | +40568 | +3.739% |
| Job create gas | 100 | 301,248 | 301,270 | 301,270 | +22 | +0 | +0.000% |
| SNP upload gas | 100 | 10,287,899 | 10,287,793 | 10,287,781 | -106 | -12 | -0.000% |
| Compute gas | 100 | 5,626,216 | 5,626,326 | 5,626,326 | +110 | +0 | +0.000% |
| Finalize gas | 100 | 186,964 | 186,998 | 186,998 | +34 | +0 | +0.000% |
| Total gas | 100 | 17,487,293 | 17,487,353 | 17,527,909 | +60 | +40556 | +0.232% |
| Model publish gas | 300 | 2,646,740 | 2,646,740 | 2,687,308 | +0 | +40568 | +1.533% |
| Job create gas | 300 | 301,248 | 301,270 | 301,270 | +22 | +0 | +0.000% |
| SNP upload gas | 300 | 30,556,124 | 30,556,438 | 30,556,294 | +314 | -144 | -0.000% |
| Compute gas | 300 | 16,808,136 | 16,808,466 | 16,808,466 | +330 | +0 | +0.000% |
| Finalize gas | 300 | 186,964 | 186,998 | 186,998 | +34 | +0 | +0.000% |
| Total gas | 300 | 50,499,212 | 50,499,912 | 50,540,336 | +700 | +40424 | +0.080% |
| Model publish gas | 600 | 4,989,383 | 4,989,383 | 5,029,939 | +0 | +40556 | +0.813% |
| Job create gas | 600 | 301,248 | 301,270 | 301,270 | +22 | +0 | +0.000% |
| SNP upload gas | 600 | 61,097,017 | 61,097,217 | 61,097,265 | +200 | +48 | +0.000% |
| Compute gas | 600 | 33,581,016 | 33,581,676 | 33,581,676 | +660 | +0 | +0.000% |
| Finalize gas | 600 | 186,964 | 186,998 | 186,998 | +34 | +0 | +0.000% |
| Total gas | 600 | 100,155,628 | 100,156,544 | 100,197,148 | +916 | +40604 | +0.041% |
