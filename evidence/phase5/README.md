# Phase 5 — Individual-level correctness evidence

- Evidence class: **Hardhat mock**
- Runtime: node v22.23.1, Python 3.9.6
- Action: `R2.7-E1`
- Reviewer comment addressed: R2 C7 (is the individual PRS consistent with Equation 1?)
- Date: 28 July 2026
- Wall clock: 10 minutes for 200 jobs

## Headline result

All **200 individuals** — 50 at each of the four fixture sizes — scored end to end through
the encrypted contract path and compared against the independently derived reference.

| Nominal SNPs | Encoded positions | Individuals | Exact encoded-score agreement | Max abs error | mock ms/individual |
|---:|---:|---:|:---:|---:|---:|
| 100 | 101 | 50 | **50 / 50** | 0 | 157 |
| 500 | 501 | 50 | **50 / 50** | 0 | 780 |
| 1,000 | 1,001 | 50 | **50 / 50** | 0 | 1,672 |
| 5,000 | 5,001 | 50 | **50 / 50** | 0 | 8,819 |
| **total** | | **200** | **200 / 200** | **0** | |

Summary statistics over all 200 (`summary_statistics.json`):

| Statistic | Value |
|---|---|
| Mean absolute error | **0** |
| RMSE | **0** |
| Maximum absolute error | **0** |
| Exact matches | **200 / 200** |
| Pearson *r* | **exactly 1** — established in exact decimal arithmetic, no floating-point `sqrt` |

The gap this closes: the submitted evaluation executed the encrypted contract path for only
the **first** individual at each size. The other 49 were checked solely for TypeScript-side
`uint64` overflow, never against a decoded contract result.

## What this validates — and what it does not

**This is the most important caveat in the phase, and the manuscript must carry it.**

Per `CD-006`, the round-trip error on these fixtures is zero **by construction**, not by
measurement. Every fixture weight carries at most six decimal places and the advisor's
recommended scale is an integer multiple of 10⁶, so `round(s·β)` performs no rounding at all
and the decode is exact. MAE, RMSE, and maximum error are therefore zero *a priori*, and
Pearson *r* is exactly 1 whenever the pipeline is correct.

So this comparison does **not** measure arithmetic precision. What it validates is the
**pipeline**: genotype preprocessing, effect-allele alignment, quantisation, chunked on-chain
FHE execution, ACL-gated decryption, and decoding — end to end, against an implementation
derived independently from the manuscript. A nonzero value here would have been a genuine
finding; zero confirms fidelity, not accuracy.

`R2.7-M1` must state which of the two claims it is making. Reporting "MAE = 0" as evidence of
quantisation accuracy would misattribute a property of the input data to the encoding scheme.

## Intercept column

Recorded explicitly per `R2.7-E1`: each fixture carries a leading constant column — weight 0,
dosage 1 for every individual — so the **encoded vector length is nominal + 1**. The "100 SNP"
fixture occupies 101 encoded positions. This appears in every output file and in the CSV.

## Category agreement

`R2.7-E1` asks for category agreement "if categories remain". Measured at 100 SNPs only, and
that is sufficient rather than a shortcut: `ResultOracle` consumes a single encoded score plus
two thresholds, so the classification path is **entirely independent of variant count**.
Running all four sizes would add ten minutes and no information.

| Measure | Value |
|---|---|
| Individuals classified | 50 |
| Outside the ambiguous band | 48 |
| Outside the band, agreeing with the plaintext category | **48 / 48** |
| Within the noise band of a threshold | 2 |
| Total disagreements observed | 0 |
| Category distribution (Low / Medium / High) | 17 / 17 / 16 |

**Agreement cannot be exact by construction**, and reporting a single percentage would hide
the mechanism. The bounded randomized release adds one-sided noise on `[0, B)`, so an
individual whose score lies within `B` below a threshold may legitimately classify either side
of it. The honest measurement is therefore agreement *outside* that band, reported alongside
the band's population. Both in-band individuals happened to agree on this run; that is a
favourable noise draw, not a guarantee, and it must not be reported as 50/50 agreement.

### A non-obvious property of the bias correction

Both in-band individuals sit at **exactly `B/2` below their threshold** — dead centre of the
ambiguous band. That is not coincidence. Thresholds were derived as
`tertile + expectedNoiseBias()` = `tertile + B/2`, following the contract's own documented
guidance for making the noisy comparison align with the intended plaintext boundary. But that
same correction places the individual *defining* the cut point exactly `B/2` below the adjusted
threshold — the point of maximum classification ambiguity.

