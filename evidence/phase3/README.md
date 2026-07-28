# Phase 3 — Independent validation stack

- Evidence class: **Hardhat mock** (contract arm) + **exact arithmetic** (reference arm)
- Runtime: node v22.23.1, Python 3.9.6
- Actions: `R2.6-C1`, `R2.2-C1`, `R2.3-C1`, `R2.2-T1`, `R2.3-T1`, `R2.6-T1` (all six)
- Reviewer comments addressed: R2 C2 (genotype QC), R2 C3 (effect-allele coding),
  R2 C6 (double programming)
- Date: 28 July 2026

## Headline result

Two implementations derived independently from the manuscript agree **exactly** —
tolerance zero — on encoding parameters, encoded scores, and decoded scores across all
three known-answer cases. The Python reference reproduces the manuscript's worked
example (`e = 105`, `PRS = 0.45`) exactly.

```
npm run validate:cross-language     ->  CROSS-LANGUAGE VALIDATION PASSED
```

| Case | Compared | Encoded mismatches | Decoded mismatches | Max abs error |
|---|---:|---:|---:|---:|
| `positive_weights` | 3 | 0 | 0 | 0 |
| `mixed_signed_weights` | 3 | 0 | 0 | 0 |
| `allele_reversal` | 3 | 0 | 0 | 0 |

`weightZeroPoint` and `scoreOffset` agree on every case.

## Independence, and why the ordering is recorded

The Python reference was written from `bioeth_prs (4).tex` ("Polygenic Risk Scores",
"Quantisation Scheme") and `docs/design.md`. It does not import, translate, or
transcribe `test/utils/heprs.ts`.

The **ordering** is the substance of that claim, so it is recorded: the Python was
finished and all 56 of its known-answer self-checks were passing before
`test/utils/heprs.ts` was opened to build the contract-side arm. Reading the
TypeScript afterwards cannot influence a file that was already complete and verified.
Agreement between two transliterations of one another would demonstrate nothing.

That independence immediately paid for itself: three specification defects surfaced
precisely because the Python followed the paper rather than the code — `CD-006`,
`CD-007`, `CD-008` in `../claim_deltas.md`.

## Verification

| Check | Result |
|---|---|
| Reference self test | **56 / 56 checks pass** |
| Hand-computed case expectations re-derived | **27 / 27 agree** |
| Contract arm (`validation/contract_case_run.ts`) | 3 passing |
| Cross-language comparison, tolerance 0 | 3 / 3 **PASS** |
| Negative control: mismatched arms | correctly reports `COMPARISON FAILED`, exit 1 |
| Negative control: corrupted `hand_checked` value | correctly detected, `allAgree=False` |
| Main suite still green | 140 passing, 0 failing |

The negative controls matter: a validation command that cannot fail proves nothing.
Both were exercised explicitly.

## HEPRS fixture scoring

All 200 individuals across all four fixture sizes scored, **0 rejected**:

| Nominal | Encoded positions | `weightZeroPoint` | `scoreOffset` | Fits uint64 | Max round-trip \|error\| |
|---:|---:|---:|---:|:---:|---:|
| 100 | 101 | 9,534 | 249,052 | yes | **0** |
| 500 | 501 | 9,534 | 1,131,252 | yes | **0** |
| 1,000 | 1,001 | 11,604 | 2,293,040 | yes | **0** |
| 5,000 | 5,001 | 11,604 | 11,042,232 | yes | **0** |

Output in `reference/heprs_*snp_reference.json`. These are the expected answers Phase 5
(`R2.7-E1`) and Phase 7 (`R1.1-E1`) validate against, which is why this phase precedes
both.

Note the encoded length: nominal **+ 1**, from the leading intercept column.

## Findings

Three specification defects, all logged in `../claim_deltas.md`:

**`CD-006` — quantisation on these fixtures is *exact*, not "machine-epsilon", for a
reason that does not generalise.** Every one of the 6,604 fixture weights carries at
most six decimal places, so at the advisor's recommended scale of 10⁶ `round(s·β)`
performs **no rounding at all** and the round trip is identically zero. The paper's
accuracy claim is therefore understated but rests on source-data precision rather than
on the encoding scheme. `R2.7-M1` must not present a nonzero MAE/RMSE as measured
quantisation error — on these fixtures those statistics are zero by construction.

**`CD-007` — the manuscript's `z_w` formula is missing a clamp both implementations
apply.** The paper writes `z_w = -min_i q_i` unconditionally, which is negative when
all weights are positive and cannot be stored in the on-chain `uint64`. Both
implementations independently clamp at zero. Only the paper is wrong.

**`CD-008` — `round()` has no stated tie-breaking rule.** Half-away-from-zero,
half-to-even, and half-up disagree at exact `.5`. The TypeScript inherits half-up from
`Math.round` over floats; the reference uses half-away-from-zero over exact decimals.
**Measured impact on this paper's numbers: none** — re-scoring every fixture with
`--float-arithmetic` reproduces the JavaScript behaviour and yields 0 differences
across all 200 individuals, because of `CD-006`. The rule must still be stated, since a
finer-precision model would diverge.

## A defect the fixtures' own validation caught

Two case files originally specified a `G/C` allele pair. `G/C` is its own complement,
so strand cannot be resolved from allele labels, and the harmoniser correctly rejected
those variants. The **case files** were wrong, not the code — surfaced only because
each case carries hand-computed expectations that `run-case` re-derives rather than
trusts. Fixed to `G/T`, and both files now note why palindromic pairs are avoided.

## Layout

| Path | Contents |
|---|---|
| `reference/case_*.json` | Arm A output for each known-answer case |
| `reference/heprs_*snp_reference.json` | Arm A output for all 200 fixture individuals |
| `contract/case_*.json` | Arm B output, with real keccak256 provenance hashes |
| `compare_*.json` | Cross-language comparison reports |

Arm B writes **real `keccak256` manifest hashes**, not `ethers.ZeroHash` — the
remediation `R2.4-E1` generalises to the rest of the evaluation code in Phase 4.

## Consequences for later phases

- **Phase 4 (`R2.4-E1`)** — the provenance pattern used here (keccak256 over exact
  input bytes, recorded in the output) is the template for the six evidence-producing
  files in `CD-001`.
- **Phase 5 (`R2.7-E1`)** — expected answers for all 200 individuals now exist. The
  comparison must state that it validates the *pipeline*, not arithmetic precision,
  per `CD-006`.
- **Phase 9 (`R2.2-M1`, `R2.3-M1`)** — the Methods pseudocode is a transcription of the
  shipped validator. `MS-10` and `MS-11` in
  `../manuscript_and_rtr_responses.md` hold the specifications.
- **Phase 9 (Quantisation Scheme)** — must fix `CD-007` (clamp) and `CD-008` (rounding
  rule).
- **Phase 11 (`R2.4-M1`)** — the independent-reference row of the correctness-guarantee
  table can now be written; it was blocked on this phase.
