# Phase 8 scale evidence table

- Action: `R1.6-E1`
- Live status: **blocked** — no funded wallet, so there are no `Live fhEVM` rows.
- Transaction scope: fresh model publication + sample registration + one streaming job;
  contract deployment is excluded.

| Evidence class | Status | Nominal variants | Encoded positions | Visibility | Transactions | Latency / cost availability |
|---|---|---:|---:|---|---:|---|
| Live fhEVM | blocked | — | — | — | — | unavailable; no live result inferred |
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

The evidence supports linear host-contract transaction growth over the measured 100-5,000-variant Hardhat-mock range. It does not establish real-TFHE latency, production fees, or genome-wide feasibility.

Machine-readable source: `scale_evidence.json`.
