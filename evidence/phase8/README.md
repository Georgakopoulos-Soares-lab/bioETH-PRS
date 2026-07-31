# Scale, transaction, and fee summary

## What was evaluated

Scale and transaction results combine one public-weight calculation on Sepolia with local
contract measurements. The Sepolia calculation used the **Classic method (stored inputs)**; the
local scale calculations used the **Streaming method**. Fee values are shown separately as
**calculated fee examples**.

A local simulation means a local contract simulation. It checks contract behavior but
does not measure live FHE speed, live network time, or production cost.

## Results

| Setting | Method | Model | Variants | Transactions | Gas availability |
|---|---|---|---:|---:|---|
| Public Sepolia | Classic method (stored inputs) | Public-weight | 100 | 25 | 20,710,271 measured |
| Local simulation | Streaming method | Public-weight | 100 | 15 | local gas measured |
| Local simulation | Streaming method | Private-weight | 100 | 17 | local gas measured |
| Local simulation | Streaming method | Public-weight | 500 | 47 | local gas measured |
| Local simulation | Streaming method | Public-weight | 1,000 | 88 | local gas measured |
| Local simulation | Streaming method | Public-weight | 5,000 | 413 | local gas measured |

The four-contract Sepolia deployment used four transactions and 5,892,559 gas. The private-weight
calculation was evaluated only in local simulation, not on Sepolia. The largest evaluated
public-weight model contained 5,000 variants.

## What the results mean

The public-weight 100-SNP row is a Sepolia measurement. The other scale rows describe completed
local calculations only. Each calculated fee example multiplies measured local gas by a stated
gas price; it is not an observed network cost, a production price, or an affordability result.

## Supporting data

- [Scale results](scale_evidence.md)
- [Sepolia and local transaction values](measured_transaction_use.md)
- [Calculated fee examples](fee_sensitivity.md)
