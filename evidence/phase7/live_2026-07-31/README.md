# Public Sepolia 100-SNP result

## What was evaluated

Four bioETH-PRS contracts were deployed on Sepolia, chain ID `11155111`. A public-weight 100-SNP
model and one individual were evaluated using live FHE services. The decoded result was compared
with the independent expected score.

## Results

| Quantity | Sepolia result |
|---|---:|
| Deployment transactions | 4 |
| Deployment gas | 5,892,559 |
| Public-weight calculation transactions | 25 |
| Public-weight calculation gas | 20,710,271 |
| Input preparation | 66,101 ms |
| Submission to result | 269,320 ms |
| Total elapsed time | 464,253 ms |
| User decryption | 8,081 ms |
| Decoded / expected score | 758,685 / 758,685 |

Sepolia records confirm that all four deployment transactions and all 25 calculation transactions
succeeded. The recorded contracts match those deployed on Sepolia. Sepolia ETH does not represent
a production price.

The private-weight calculation was evaluated only in local simulation, not on Sepolia.

## What the results mean

This result supports the public-weight 100-SNP calculation on Sepolia. It does not establish a
private-weight calculation on Sepolia or a production cost.

## Supporting data

The transaction receipts, contract addresses, gas values, and timing records are retained with
the study materials. The table above gives the values used in the manuscript and reviewer response.
