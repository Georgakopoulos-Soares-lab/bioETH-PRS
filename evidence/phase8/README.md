# Phase 8 — Evidence synthesis

- Status: **complete**
- Actions: `R1.6-E1`, `R1.8-E1`
- Evidence classes: **Live fhEVM**, **Hardhat mock**, and **Analytic projection**
- Live fhEVM rows: **one verified public 100-SNP workflow**; private remains mock-only
- Runtime: node v22.23.1
- Date: 31 July 2026

## Headline

Phase 8 turns the frozen Stage A measurements into the two machine-readable tables the
manuscript will consume. The 31 July follow-up incorporates the verified public live run without
promoting any mock or projected row to live evidence.

The public live classic-path workflow used **25 transactions / 20,710,271 gas**, paid
**0.025274764801306197 Sepolia test ETH**, completed in **464,253 ms**, and decrypted score
**758,685** in **8,081 ms**. Private-weight execution remains mock-validated only.

The measured public streaming workflow uses **15, 47, 88, and 413 host-contract
transactions** at 100, 500, 1,000, and 5,000 nominal variants. The private 100-variant
workflow uses **17 transactions** because model publication adds two reader-authorisation
transactions. These counts include a fresh model, one registered sample, and one completed
streaming job; contract deployments are excluded.

Rows at 10,000, 100,000, and 1,000,000 nominal variants are transaction-geometry
calculations only. They are labelled **Analytic projection / unexecuted**, carry no latency or
gas extrapolation, and cannot be cited as demonstrated execution.

## `R1.6-E1` — three-class scale table

The primary files are `scale_evidence.json` and its rendering `scale_evidence.md`.

| Evidence class | Executed range | Visibility | What is available |
|---|---|---|---|
| Live fhEVM | 100 variants | public | 25 receipts, testnet gas/fee, real timing, exact decrypted result |
| Hardhat mock | 100–5,000 variants | public; private at 100 | contract correctness, transaction geometry, mock host timing/gas |
| Analytic projection | 10,000–1,000,000 variants | public and private | unexecuted transaction count only |

The supported conclusion is deliberately narrow: one public 100-SNP point is live-validated,
while **linear host-contract transaction growth over 100–5,000 variants** is supported only by
Hardhat-mock runs. The evidence does not establish live scaling, private-weight live behavior,
production fees, or genome-wide feasibility.

The four mock rows were re-executed after the provenance changes rather than copied from the
Phase 0 baseline. `heprs_profile.json` is the machine-readable run and
`heprs_profile.txt` is its transcript. Every encoded score was checked against the independent
reference as part of the profiler and the run fails on a mismatch.

Each synthesis JSON hashes eleven inputs: seven source-evidence files (including the live
deployment, public report, on-chain verification, and geometry-matched mock) and four producer
scripts. This records exact content rather than relying only on commit labels.

## `R1.8-E1` — measured transaction use and fee sensitivity

The authoritative files are:

- `measured_transaction_use.json` and `.md` — observed live and Hardhat-mock transaction counts,
  gas, timing, and testnet-fee boundaries;
- `fee_sensitivity.json` and `.md` — separate, explicitly unexecuted ETH arithmetic;
- `evidence/phase7/live_preflight.json` — source measurement for deployment and public/private
  100-variant flows;
- `evidence/phase2/release_policy_gas.txt` — source measurement for policy setup and
  randomized-category finalization.

Key observed quantities:

| Quantity | Evidence class | Transactions | Gas |
|---|---|---:|---:|
| Four-contract deployment | Live fhEVM | 4 | 5,892,559 |
| Public 100-variant classic job | Live fhEVM | 25 | 20,710,271 |
| Geometry-matched public classic job | Hardhat mock | 25 | 18,755,864 |
| Public 100-variant streaming job | Hardhat mock | 15 | 11.690 M |
| Private 100-variant streaming job | Hardhat mock | 17 | 23.508 M |
| One-time release-policy setup | Hardhat mock | 1 | 77,314 |
| Raw-score finalization | Hardhat mock | 1 | 169,898 |
| Randomized-category finalization | Hardhat mock | 1 | 432,230 |
| Public Gateway/KMS decryption | Live fhEVM | 0 on-chain | 8,081 ms, no host gas |