So the bias correction, which exists to make the *expected* classification unbiased,
simultaneously guarantees maximum ambiguity for the individual sitting on the cut point. This
is a real trade-off in the mechanism, not a bug, and it is worth stating in `Noisy Output
Release`: threshold adjustment fixes the aggregate bias and cannot fix per-individual
ambiguity near a boundary. See `CD-015`.

## Verification

| Check | Result |
|---|---|
| 200-row machine-readable comparison file | `individual_level_comparison.csv`, 200 data rows + header |
| Independent audit of the CSV | 50 rows per size; all `encodedAgrees` and `decodedAgrees` true; 0 reference-vs-contract encoded mismatches |
| Scales used | 3,000,000 at 100/500 SNPs; 1,000,000 at 1,000/5,000 — matching the advisor, per `CD-010` |
| Encoded positions | 101 / 501 / 1,001 / 5,001 — nominal + 1 throughout |
| Guard | `npm run test` includes 10 provenance-guard tests over 8 evidence-producing files |
| Reference self test | 61 / 61 checks pass |

The run asserts agreement itself and fails the test on any mismatch, but the CSV was **also**
audited independently by re-reading both JSON sets and comparing encoded scores directly, so
the result does not rest on the script's own assertion.

### Parameter-mismatch guard

The runner refuses to proceed if the reference manifest's `scale`, `weightZeroPoint`, or
`scoreOffset` disagree with the advisor recommendation, with an error naming `CD-010`. That is
the failure Phase 4 caught: a scale mismatch produced a uniform 3× disagreement that looked
exactly like an encoding bug. It now fails loudly and early instead of producing 200 rows of
misleading output.

## Mock timing

Reported because the paper reports latency, and labelled because it is **not** real FHE latency.

| Nominal SNPs | Encoded positions | ms / individual | ms / encoded position |
|---:|---:|---:|---:|
| 100 | 101 | 157 | 1.554 |
| 500 | 501 | 780 | 1.557 |
| 1,000 | 1,001 | 1,672 | 1.670 |
| 5,000 | 5,001 | 8,819 | 1.763 |

Per-position cost rises about 13% from 101 to 5,001 positions, so the scaling is close to
linear but mildly superlinear over the measured range. **This is mock-coprocessor plaintext
arithmetic plus transaction overhead. It measures neither TFHE evaluation time nor real network
latency**, and `R1.1-M1` must label it `Hardhat mock` wherever it appears.

## Findings

| ID | Summary |
|---|---|
| `CD-014` | Category agreement cannot be exact under a one-sided randomized release; the ambiguous band must be reported alongside any agreement figure |
| `CD-015` | The `B/2` bias correction places the boundary individual at the point of maximum ambiguity — an inherent trade-off worth stating |
| `CD-016` | Mock per-individual latency is recorded here and must not be presented as FHE latency; the submitted `~386 ms` comparison figure needs an evidence-class label |

## Layout

| Path | Contents |
|---|---|
| `individual_level_comparison.csv` | The 200-row file `R2.7-E1` requires |
| `contract/heprs_*snp_contract.json` | Contract-arm output per size, in the shape the Phase 3 comparator consumes |
| `summary_statistics.json` | MAE, RMSE, max error, Pearson *r*, per size and overall, plus category agreement |
| `category_agreement_100snp.json` | Per-individual categories, thresholds, and ambiguous-band flags |
| `run_log.txt` | Full run transcript |

## Consequences for later phases

- **Phase 7 (`R1.1-E1`)** — the live run validates a known answer: the 100-SNP individual 0
  encoded score is 758,685, agreed by both arms.
- **Phase 9 (`R2.5-M1`)** — the three-SNP worked example can cite this as the scaled-up
  confirmation that the same arithmetic holds across 200 individuals.
- **Phase 10 (`R1.3-M2`)** — `Noisy Output Release` should state the ambiguous-band property
  (`CD-015`) alongside the bias correction it already describes.
- **Phase 11 (`R2.7-M1`)** — scatter plot and metrics table can be generated directly from
  `individual_level_comparison.csv`; the 200 rows are the supplementary material. The framing
  must follow `CD-006`: pipeline validation, not precision measurement.
