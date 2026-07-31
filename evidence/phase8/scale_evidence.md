# Phase 8 scale evidence table

- Action: `R1.6-E1`
- Live status: **one public 100-SNP workflow executed successfully on Sepolia**.
- Private-weight live status: **not executed; mock-validated only**.
- Transaction scope: fresh model publication + sample registration + one job; contract
  deployment is excluded. The live row uses the classic separate upload/compute path;
  mock and projected rows use the streaming path.

| Evidence class | Status | Nominal variants | Encoded positions | Visibility | Transactions | Latency / cost availability |
|---|---|---:|---:|---|---:|---|
| Live fhEVM | executed | 100 | 101 | public | 25 | real Sepolia timing + testnet gas; no production fee |
| Hardhat mock | executed | 100 | 101 | public | 15 | mock host timing + mock gas; no production fee |
| Hardhat mock | executed | 100 | 101 | private | 17 | mock gas only; no live latency or production fee |
| Hardhat mock | executed | 500 | 501 | public | 47 | mock host timing + mock gas; no production fee |
| Hardhat mock | executed | 1,000 | 1,001 | public | 88 | mock host timing + mock gas; no production fee |
| Hardhat mock | executed | 5,000 | 5,001 | public | 413 | mock host timing + mock gas; no production fee |
| Analytic projection | unexecuted | 10,000 | 10,001 | public | 819 | unexecuted transaction geometry only |
| Analytic projection | unexecuted | 10,000 | 10,001 | private | 821 | unexecuted transaction geometry only |
| Analytic projection | unexecuted | 100,000 | 100,001 | public | 8,132 | unexecuted transaction geometry only |
| Analytic projection | unexecuted | 100,000 | 100,001 | private | 8,134 | unexecuted transaction geometry only |
| Analytic projection | unexecuted | 1,000,000 | 1,000,001 | public | 81,257 | unexecuted transaction geometry only |
| Analytic projection | unexecuted | 1,000,000 | 1,000,001 | private | 81,259 | unexecuted transaction geometry only |

One public 100-SNP workflow is validated end to end on live fhEVM. The wider 100-5,000-variant range is Hardhat-mock evidence only, so the live point does not establish real-TFHE scaling, private-weight live behavior, production fees, or genome-wide feasibility.

Machine-readable source: `scale_evidence.json`.
