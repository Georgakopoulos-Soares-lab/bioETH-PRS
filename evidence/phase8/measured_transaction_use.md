# Transaction use

The tables separate **public Sepolia** measurements from a **local contract simulation**. The
local results do not measure live network time or production cost. The private-weight
calculation was evaluated only in local simulation, not on Sepolia.

The contracts can process a larger model through repeated groups, but the Streaming calculations
at all four sizes were evaluated only in the local simulation. This document therefore contains
no Sepolia Streaming gas, time, or score row.

## Public Sepolia

| Operation | Model | Transactions | Gas | Sepolia ETH fee | Time or result |
|---|---|---:|---:|---:|---|
| Four-contract deployment | Shared | 4 | 5,892,559 | 0.006278171412391863 ETH | completed |
| Classic method (stored inputs), full 100-SNP calculation | Public-weight | 25 | 20,710,271 | 0.025274764801306197 ETH | 269.3 s from submission to result; 8.1 s decryption; decoded 758,685 |
| User decryption | Public-weight | 0 on-chain | n/a | included above | 8.1 s |

Sepolia ETH has no production-price interpretation. The same public-weight calculation, using
the Classic method and the same 25-transaction arrangement in local simulation, used 18,755,864
gas. The Sepolia total was 10.42% higher in this comparison, which does not provide a general
conversion between local and Sepolia gas.

## Local simulation

The local calculations below used the **Streaming method**.

| Operation | Model | Transactions | Local gas | Note |
|---|---|---:|---:|---|
| Four-contract deployment | Shared | 4 | 5,892,613 | local measurement |
| Model publication | Public-weight | 6 | 1,169,682 | includes the model record |
| Model publication | Private-weight | 8 | 10,687,063 | includes records stating who may calculate and receive the result |
| Sample registration | Public-weight / private-weight | 1 | ~115,000 | encrypted-data total rounded |
| Calculation creation | Public-weight | 1 | 321,170 | local measurement |
| Calculation creation | Private-weight | 1 | 326,695 | local measurement |
| Streaming method: upload and calculation | Public-weight | 6 | 9.914 M | encrypted-data total rounded |
| Streaming method: upload and calculation | Private-weight | 6 | 12.209 M | encrypted-data total rounded |
| Return raw score | Raw result | 1 | 169,898 | local measurement |
| Return category with random addition | Category | 1 | 432,230 | used instead of returning a raw score |
| **Streaming method, full 100-SNP calculation** | **Public-weight** | **15** | **11.690 M** | deployment excluded |
| **Streaming method, full 100-SNP calculation** | **Private-weight** | **17** | **23.508 M** | deployment excluded |

Storing the result categories uses one transaction and 77,314 gas in local simulation. It is not
included in the raw-score totals above.

The [calculated fee examples](fee_sensitivity.md) use the local gas values reported above. The
[Sepolia Streaming calculation status](../sepolia_streaming_2026-08-01/README.md) records why no
new live result is included.
