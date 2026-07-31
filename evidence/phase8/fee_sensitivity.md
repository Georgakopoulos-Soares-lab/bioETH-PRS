# Phase 8 fee sensitivity

- Action: `R1.8-E1`
- Evidence class: **Analytic projection**
- Status: **unexecuted arithmetic**
- USD conversion: **not provided** — no current production fee schedule was documented.

| Quantity | Source gas | 0.01 gwei | 0.1 gwei | 1 gwei | 10 gwei | 30 gwei |
|---|---:|---:|---:|---:|---:|---:|
| four-contract deployment | 5,892,613 | 0.00005892613 | 0.0005892613 | 0.005892613 | 0.05892613 | 0.17677839 |
| public 100-SNP job, excluding deployment | 11,690,021 | 0.00011690021 | 0.0011690021 | 0.011690021 | 0.11690021 | 0.35070063 |
| private 100-SNP job, excluding deployment | 23,507,880 | 0.0002350788 | 0.002350788 | 0.02350788 | 0.2350788 | 0.7052364 |

All scenario cells are ETH and use `fee = gas × hypothetical gas price`. They are sensitivity
calculations from Hardhat-mock gas, not production prices or evidence of affordability.
