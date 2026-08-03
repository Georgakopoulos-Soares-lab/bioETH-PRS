# Sepolia and local contract results

## What was evaluated

Four contracts were deployed on Sepolia. One public-weight 100-SNP calculation was then completed
using the fhEVM services and user decryption. Public-weight and private-weight 100-SNP
calculations were also evaluated in the local simulation.

## Results

| Setting | Model | Calculation method | Transactions | Gas | Decoded / expected score |
|---|---|---|---:|---:|---:|
| Public Sepolia | Public-weight | Classic method (stored inputs), 10 variants per step | 25 | 20,710,271 | 758,685 / 758,685 |
| Local simulation | Public-weight | Classic method (stored inputs), 20 variants per step | 20 | 17,978,392 | 758,685 / 758,685 |
| Local simulation | Private-weight | Classic method (stored inputs), 20 variants per step | 22 | 29,797,241 | 758,685 / 758,685 |

The Sepolia deployment used four transactions and 5,892,559 gas. For the public-weight Sepolia
calculation, submission to result took 269,320 ms and user decryption took 8,081 ms. Sepolia
records confirm that all 25 calculation transactions and all four deployment transactions
succeeded.

The private-weight calculation was evaluated only in local simulation, not on Sepolia.

## What the results mean

The public-weight 100-SNP calculation is supported by a successful Sepolia result that matches
the independent calculation exactly. The private-weight result supports contract behavior only
in local simulation; it does not show private-weight speed, gas, or behavior on Sepolia.

The largest group processed in one local calculation step contained 21 positions for both
public-weight and private-weight models. This local limit is not a Sepolia measurement.

The contracts process larger models in repeated groups and do not impose a fixed 100-variant
model limit. Streaming calculations at 100, 500, 1,000, and 5,000 variants were evaluated only
in the local simulation. No new Sepolia Streaming transaction or result is reported, so the
completed Sepolia result remains the 100-variant Classic calculation above.

## Supporting data

- [Public Sepolia calculation](live_2026-07-31/README.md)
- [Local public-weight and private-weight calculations](readiness_2026-07-31_final/README.md)
- [Sepolia Streaming calculation status](../sepolia_streaming_2026-08-01/README.md)
