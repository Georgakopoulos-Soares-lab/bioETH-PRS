# Local public-weight and private-weight 100-SNP results

## What was evaluated

The public-weight and private-weight calculations were evaluated with the same 100-SNP data and
the same independent expected score using the **Classic method (stored inputs)** in local
simulation. No public network was contacted.

## Results

| Model | Transactions | Local gas | Decoded / expected score |
|---|---:|---:|---:|
| Public-weight | 20 | 17,978,392 | 758,685 / 758,685 |
| Private-weight | 22 | 29,797,241 | 758,685 / 758,685 |

The local deployment used four transactions and 5,892,625 gas. All recorded local transactions
succeeded.

## What the results mean

Both calculations produced the expected score in local simulation. These results do not measure
live FHE speed, Sepolia behavior, or production cost. The private-weight calculation was
evaluated only in local simulation.

## Supporting data

See the [Sepolia and local contract summary](../README.md).
