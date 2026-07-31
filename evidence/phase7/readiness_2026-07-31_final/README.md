# Phase 7 live-harness readiness follow-up — final

- Date: 31 July 2026
- Evidence class: **Hardhat mock**
- Network contacted: **none**
- Actions advanced: `R1.1-E1`, `R1.1-E2`
- Status: software readiness complete; actual live runs remain blocked on a funded wallet

## What changed

`scripts/sepolia_validation.ts` now runs either visibility from one harness:

```sh
MODEL_VISIBILITY=public  npm run validate:mock
MODEL_VISIBILITY=private npm run validate:mock
```

The report names the visibility in its filename, so the second run cannot overwrite the first.
Every workflow transaction records its hash, block number, status, and gas; the report also
records chain ID, deployed addresses and bytecode identities, transaction count,
submission-to-result time, decryption time, score handle, decoded score, expected score, and
the exact hash of the validation script.

`scripts/deploy.ts` now records the same receipt trail for all four deployments, total gas,
exact deployment-script hash, and deployed bytecode identities.

## Executed mock validations

Both paths used the same 100-variant HEPRS fixture, individual 0, and independent expected
encoded score **758,685**.

| Visibility | Workflow | Transactions | Mock host gas | Decoded / expected | Result |
|---|---|---:|---:|---:|---|
| public | classic upload then compute | 20 | 17,978,392 | 758,685 / 758,685 | PASS |
| private | classic upload then compute | 22 | 29,797,241 | 758,685 / 758,685 | PASS |

The two extra private transactions authorise the engine and requester to read the encrypted
model. These are classic-path totals and therefore must not be compared as though they were the
Phase 7/8 streaming-path totals of 15/17 transactions.

All 20 public and 22 private transaction records have valid 32-byte hashes and positive block
numbers, and their gas components sum exactly to the saved totals.

## Deployment report

The deploy command produced four transaction records and a reconciled total of **5,892,625
mock gas**. This is 12 gas above the old pre-flight value because the real deploy script uses
the default oracle bound `1,048,576`, whereas the pre-flight fixture deployed the oracle with
`128`; constructor calldata zero/non-zero byte composition changes host gas by a few units.
Both round to 5.893 M.

## Readiness assertions

`npm run preflight:live` now asserts **8/8** properties:

1. refuses the default public Hardhat mnemonic;
2. emits a provenance block;
3. labels the evidence class;
4. compares with the independent reference;
5. uses real manifest hashes;
6. supports public and private model weights;
7. records a verifiable transaction trail;
8. hashes the exact validation-runner source.

An invalid `MODEL_VISIBILITY` exits 1 before execution and is preserved in
`validate_invalid_visibility.txt`.

## Regression verification

| Check | Result |
|---|---|
| `npm run build` | exit 0 |
| Readiness + provenance subset | 14 passing |
| Full suite | **167 passing**, 0 failing |
| Cross-language comparison | PASSED at tolerance 0 |
| Public validator | 1 passing; score 758,685 |
| Private validator | 1 passing; score 758,685 |

## What remains

No live result exists. With a funded non-default Sepolia wallet:

```sh
npx hardhat vars set MNEMONIC
npm run deploy:sepolia
MODEL_VISIBILITY=public npm run validate:sepolia
MODEL_VISIBILITY=private npm run validate:sepolia
npm run probe:hcu
```

Until those commands succeed, the manuscript must take `MS-05` branch B: every execution result
is Hardhat-mock validated, live deployment feasibility is not established, and the Sepolia HCU
ceiling remains unmeasured.

## Files

| File | Contents |
|---|---|
| `chain-31337.json` | four-contract deployment receipts and provenance |
| `chain-31337-validation-100snp-public.json` | public mock validation report |
| `chain-31337-validation-100snp-private.json` | private mock validation report |
| `live_preflight.json` | measurements plus 8/8 readiness assertions |
| `*_mock.txt` | complete command transcripts |
| `validate_invalid_visibility.txt` | rejected invalid configuration |
| `build_after.txt`, `tests_after.txt` | compile and 167-test gates |
| `targeted_tests_after.txt` | 14 readiness/provenance tests |
| `cross_language_after.txt` | independent-reference comparison gate |
