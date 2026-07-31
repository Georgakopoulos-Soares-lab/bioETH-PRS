# Phase 8 measured transaction use

- Action: `R1.8-E1`
- Evidence classes: **Live fhEVM** and **Hardhat mock**
- Live scope: four-contract Sepolia deployment plus one public 100-SNP classic-path job.
- Private-weight live behavior, production fees, and USD cost: **unavailable**.

## Live Sepolia observations

| Operation | Visibility / path | Transactions | Gas | Sepolia test-ETH fee | Timing / result |
|---|---|---:|---:|---:|---|
| Four-contract deployment | shared | 4 | 5,892,559 | 0.006278171412391863 ETH | blocks 11388858–11388861 |
| Full 100-SNP job | public classic | 25 | 20,710,271 | 0.025274764801306197 ETH | 464.3 s; decoded 758685 |
| User decryption | public Gateway/KMS | 0 on-chain | n/a | included above | 8081 ms |

Sepolia test ETH has no production-price interpretation. The successful live run is one
100-SNP point, not evidence of genome-wide scale or private-weight live execution.
The geometry-matched public mock also used 25 transactions and 18,755,864 gas; the live total was 10.42% higher. This single pair does not support a general live/mock conversion factor.

## Hardhat-mock observations

| Operation | Visibility / path | Transactions | Observed host gas | Reporting note |
|---|---|---:|---:|---|
| Four-contract deployment | shared | 4 | 5,892,613 | exact mock observation |
| Model publication | public | 6 | 1,169,682 | includes real provenance hashes |
| Model publication | private | 8 | 10,687,063 | includes two reader-authorisation transactions |
| Sample registration | public / private | 1 | ~115,000 | encrypted/calldata totals are rounded |
| Job creation | public | 1 | 321,170 | mock observation |
| Job creation | private | 1 | 326,695 | mock observation |
| Streaming upload + compute | public | 6 | 9.914 M | encrypted calldata; rounded |
| Streaming upload + compute | private | 6 | 12.209 M | encrypted calldata; rounded |
| Raw-score finalization | raw result | 1 | 169,898 | Phase 7 workflow |
| Randomized-category finalization | categorical result | 1 | 432,230 | separate Phase 2 measurement; replaces raw finalization |
| User decryption | mock debugger | 0 on-chain | n/a | public live Gateway/KMS latency is reported separately above |
| **Full 100-SNP job** | **public** | **15** | **11.690 M** | deployment excluded |
| **Full 100-SNP job** | **private** | **17** | **23.508 M** | deployment excluded |

A release-policy configuration adds one transaction and 77,314 mock gas per model. It is not included in the Phase 7 raw-score totals above.

The Phase 7 prose totals differ from the authoritative JSON component sums by 12 gas for
each visibility. The discrepancy vanishes at the required precision and is recorded as
`CD-025`; no exact total-gas claim should be copied from prose.

Machine-readable source: `measured_transaction_use.json`. Fee arithmetic is deliberately
separate in `fee_sensitivity.json` / `fee_sensitivity.md`.
