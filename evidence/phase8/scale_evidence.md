# Scale results

One public-weight 100-SNP calculation completed on **Sepolia** using the **Classic method (stored
inputs)**. The remaining rows used the **Streaming method** in a **local contract simulation**.
These local results do not measure live network time or production cost.

The transaction count includes model publication, sample registration, and one score calculation;
contract deployment is excluded. The Sepolia row stores inputs before calculation, while the
local rows combine input upload and calculation. Each data set also contains one leading constant
used in the calculation; it is not an additional variant. The maximum evaluated model contains
5,000 variants.

| Setting | Method | Model | Variants | Transactions | Timing and cost |
|---|---|---|---:|---:|---|
| Public Sepolia | Classic method (stored inputs) | Public-weight | 100 | 25 | Sepolia time and gas; no production fee |
| Local simulation | Streaming method | Public-weight | 100 | 15 | local time and gas; no production fee |
| Local simulation | Streaming method | Private-weight | 100 | 17 | local gas only; no Sepolia time or production fee |
| Local simulation | Streaming method | Public-weight | 500 | 47 | local time and gas; no production fee |
| Local simulation | Streaming method | Public-weight | 1,000 | 88 | local time and gas; no production fee |
| Local simulation | Streaming method | Public-weight | 5,000 | 413 | local time and gas; no production fee |

The private-weight calculation was evaluated only in local simulation, not on Sepolia. The
table above reports the values used in the manuscript and response.
