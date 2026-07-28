# Phase 2 gas delta

Baseline: `evidence/baseline/wide/gas_profile.txt` (pre-Phase-2, commit `b0c86a4`).
After: `evidence/phase2/gas_profile_after.txt`.
Both Hardhat mock, node v22.23.1, `scripts/gas_profile.ts`, synthetic SNPs.

Note: this script publishes models WITHOUT a release policy, so `Model publish gas`
excludes the one-time `setReleasePolicy` transaction a real deployment would add.

| Metric | SNPs | Before | After | Delta | % |
|---|---:|---:|---:|---:|---:|
| Model publish gas | 100 | 1,084,966 | 1,084,966 | +0 | +0.0000% |
| Job create gas | 100 | 301,248 | 301,270 | +22 | +0.0073% |
| SNP upload gas | 100 | 10,287,899 | 10,287,793 | -106 | -0.0010% |
| Compute gas | 100 | 5,626,216 | 5,626,326 | +110 | +0.0020% |
| Finalize gas | 100 | 186,964 | 186,998 | +34 | +0.0182% |
| Total gas | 100 | 17,487,293 | 17,487,353 | +60 | +0.0003% |
| Model publish gas | 300 | 2,646,740 | 2,646,740 | +0 | +0.0000% |
| Job create gas | 300 | 301,248 | 301,270 | +22 | +0.0073% |
| SNP upload gas | 300 | 30,556,124 | 30,556,438 | +314 | +0.0010% |
| Compute gas | 300 | 16,808,136 | 16,808,466 | +330 | +0.0020% |
| Finalize gas | 300 | 186,964 | 186,998 | +34 | +0.0182% |
| Total gas | 300 | 50,499,212 | 50,499,912 | +700 | +0.0014% |
| Model publish gas | 600 | 4,989,383 | 4,989,383 | +0 | +0.0000% |
| Job create gas | 600 | 301,248 | 301,270 | +22 | +0.0073% |
| SNP upload gas | 600 | 61,097,017 | 61,097,217 | +200 | +0.0003% |
| Compute gas | 600 | 33,581,016 | 33,581,676 | +660 | +0.0020% |
| Finalize gas | 600 | 186,964 | 186,998 | +34 | +0.0182% |
| Total gas | 600 | 100,155,628 | 100,156,544 | +916 | +0.0009% |
