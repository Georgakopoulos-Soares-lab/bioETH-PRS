# Calculated fee examples

Each **calculated fee example** multiplies measured gas from local simulation by a stated gas
price. It is not an observed network cost. No USD conversion is provided because there is no
documented production fee schedule.

| Quantity | Source gas | 0.01 gwei | 0.1 gwei | 1 gwei | 10 gwei | 30 gwei |
|---|---:|---:|---:|---:|---:|---:|
| Four-contract deployment | 5,892,613 | 0.00005892613 | 0.0005892613 | 0.005892613 | 0.05892613 | 0.17677839 |
| Streaming method, public-weight 100-SNP calculation, excluding deployment | 11,690,021 | 0.00011690021 | 0.0011690021 | 0.011690021 | 0.11690021 | 0.35070063 |
| Streaming method, private-weight 100-SNP calculation, excluding deployment | 23,507,880 | 0.0002350788 | 0.002350788 | 0.02350788 | 0.2350788 | 0.7052364 |

All table values are ETH and use `fee = measured gas × stated gas price`. They are not observed
network costs, production prices, or evidence of affordability.