The raw and randomized-category finalizations are alternatives measured in different runs;
they must not be added together. Release-policy setup is one additional transaction per model.

Fee sensitivity is kept in a different artifact and is labelled `Analytic projection`. It
multiplies the mock-observed gas by hypothetical gas prices, gives ETH only, and makes no USD,
production-affordability, clinical-feasibility, or commercial-viability claim.

The geometry-matched live/mock pair has the same chunk sizes and 25 transactions. Live gas is
**1,954,407 / 10.42% higher**. That one pair is useful evidence but does not justify a general
"within 10–20%" expectation for other models or network conditions.

## Finding: machine-readable evidence wins over hand transcription

`CD-025`: the Phase 7 prose wrote public/private totals of 11,690,033 and 23,507,892 gas.
The machine-readable component sums are 11,690,021 and 23,507,880 — **12 gas lower in each
case**. The JSON is internally consistent, including its fee arithmetic.

This is not a material cost change. It is a reporting-precision finding that independently
confirms `CD-011`: encrypted calldata makes total gas inappropriate to quote to the individual
unit. Phase 8 preserves raw values in JSON and renders the totals as 11.690 M and 23.508 M.

## Reproducibility correction made during capture

The profiler advertised `--json-out`, but `hardhat test` rejected that flag before the test
could read it. The failed pre-measurement attempt is preserved in
`heprs_profile_failed_cli.txt`. `HEPRS_PROFILE_JSON_OUT` is now the supported npm-command
interface:

```sh
nvm use
HEPRS_PROFILE_JSON_OUT=evidence/phase8/heprs_profile.json npm run profile:heprs
npm run synthesize:phase8
```

No partial profile was used as evidence.

## Verification

| Check | Result |
|---|---|
| `npm run build` | exit 0 |
| Targeted Phase 8 + provenance tests | 17 passing |
| Full suite | **163 passing**, 0 failing |
| Cross-language validation | PASSED at tolerance 0 |
| Extra `npx tsc --noEmit` audit | exit 2 — 14 existing errors, all in untouched Phase 6/HCU/baseline-test files; no Phase 8 file appears |
| Four HEPRS flows | 1 profiler test passing; all four `status=full_flow` |
| JSON/source reconciliation | synthesis aborts unless transaction counts and component sums reconcile |
| Evidence-class guard | one verified public live row; private live absent; all larger projections remain unexecuted |
| Manuscript | `bioeth_prs (4).tex` untouched |

## Files

| File | Purpose |
|---|---|
| `heprs_profile.json` | machine-readable current mock execution at all four fixture sizes |
| `heprs_profile.txt` | profiler transcript |
| `heprs_profile_failed_cli.txt` | preserved failed invocation before any measurement began |
| `scale_evidence.json`, `.md` | `R1.6-E1` evidence-class table |
| `measured_transaction_use.json`, `.md` | `R1.8-E1` measured quantities |
| `fee_sensitivity.json`, `.md` | separate unexecuted fee arithmetic |
| `build_after.txt` | compile gate |
| `tests_after.txt` | 163-test gate |
| `tests_before_source_hash_fix.txt` | preserved full-suite pass before provenance was tightened |
| `targeted_tests_after.txt` | 17 Phase 8 + provenance tests after the final synthesis change |
| `cross_language_after.txt` | independent-reference gate |
| `tsc_noemit.txt` | non-gating standalone TypeScript audit and its 14 untouched-file errors |

## Stage A status

Phase 8 is 2/2 complete. Stage A is **16/16**: the public live action passed and the private
action takes its recorded mock-only fallback. Stage B may now write the manuscript strictly from
these saved evidence classes.
