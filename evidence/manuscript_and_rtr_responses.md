# Manuscript changes and RTR responses — accumulator

The single destination for two things Stage A produces but must not yet apply:

1. **Manuscript change specifications** — exact edits, derived from shipped code and saved
   evidence, ready to hand to the LaTeX editor when the corresponding Stage B phase opens.
2. **Point-by-point reviewer responses** — drafted as the evidence lands, while the reasoning
   is fresh, rather than reconstructed at the end.

**This file is written during Stage A but applied in Stage B.** Nothing here may be pasted into
`bioeth_prs (4).tex` before the Stage A exit gate clears. See
[`README.md`](README.md) for the gate and
[`../bioETH-PRS_RTR_acceptance_plan.md`](../bioETH-PRS_RTR_acceptance_plan.md) for the schedule.

## Status legend

| Marker | Meaning |
|---|---|
| `READY` | Spec is complete and its evidence exists. Can be applied when its phase opens. |
| `BLOCKED` | Waiting on a named Stage A action. Do not draft numbers for it yet. |
| `APPLIED` | Landed in the tex. Record the phase and date. |

## Response-letter style

One flowing paragraph per comment. Open by thanking the reviewer and conceding the point
plainly where it is correct. State what changed, with concrete specifics — file names, exact
replacement terminology, measured values. Explain *why*, including the reasoning that led to
going further than asked. Be explicit about what was **not** done and what remains unguaranteed.
No bullet lists, no defensiveness, no claim beyond its evidence class.

---

# Part 1 — Manuscript change specifications

## MS-01 · `R1.2-M1` · Phase 13 · Trust language → evaluator minimization

**Status: `READY`** (spec complete; deliberately last in the plan so it is applied once, over a
finished body and final evidence)

Guiding principle for every replacement: bioETH-PRS removes the *designated application-level
evaluator*. It does not remove trust. Confidentiality and correctness still depend on the fhEVM
coprocessor, the ACL and Gateway/KMS decryption infrastructure, contract correctness, and chain
liveness. Consensus makes contract execution publicly **auditable**; it does **not** verify FHE
correctness.

Audit result on the submitted tex: **no literal `trustless` or `zero trust` exists.** The
violations are all "absolute removal of trust" and "consensus verifies the computation"
phrasing, at 11 sites.

| # | Location | Current | Replacement |
|---|---|---|---|
| 1 | `\title` (~line 63) and the `%%` comment on line 1 | `Confidential Polygenic Risk Scoring without a Trusted Evaluator via Fully Homomorphic Encryption on a Programmable Blockchain` | `Confidential Polygenic Risk Scoring with Auditable fhEVM Orchestration on a Programmable Blockchain` (keep the three-line `\\[2pt]` break geometry) |
| 2 | Graphical abstract caption (~87) | `replaces the trusted evaluator of conventional homomorphic PRS pipelines with consensus-enforced smart contracts` | `replaces the designated application-level evaluator of conventional homomorphic PRS pipelines with publicly auditable smart contracts` |
| 3 | Graphical abstract caption (~92) | `with computation verified by blockchain consensus` | `with contract execution publicly auditable on-chain; confidentiality and decryption remain dependent on the fhEVM coprocessor, ACL, and Gateway/KMS infrastructure` |
| 4 | Abstract (~103) | `Prior homomorphic-encryption approaches, still require trust in a designated evaluator. We present bioETH-PRS, a protocol that replaces that evaluator role with immutable smart contracts...` | Fix the stray comma after `approaches`; `replaces that application-level evaluator role with publicly auditable smart contracts`; append: `The design is evaluator-minimized rather than trustless: confidentiality and correctness remain conditional on the fhEVM coprocessor, the ACL and threshold-decryption infrastructure, contract correctness, and chain liveness.` |
| 5 | Key Points bullet 1 (~122) | `replaces the trusted evaluator ... with auditable smart contracts` | `replaces the designated evaluator of prior encrypted PRS pipelines with publicly auditable smart contracts on an FHE-enabled blockchain, shifting rather than eliminating trust` |
| 6 | Introduction (~174) | `This shifts trust from a single evaluator to auditable contract logic, blockchain consensus, the fhEVM coprocessor stack, and the ACL/decryption infrastructure` | Same list, then: `The architecture is therefore evaluator-minimized rather than trustless; consensus makes contract execution publicly auditable but does not itself verify the correctness of encrypted evaluation` |
| 7 | Contributions bullet 1 (~192) | `A four-contract architecture without a trusted evaluator` | `An evaluator-minimized four-contract architecture` |
| 8 | `tab:comparison`, Trust model row (~365) | `Evaluator removed; consensus/fhEVM dependent` | `Designated evaluator removed; contracts, consensus, fhEVM coprocessor, and ACL/KMS trusted` |
| 9 | Discussion applicability list (~1028) | `(1) no trusted evaluator can be assumed;` and `(3) computation must be verifiable without re-running it;` | `(1) no single designated evaluator can be assumed, and the fhEVM coprocessor and decryption infrastructure are acceptable alternative trust anchors;` / `(3) the orchestration of the computation must be publicly auditable without re-running it;` |
| 10 | Conclusion opening (~1118) | `By replacing the centralised evaluator ... with immutable, consensus-enforced smart contracts, we remove the designated evaluator assumption...` | `publicly auditable smart contracts`; then: `This is an evaluator-minimization result, not the removal of trust: the protocol continues to depend on the fhEVM coprocessor stack, contract correctness, the ACL and threshold-decryption infrastructure, and blockchain liveness.` |
| 11 | Conclusion (~1134, ~1138) | `on-chain FHE computation without a trusted evaluator is technically feasible`; `bring private, verifiable genomic computation` | `on-chain FHE computation with an auditable contract orchestrator in place of a designated evaluator is technically feasible`; `bring private, publicly auditable genomic computation` |

Scope guard when applying: do **not** touch cost, scale, clinical-practicality, or DP wording in
the same pass — those belong to MS-04, MS-05, and Phases 11–12. Do **not** edit the
`fig_security` caption here; it belongs to MS-03.

Final check: zero hits for `trustless` / `zero trust` / `zero-trust`; no sentence implying
consensus verifies FHE computation; no remaining `without a trusted evaluator`; `auditable`
never used as a synonym for `verified correct`.

## MS-02 · `R1.3-M1`, `R1.3-M2` · Phase 10 · Remove DP framing

**Status: `READY`** — the codebase already uses the final vocabulary (Phase 1, commit `b0c86a4`).
The manuscript adopts it verbatim. Do not coin a third variant.

Mandated term: **bounded randomized categorical release**.

| Location | Current | Replacement |
|---|---|---|
| `Noisy Output Release` | `DP-inspired noisy output release mechanism` | `bounded randomized categorical release` |
| Same section | — | Add: `This heuristic does not provide an \((\varepsilon,\delta)\)-differential privacy guarantee.` State all three reasons: one-sided support on \([0,B)\); no calibration to a sensitivity bound; no composition accounting across repeated queries |
| `Limitations` heading | `DP bias` | `One-sided randomization and bias` |
| Abstract, Key Points, Introduction contributions, Conclusion | any DP-adjacent phrasing | evaluator-neutral randomized-release phrasing |
| Future Directions | — | Move formal adjacency, sensitivity analysis, and calibrated DP here, framed as objectives not properties |

Retain the implemented mechanism exactly: \(e_{\mathrm{noisy}} = e + \nu\), \(\nu \sim
\mathrm{Uniform}(0,B)\), expected upward bias \(B/2\), threshold adjustment. Cite
`contracts/ResultOracle.sol` and `test/rate_limit_randomized_release_test.ts`.

Completion criterion: no wording a reader could interpret as a formal DP claim.

## MS-03 · `R1.5-M1`, `R1.5-M2` · Phase 10 · SNP authenticity into Security Model

**Status: `READY`** — the trust boundary is now recorded in the test suite (Phase 1).

Move the full issue from `Discussion → Limitations and Open Problems → SNP provenance` to
`Security Model`, immediately after `Threat Model`, leaving a short cross-reference behind.

- Add an explicit **malicious authorized requester** who may upload arbitrary encrypted values.
- State: *The contracts guarantee computation over submitted ciphertexts; they do not prove that
  those ciphertexts encode genotypes derived from the registered sample.*
- Note that `GenomicRegistry.hasAccess` gates *who* may open a job, not *what* is uploaded.
- Update the `fig_security` caption so ciphertext/sample binding sits **outside** the guaranteed
  boundary (this is also where `verifiable security properties` is replaced — see MS-06).
- Define the evaluated setting as trusted genotype preparation by the patient's local pipeline,
  an accredited laboratory, or an approved data custodian, stated **before** the privacy
  invariants rather than after.
- State that `manifestHash` records genome build, input-file hash, variant order, and preparation
  policy but is a **provenance commitment only**, not a cryptographic binding. Do not present
  `registerSampleWithManifest` as binding ciphertexts to samples.
- Put signed laboratory attestation and a ZK ciphertext-to-sample proof in Future Directions.
- Cite the trust-boundary test by its new name (see EV-01).

## MS-09 · `R1.4-C1` conformity · Phase 9/10 · Model-defined release policy

**Status: `READY`** — the interface shipped in Phase 2 (commit below). See `CD-004`.

Both algorithm listings currently show the requester passing \(\tau_L, \tau_H\). They no
longer do. Redraw `Classic chunked PRS computation` and `Streaming PRS computation` so the
final step is `finalizeAndClassify(jobId)` with no release parameters, and add a model-setup
line showing `setReleasePolicy` executed before `finalizeModel`.

In `Noisy Output Release`, state that the thresholds are **model-defined and fixed before any
query is possible**, and give the reason: a requester able to shift thresholds across calls
performs a binary search on the encrypted score, which extracts far more per query than the
ternary output implies and largely defeats the randomized release. Note that the minimum
threshold gap is now validated when the policy is configured, not only when a score is
classified.

Do not describe a two-step "enable oracle mode, then register an approved oracle" workflow:
`setOracleRequired` and `setApprovedOracle` no longer exist. The workflow is one
`setReleasePolicy` call on a draft model.

## MS-10 · `R2.2-M1` · Phase 9 · Genotype preprocessing, QC, and model alignment

**Status: `READY`** — transcribe from the shipped validator, do not re-specify.

Add `Background/Methods -> Genotype preprocessing, QC, and model alignment` **before** the
cryptographic pipeline. Every rule below is implemented and tested in
`validation/independent_prs_reference.py`; the pseudocode in the paper must match it exactly.

| Rule | What the paper must state |
|---|---|
| Accepted representation | diploid hard calls, integers in \(\{0,1,2\}\) only |
| Non-integer / out-of-range | **rejected, never clamped** — clamping silently alters the score |
| Missing variants | the policy is a **required** manifest field (`reject`, `zero_dosage`, `mean_dosage`); there is deliberately no default, because an implicit zero is a silent imputation |
| Genome build | must be declared alongside the genotypes and must match the model; a mismatch is fatal. Build cannot be inferred from dosage values |
| Variant order | verified element-by-element, not by length: the dot product is positional, so a reordering pairs every dosage with the wrong weight while still returning a plausible number |
| Duplicates | duplicate variant ids rejected |
| Multiallelic / indel | rejected; this study evaluates biallelic SNP hard calls only |
| Intercept column | the fixtures carry a leading constant column (weight 0, dosage 1), so the encoded vector length is nominal **+ 1** |

State explicitly that MAF and Hardy–Weinberg filtering are **cohort and model-development
QC**, performed upstream when the weights are derived, whereas missingness, allele
orientation, and build matching are **scoring-time** checks performed per request. Conflating
the two is what makes the reviewer's question necessary.

Report that every run emits counts of matched, intercept, missing, imputed, invalid, and
rejected variants, so a partially-scored sample cannot be mistaken for a complete one.

Fixture caveat to state plainly: the HEPRS fixtures are bare numeric matrices with no
identifiers, build, or allele labels, so they are **assumed** pre-aligned and no build or
strand validation is possible on them.

## MS-11 · `R2.3-M1` · Phase 9 · Effect-allele dosage and blinded alignment

**Status: `READY`** — transcribe the merged harmonisation function.

Redefine \(g_i\) in Equation 1 as **the dosage of the model-specified effect allele**, not
the allele dosage and not the minor-allele count. The paper must never treat "minor allele"
and "effect allele" as interchangeable.

Answer the reviewer's blinding question directly: alignment does **not** require seeing the
weights. Public model metadata exposes variant identity, genome build, effect allele, other
allele, and column order even when the weight values are encrypted, and alignment happens
locally, before encryption. Encrypting the weights conceals their magnitudes, not the allele
labels needed to orient a genotype.

Give the decision rules as pseudocode, matching `harmonize_dosage`:

1. Multiallelic or non-SNP → reject.
2. Palindromic `REF`/`ALT` pair (`A/T`, `C/G`) without explicit strand resolution → reject as
   strand-ambiguous. State *why* a literal match is insufficient: for an `A/T` SNP, effect
   allele `A` is consistent with both the forward `ALT` and the reverse-strand reading of
   `REF`, so aligning on the label alone would silently flip roughly half of such variants.
3. Effect allele is the counted allele → keep \(g\).
4. Effect allele is the other allele → \(g_{\mathrm{effect}} = 2 - g\).
5. Complement of the effect allele matches on a non-palindromic pair → strand flip, then
   re-apply 3–4.
6. Otherwise → reject as incompatible.

Report that the validator emits match / flip / strand-ambiguous / rejected counts, and cite
the orientation tests (EV-13).

## MS-12 · Phase 9 · Quantisation Scheme corrections

**Status: `READY`** — two defects found by the independent derivation. See `CD-007`, `CD-008`.

**Step 2 clamp.** The paper writes \(z_w = -\min_i q_i\) unconditionally. When every
quantised weight is positive that expression is negative and cannot be stored in the
on-chain `uint64`. Change to \(z_w = \max(0, -\min_i q_i)\) and add one sentence: the clamp
is required by the unsigned on-chain representation, not by the algebra — the invariant
\(u_i \geq 0\) already holds at \(z_w = 0\) in that case. Both implementations clamp
independently; only the paper omits it.

**Step 1 rounding rule.** \(\mathrm{round}(\cdot)\) needs a stated tie-breaking convention,
since half-away-from-zero, half-to-even, and half-up disagree at exact `.5` and the two
implementations use different ones. State the convention. Note that the measured impact on
this paper's results is nil, and say why: see MS-13.

## MS-13 · `R2.7-M1` conformity · Phase 11 · Quantisation accuracy is *exact*, and why

**Status: `READY`** — measured. See `CD-006`.

The `Quantisation Accuracy` subsection currently claims machine-epsilon reconstruction. The
measured error is **identically zero** across all 200 individuals at all four fixture sizes.
The reason must be stated, because it does not generalise: all 6,604 fixture weights carry at
most six decimal places, so at the advisor's recommended scale \(s = 10^6\) the quantisation
is **lossless by construction** — `round` performs no rounding at all.

Connect this to the `Quantisation Advisor` subsection, which already says "the limiting factor
is source data precision." Presented together, the accuracy result is honest; presented alone,
it reads as a property of the encoding scheme rather than of the input data.

Consequence for `R2.7-M1`: do **not** report a nonzero MAE, RMSE, or maximum absolute error as
though it measured quantisation error. Those statistics are zero on these fixtures by
construction. The individual-level comparison still belongs in the paper, but as validation of
the **pipeline** — preprocessing, alignment, encoding, contract execution, decoding — not of
arithmetic precision. Say which of the two it establishes.

## MS-14 · `R2.4-E1` conformity · Phase 11/12 · Reproducibility identifiers and gas precision

**Status: `READY`** — measured. See `CD-011`, `CD-012`.

**Every final table gains reproducibility identifiers.** For each reported figure, state the
repository commit, the model and fixture digests, the manifest hash, the contract addresses and
bytecode digests for live runs, transaction identifiers, and the independent reference output
digest it was checked against. All of these are now emitted automatically in a `provenance`
block by the five evidence-producing scripts, so the paper transcribes rather than reconstructs.

**Two corrections to how gas is reported.**

1. **Model publication gas must be restated.** The submitted figures were measured with zero
   manifest hashes. Recording real provenance — which the paper's own description of
   `manifestHash` implies — costs a flat **+40,568 gas per model**, independent of variant
   count: 1,084,966 to 1,125,534 at 100 SNPs (+3.74% of publication, +0.23% of total). State
   that the increment is fixed per model rather than per variant, and therefore proportionally
   largest for exactly the small curated panels the paper identifies as its intended use.
2. **Gas must not be quoted to the individual unit.** `SNP upload gas` is not reproducible at
   that resolution: three runs at identical commit and inputs spanned ~276 gas, and `Total gas`
   inherits the variance. `Model publish gas` and `Compute gas` *are* exactly deterministic.
   Either round to a stated precision or give a spread over repeated runs. A number's
   presentation should not claim more than its measurement supports.

State plainly that the HCU ceiling is unaffected by provenance, since it uses ordinary storage
operations and adds no homomorphic work.

## MS-15 · `R2.7-M1` · Phase 11 · Individual-level results, framed correctly

**Status: `READY`** — measured. See `CD-006`, `CD-014`, `CD-015`, `CD-016`.

Add to `Empirical Evaluation`:

1. **Scatter plot**, Equation 1 PRS against decoded bioETH-PRS, all 200 individuals, generated
   from `evidence/phase5/individual_level_comparison.csv`. Caption should note the points lie
   exactly on the identity line.
2. **Summary table**: n = 200, MAE = 0, RMSE = 0, maximum absolute error = 0, exact matches
   200/200, Pearson *r* = 1. State that *r* = 1 was established in exact decimal arithmetic
   rather than estimated in floating point.
3. **Supplementary material**: all 200 rows.
4. **Rewrite the existing claim.** The submitted text says all 50 individuals agree to machine
   epsilon, citing the TypeScript quantisation advisor. Replace with a citation to this
   independent 200-individual comparison, and state that the submitted evaluation had executed
   the encrypted path for only the *first* individual at each size.

**The framing constraint is the critical part of this spec.** Per `CD-006` the error is zero
**by construction**: every fixture weight carries at most six decimal places and the advisor's
scale is an integer multiple of 10^6, so quantisation is lossless. Do **not** present MAE = 0 as
evidence that the encoding is accurate — that misattributes a property of the input data to the
encoding scheme. State that the comparison validates the **pipeline** — preprocessing,
effect-allele alignment, quantisation, chunked on-chain execution, ACL-gated decryption,
decoding — against an independently derived implementation, and that a nonzero value would have
been a finding.

**Intercept column**, per `R2.7-E1`: state that each fixture carries a leading constant column
(weight 0, dosage 1), so the encoded vector length is nominal + 1 — 101 positions for the
"100 SNP" fixture.

**Category agreement** must not be a single percentage (`CD-014`). Report: 48/48 agreement for
individuals outside the ambiguous band, 2 of 50 within `B` of a threshold where the mechanism is
designed not to be deterministic. Both in-band individuals happened to agree, which is a
favourable noise draw and must not be reported as 50/50. State that the measurement was taken at
one fixture size because classification consumes a single encoded score and is independent of
variant count.

**Mock latency** (`CD-016`): 1.55-1.76 ms per encoded position, mildly superlinear across the
range. Label `Hardhat mock`; it measures neither TFHE evaluation time nor network latency.

## MS-16 · `R1.3-M2` addition · Phase 10 · The bias correction has a boundary cost

**Status: `READY`** — observed directly. See `CD-015`.

`Noisy Output Release` documents adding `expectedNoiseBias() = B/2` to each threshold so the
noisy comparison aligns with the intended plaintext boundary. Add the consequence, which is
currently stated nowhere: if a threshold is derived from the score distribution — a quantile, or
a clinical cut point calibrated on a cohort — then adding `B/2` places the individual *defining*
that cut point exactly `B/2` below the adjusted threshold, i.e. at the centre of the ambiguous
band and the point of maximum classification uncertainty.

Observed rather than inferred: both in-band individuals in the Phase 5 study sat at exactly
64 = `B/2` below their threshold.

Frame it as an inherent trade-off, not a defect: threshold adjustment can correct aggregate bias
or per-individual boundary certainty, not both. A reader following the documented guidance for a
clinically calibrated threshold would otherwise not know that patients nearest the cut point
receive the least reliable classification.

## MS-04 · `R1.4-M1` · Phase 11 · Replace the 2,800-hour claim

**Status: `READY`** — measured in Phase 6. See `CD-017`, `CD-018`, `CD-019`, `CD-020`.

**Delete the calculation; do not repair it.** The submitted derivation is wrong three ways: it
divides a *count of candidate weight values* (2 x 10^4) by a *bit rate*, a units error inflating
the query estimate ~1,400x; its stated intermediate (4,220 windows at W = 1,000 blocks, 12 s per
block) works out to 14,067 hours rather than the 2,800 stated, so the two are mutually
inconsistent; and the measured cost is ~252x lower than claimed. Also remove the Introduction
bullet claiming the controls "raise the cost ... to thousands of hours".

**Replace with the measured two-factor decomposition.** Keeping the factors separate is the
structural fix — collapsing them into one unchecked number is what produced the original error.

*Factor 1, information cost* (rate limiting off, so it is a property of the interface):

| Design | Queries | Pearson r | Sign acc. | Within B |
|---|---:|---:|---:|---:|
| No oracle, raw score | **20** = N | 1.0000 | 100% | 100% |
| Submitted design, caller-chosen thresholds, adaptive | **200** | 1.0000 | 100% | 100% |
| Submitted design, non-adaptive | 320 | 0.6689 | 65% | 0% |
| **Hardened, fixed thresholds, adaptive** | 320 | 0.9391 | 70% | **0%** |
| Hardened + correlated LD probes | 320 | -0.0037 | 65% | 0% |

*Factor 2, permitted rate*: R = 3 per W = 1,000-block window at 12 s per block = 4,000 s per
query. Product: **11.1 hours per weight, 222.2 hours for a 20-weight model** under the submitted
design. State block time as an assumption; note S samples divide wall clock by roughly S.

**Mandated bounded conclusion**, now measured: *the controls reduce output resolution and increase
query cost under the evaluated attacker models; they do not prevent Sybil attacks or provide a
formal model-confidentiality guarantee.*

Four points that must appear:

1. **Resolution reduction, not confidentiality** (`CD-018`). Fixed thresholds recover 0/20 within
   the noise bound against 20/20 for the submitted design, but *r* = 0.94 means relative shape
   still leaks; 70% sign accuracy means the absolute level does not.
2. **Adaptivity converts into precision only when the boundary can move.** That is the mechanism
   by which `R1.4-C1` works, and it is measurable.
3. **The noise bound is 1.34% of the largest weight** (`CD-019`) — ~7 bits of blur on a 13.2-bit
   weight. Choosing B needs the quantised weight distribution, which the advisor already computes.
4. **The correlated-SNP mitigation is vacuous** (`CD-020`) — nothing forces an attacker to use
   correlated probes, because inputs are unvalidated. **Cross-reference `R1.5-M1`**: R1 C4 and
   R1 C5 cannot be answered independently.

State the limits: mock coprocessor, N = 20, one estimator, lower bounds on attacker effort.
Removing the raw-score path is the single largest control — exact extraction in N queries when
`finalize()` is reachable on a private model.

## MS-05 · `R1.1-M1` · Phase 11 · Evidence-class labelling

**Status: `READY` (branch B)** — Phase 7 is blocked on credentials, so the fallback branch
applies. See `CD-024`, `CD-021`, `CD-022`, `CD-023`.

Label every result `Live fhEVM`, `Hardhat mock`, or `Analytic projection`. Delete the sentence
"gas numbers are expected to be within 10--20\% of real-network deployment" — it is an
unsupported extrapolation. Stop placing the `~386 ms` mock latency beside HEPRS real-FHE latency
as though comparable. Replace with: *Hardhat results validate contract logic and transaction
geometry but do not measure real fhEVM latency, HCU availability, or production fees.*

**Two branches. Take B unless a live run has happened.**

*Branch A — a live run exists.* Add the "Live fhEVM validation" paragraph and table row, with
chain ID, contract addresses, transaction hashes, block numbers, host gas, submission-to-result
latency, decryption latency, and the decoded result. In `System Design -> Model Marketplace`,
separate "implemented in the contracts" from "validated on a live network", matching the actual
`R1.1-E2` outcome.

*Branch B — no live run (current state).* State plainly that **every result in the paper is
Hardhat-mock validated**, that no live-network execution was performed, and that live deployment
feasibility is therefore not established. Make no live claim anywhere, including the abstract and
conclusion. `R1.1-E2`'s own fallback wording — "the manuscript explicitly says private-weight
execution is mock-validated only" — applies to **both** the public and private paths, not just
the private one.

Under branch B the paper should also record, because it is verified and strengthens the honesty
of the scope statement, that the contracts are within the EIP-170 size limit (largest 42.4%), the
harness is ready, and the measured Sepolia budget is ~0.13 ETH — i.e. the obstacle is a
credential, not a technical barrier.

**Three measurement corrections that must land regardless of branch:**

1. **The mock HCU ceiling is 21, not 20**, and it is *identical for public and private models*
   (`CD-021`). The old figure came from a coarse candidate list. Report the measured ceiling and
   note that the shipped default of 20 leaves one slot of headroom.
2. **Delete the C×P optimisation claim** (`CD-022`). The paper inherits from `docs/design.md` the
   assertion that the coprocessor optimises ciphertext×plaintext multiplication, making public
   models "~60% cheaper". It does not: `FHE.asEuint64` yields a real handle and the multiplication
   is charged as non-scalar. The true public-vs-private gap is **28%**, from packed storage reads.
   If the scalability discussion mentions per-op cost, note that a 38.8% HCU saving is available
   via the scalar overload and would raise the ceiling to ~34, cutting compute transactions for
   5,000 SNPs from 239 to ~148 — as Future Directions, since it is not implemented.
3. **The Sepolia HCU ceiling is unmeasured** for both visibilities. It must remain `TBD`, not be
   inferred from the mock.

## MS-06 · `R1.2-M2` · Phase 10 · Trust and failure-boundary table

**Status: `READY`** (structure fixed; no measurement needed)

Add to `Security Model → Threat Model`, one row each: genotype provider/preprocessor; model
provider; smart contracts; blockchain consensus; fhEVM coprocessor; Gateway/relayer; ACL and
threshold decryption. For each, state whether failure affects **confidentiality, correctness,
availability, or provenance**. Make `Core Privacy Invariants` explicitly conditional on these
assumptions. Replace `verifiable security properties` in the `fig_security` caption with the
assumptions the layers actually rest on.

## MS-07 · `R2.4-M1` · Phase 11 · Correctness-guarantee boundary table

**Status: `READY`** — unblocked by Phase 3; the independent reference now exists, and Phase 5
supplies the 200-individual agreement its row cites.

Add to `Correctness and Protocol Verification`, naming what each party guarantees: genotype
preprocessor (variant and effect-allele alignment); model provider (weights, thresholds,
scientific validity); smart contracts (deterministic encoded weighted sum); fhEVM infrastructure
(encrypted execution and decryption under its assumptions); independent reference implementation
(agreement with Equation 1); end user (verifies manifest hashes, contract addresses, transaction
record). State explicitly that the protocol guarantees **none** of sample authenticity, clinical
validity, calibration, or ancestry portability.

## MS-08 · Phase 12 · Cost-scope correction carried from `CD-001`

**Status: `BLOCKED`** on `R1.8-E1` (Phase 8) only. `R2.4-E1` landed in Phase 4, which also
quantified the cost of recording provenance — see `CD-012`.

Two further inputs now exist for Phase 8. Provenance adds a flat **+40,568 gas per model**
(`CD-012`). And **private-weight jobs cost 2.01x public ones** — 23.51 M vs 11.69 M gas, 17 vs 15
transactions for a 100-SNP job (`CD-023`). The second matters for framing: the cost discussion is
built on public models while the anti-probing discussion is explicitly about private ones, and
Phase 6 established that extraction is only a threat for private models. The paper must not quote
the public figure while discussing the private threat model.

`CD-001` found that `scripts/gas_profile.ts` and `scripts/probe_hcu_ceiling.ts` write
`ethers.ZeroHash` manifests, and both feed numbers **already printed in the submitted
manuscript** — the gas-scaling curve and the HCU ceiling. Any sentence citing those figures is
therefore currently unreproducible as published. When `R1.8-M1` renames `Deployment Cost
Projections` to `Measured transaction use and fee sensitivity`, the regenerated numbers must come
from post-`R2.4-E1` runs with real hashes, not from the submitted values.

---

# Part 2 — Reviewer responses

## Reviewer 1, Comment 2 — trust language

> The privacy claims should be stated more cautiously. The manuscript argues that bioETH-PRS
> removes the trusted evaluator assumption. This is a meaningful architectural contribution, but
> the system still depends on the correctness and availability of the fhEVM stack, smart
> contracts, ACL/decryption infrastructure, and blockchain consensus. Terms such as "zero trust"
> or "trustless" should be softened or carefully qualified.

**Substantiated now:** none — this is manuscript-only work.
**Blocked on:** MS-01 (Phase 13), MS-06 (Phase 10).

We thank the reviewer for this important comment, and we agree that our original framing overstated what the architecture achieves. The reviewer is correct that removing the designated evaluator is a change in *where* trust resides, not an elimination of trust. bioETH-PRS continues to depend on the correctness of the fhEVM coprocessor, the ACL and Gateway/KMS threshold-decryption infrastructure, the deployed contract bytecode, and blockchain liveness; a failure in any one of these can compromise confidentiality, correctness, or availability irrespective of how the orchestration layer is structured. We have consequently reframed the entire manuscript around *evaluator minimization* rather than trust removal, beginning with the title, which no longer claims computation "without a Trusted Evaluator." We also corrected a specific technical overstatement that the reviewer's comment brings into focus: the graphical abstract previously stated that computation is "verified by blockchain consensus," which conflates auditability with verification. Consensus makes contract execution publicly inspectable and replayable; it does not attest to the correctness of the encrypted evaluation performed by the coprocessor. That claim has been removed wherever it appeared, and the revised text throughout the Abstract, Key Points, Introduction, Discussion, and Conclusion states the residual dependencies explicitly. A full-text search of the revised manuscript returns no unqualified use of "trustless" or "zero trust," and no remaining assertion that consensus alone establishes FHE correctness. In addition, and directly in response to this comment, we have added a trust and failure-boundary table to the Security Model that enumerates each external component — genotype preprocessor, model provider, contracts, consensus, fhEVM coprocessor, Gateway/relayer, and ACL/threshold-decryption infrastructure — together with whether its failure affects confidentiality, correctness, availability, or provenance, so that the reader can see precisely which guarantees are protocol-enforced and which are inherited assumptions.

## Reviewer 1, Comment 3 — differential privacy

> The noisy output oracle does not provide formal differential privacy. The authors acknowledge
> that the current mechanism is DP-inspired rather than a calibrated (epsilon, delta)-differential
> privacy guarantee. Given the sensitivity of genomic data, this limitation should be emphasized
> more prominently. If the authors wish to retain strong privacy language, they should provide a
> formal adjacency definition, sensitivity analysis, and privacy-parameter calibration.

**Substantiated now:** `R1.3-M2` code half — commit `b0c86a4`, 10 files, bytecode-identity proof.
**Blocked on:** MS-02 (Phase 10) for the manuscript wording and final page/line refs.

We thank the reviewer for this comment and we agree without reservation. On reflection we concluded that our "DP-inspired" framing was itself the problem rather than an adequate hedge: any DP-adjacent phrasing invites a reader to infer a formal guarantee that our construction does not deliver, and a hedged claim about genomic privacy is not meaningfully safer than an unhedged one. We have therefore removed the term from the manuscript and from the codebase and replaced it throughout with "bounded randomized categorical release." The three specific reasons the mechanism cannot support an \((\varepsilon,\delta)\) claim are now stated explicitly wherever it is described rather than left to be inferred: the noise is one-sided, drawn uniformly from \([0,B)\) rather than symmetrically about zero; it is not calibrated against any sensitivity bound; and repeated queries are subject to no composition accounting. No adjacency definition, sensitivity analysis, or composition analysis exists in the implementation, and the revised text says so plainly. We want to be equally clear about what we did *not* do: we did not alter the implemented distribution in order to retain the stronger terminology. The mechanism remains `FHE.randEuint64(noiseUpperBound)` exactly as submitted, and we verified this rather than merely asserting it — the deployed bytecode of `ResultOracle`, with the source-hash metadata trailer stripped, is byte-for-byte identical before and after the renaming. The retained description now covers only what is actually implemented: the mechanism \(e_{\mathrm{noisy}} = e + \nu\) with \(\nu \sim \mathrm{Uniform}(0,B)\), its one-sided support, the resulting expected upward bias of \(B/2\), and the threshold adjustment that corrects it. The "DP bias" heading in Limitations is renamed "One-sided randomization and bias," and formal adjacency, sensitivity analysis, and calibrated differential privacy now appear only in Future Directions, as objectives rather than properties. We also note that the terminology is now consistent across the contract documentation, the test suite, and the paper, so a reader auditing the implementation against the manuscript will find the same non-DP name in both.

## Reviewer 1, Comment 5 — SNP authenticity

> The inability to verify submitted encrypted SNPs is a major unresolved security issue. The
> system verifies access to a registered sample but cannot confirm that the submitted encrypted
> SNP values faithfully represent that sample. This allows malicious users to submit crafted
> inputs, which directly affects model-probing and misuse risks. This issue should be moved from
> a limitation to the main security discussion.

**Substantiated now:** `R1.5-T1` — the trust-boundary test, commit `b0c86a4`.
**Blocked on:** MS-03 (Phase 10) for relocation, the `fig_security` caption, and page/line refs.

We thank the reviewer for this comment and we accept the reclassification. The reviewer is correct that this is a property of the security model rather than a peripheral limitation, and that its consequences for model probing and misuse make its former placement in a late subsection inappropriate. We want to state the boundary precisely: `GenomicRegistry.hasAccess` gates *who* may open a job against a registered sample, but nothing in the protocol binds *what* is subsequently uploaded to that sample. The contracts guarantee correct computation over the ciphertexts that were submitted; they do not prove that those ciphertexts encode genotypes derived from the registered sample. The full discussion has been moved into the Security Model immediately after the Threat Model, and the threat model now includes an explicit malicious-but-authorized requester who may upload arbitrary encrypted values. Beyond relocating the prose, we have made the boundary visible in the implementation. The test suite already contained a regression test showing that the engine accepts arbitrary encrypted SNP values, but it read as an incidental observation; it is now named as a trust-boundary record and carries a comment block stating what is and is not guaranteed. Its inputs are deliberately invalid diploid dosages — 9 and 11, where only 0, 1, and 2 are biologically meaningful — and the engine computes over them and reports a score without objection, which is precisely the capability that makes model probing feasible in the first place. The comment also instructs future maintainers to update the Security Model and the manuscript if that test ever begins to fail, since that would signal a change in the guarantee. We are explicit that `registerSampleWithManifest` does not close this gap: `manifestHash` commits to preparation metadata such as genome build, input-file hash, variant order, and preparation policy, and is therefore a provenance commitment only — it is not a cryptographic binding between a ciphertext and a sample, and we do not present it as a proof. Signed laboratory attestation and a zero-knowledge ciphertext-to-sample proof are identified in Future Directions as the mechanisms that would genuinely close it. The setting we evaluate is consequently one of trusted genotype preparation by the patient's local pipeline, an accredited laboratory, or an approved data custodian, and we now state that assumption where the privacy invariants are introduced rather than after them.

## Reviewer 1, Comment 4 - model extraction and adaptive querying

> The manuscript estimates that model extraction would require thousands of hours under
> recommended rate-limiting settings. However, this calculation appears heuristic and does not
> fully address adaptive querying, multiple-wallet attacks, threshold manipulation, correlated
> SNP structure, or cross-sample probing. A stronger adversarial analysis is needed before the
> anti-probing claims can be considered established.

**Substantiated now:** `R1.4-C1`, `R1.4-T1` (Phase 2) and `R1.4-E1` (Phase 6) -
`evidence/phase2/`, `evidence/phase6/`.
**Blocked on:** MS-04 (Phase 11) for the manuscript text, MS-09 (Phase 9/10) for the algorithms.

*An earlier draft of this response, written before the adversarial evaluation ran, promised
measurements it did not have; it has been replaced by this one rather than kept alongside it.*

We thank the reviewer for this comment, which proved the most consequential of the review, and we should begin by conceding more than was asked. The reviewer suspected our extraction estimate was heuristic. On re-deriving it we found it was not merely heuristic but incorrect in three independent ways. The calculation divides two times ten to the fourth, which is a count of candidate weight values, by a rate of bits per query; dividing a count of values by a bit rate is a dimensional error, and the information actually required is the logarithm of that count, about fourteen bits rather than twenty thousand of them, which alone inflates the query estimate by roughly three orders of magnitude. Separately, the stated intermediate result and the stated conclusion are mutually inconsistent: four thousand two hundred and twenty windows of one thousand blocks at twelve seconds per block is about fourteen thousand hours, not the two thousand eight hundred we reported, and the figure we reported is instead consistent with a window of roughly two hundred blocks, contradicting the window size given in the same sentence. Finally, and most importantly, we have now measured the attack rather than estimating it, and the true cost is about two hundred and fifty times lower than we claimed. We have deleted the calculation rather than attempting to repair it. In its place we report an adversarial evaluation in which every query is a real job against real contracts, and we deliberately separate the two factors whose conflation produced the original error: the information cost of extraction, measured in queries with rate limiting disabled, and the permitted query rate, measured separately. Against the design as submitted, an adaptive attacker recovers every weight of a twenty-weight private model to within the noise bound in two hundred queries, ten per weight, which closely matches the corrected information-theoretic bound of nine and is the main reason to trust the measurement over the estimate. At our own recommended settings of three queries per thousand-block window and twelve-second blocks, that is eleven hours per weight and two hundred and twenty-two hours for the model, against the two thousand eight hundred hours per weight we claimed. We address each of the five capabilities the reviewer names. On adaptive querying, adaptivity is decisive but only where the attacker controls the decision boundary: with caller-chosen thresholds an adaptive attacker recovers everything, while a non-adaptive one recovers nothing to within the noise bound at the same budget. On threshold manipulation, this was not a weakness in our analysis but a flaw in our protocol, and we have removed the capability rather than bounding it; the classification entry point no longer accepts thresholds at all, and our tests assert their absence at the level of the compiled interface. Measured against the frozen submitted contracts, that change takes recovery from all twenty weights to none within the noise bound. On multiple wallets, the same-sample bypass is closed: a second and third wallet obtained no additional queries against a registered sample whose window was exhausted. On cross-sample probing, distinct wallets holding distinct samples do each receive an independent quota, which we state plainly as the remaining Sybil boundary, noting that for a private model each additional wallet must also be authorised by the model owner, so expansion is gated by an explicit allowlist rather than by rate limits alone. On correlated SNP structure, recovery does collapse when probes are confined to linkage blocks, but we decline to present that as a defence: nothing compels an attacker to submit correlated genotypes, because the contracts do not validate inputs, which is the same trust boundary raised in the reviewer's fifth comment. We therefore cross-reference the two responses, since the unverifiable-input gap is precisely what makes the strongest probing attack expressible, and the honest measure of attacker capability is the arm in which probes are chosen freely. Two further findings emerged that we report against our own interest. First, the hardening reduces resolution rather than conferring confidentiality: no weight is recovered to within the noise bound, but the correlation between the true and estimated weight vectors remains about zero point nine four, so the relative shape of the model still leaks even though its absolute level does not, and we now claim only the former. Second, our recommended noise bound is too small to matter much: at a scale of one million, a bound of one hundred and twenty-eight is one and a third percent of the largest quantised weight, about seven bits of blur on a thirteen-bit weight, so it conceals roughly the lower half of each weight and nothing above it. Choosing that bound properly requires reference to the quantised weight distribution, which our advisor already computes, and we have moved calibrated selection of it to Future Directions. Our revised claim is accordingly bounded: the controls reduce output resolution and increase query cost under the attacker models we evaluated, and they neither prevent Sybil attacks nor provide a formal model-confidentiality guarantee. We also state that these figures are lower bounds on attacker effort under the strategies we implemented, and that the absence of a better attack in our evaluation is not evidence that none exists.

## Reviewer 2, Comment 2 — genotype quality control

> Does bioETH-PRS require quality control of the genotype data, like missing value, minor
> allele frequency, etc? Please clarify this in the manuscript.

**Substantiated now:** `R2.2-C1`, `R2.2-T1` — `validation/`, `evidence/phase3/`.
**Blocked on:** MS-10 (Phase 9) for the Methods subsection and page/line refs.

We thank the reviewer for raising this, because the submitted manuscript genuinely did not say what happens to a genotype that fails quality control, and on re-reading we found the omission was not merely editorial: the pipeline's behaviour was defined only in code, and in one respect it was defined badly. We have added a Methods subsection, "Genotype preprocessing, QC, and model alignment," placed before the cryptographic pipeline, and we have implemented every rule it states in an independent validator so that the description is a transcription of executable behaviour rather than an intention. We also want to distinguish two categories that the question productively conflates. Minor allele frequency and Hardy–Weinberg filtering are cohort and model-development quality control: they are applied upstream, when the GWAS weights are derived, and bioETH-PRS neither performs nor can perform them, because it never sees a cohort — it scores one individual against a published model. Missingness, allele orientation, and genome-build matching are by contrast scoring-time checks that must happen per request, and those are the ones the protocol is responsible for. On each of them we now state a definite rule. Genotypes must be diploid hard calls in {0, 1, 2}; a non-integer dosage such as 0.7 from imputation, or an out-of-range value such as 9, is rejected rather than clamped, because clamping silently changes the score and produces a plausible number from invalid input. Missing variants are governed by a policy that is a required field of the model manifest, with no default value: the caller must choose explicitly between rejecting the sample, imputing a zero dosage, and imputing the cohort mean hard call. We made the absence of a default deliberate, having concluded that an implicit zero is the most dangerous option available, since it is indistinguishable from a genuine homozygous-reference call and silently biases the score downward for every missing risk allele. Genome build must be declared alongside the genotypes and must match the model's, and a mismatch is fatal rather than a warning, because the same variant identifier can denote different positions across builds and scoring would otherwise return a meaningless number that looks entirely normal. Variant order is verified element by element rather than by length, since the dot product is positional and a reordering pairs every dosage with the wrong weight. Duplicate variant identifiers, multiallelic sites, and indels are rejected, as this study evaluates biallelic SNP hard calls only. Every run emits counts of matched, missing, imputed, invalid, and rejected variants, so a partially scored sample cannot be mistaken for a complete one. We also state a caveat about our own fixtures: the HEPRS fixtures are bare numeric matrices carrying no identifiers, build, or allele labels, so they are assumed pre-aligned and no build or strand validation is possible on them; the QC and alignment logic is exercised instead by known-answer cases in which the metadata is specified.

## Reviewer 2, Comment 3 — effect-allele versus minor-allele coding

> For some cases, the genotype of a SNP may be coded as 0, 1, 2 in terms of the number of
> risk alleles; but during the weights derivation, the genotype of that SNP in an independent
> dataset may be coded as 2, 1, 0 in terms of the number of minor alleles (when the risk
> allele is not the minor allele). Although we can require the genotype and the weights are
> provided with consistent coding, how to validate this requirement when they are totally
> blinded to each other? How does bioETH-PRS handle such situation?

**Substantiated now:** `R2.3-C1`, `R2.3-T1` — `validation/`, `evidence/phase3/`.
**Blocked on:** MS-11 (Phase 9) for the Methods text and page/line refs.

We thank the reviewer for this comment, which identified a real imprecision in our formulation rather than only a gap in our exposition. Equation 1 defined the dosage as "the allele dosage," which is ambiguous in exactly the way the reviewer describes, and we have corrected it to state that it is the dosage of the model-specified effect allele. The manuscript no longer treats "minor allele" and "effect allele" as interchangeable anywhere. On the substance of the question — how alignment can be validated when the genotypes and the weights are blinded to one another — we think the premise deserves a direct answer, because the blinding is narrower than it first appears. Encrypting the weights conceals their magnitudes; it does not conceal the allele labels needed to orient a genotype. The model's public metadata exposes variant identity, genome build, effect allele, other allele, and column order even when the weight values themselves remain encrypted, and alignment is performed locally by the requester before any encryption takes place. The two parties are therefore blinded with respect to the quantities that must stay private, and not blinded with respect to the metadata that alignment actually requires; there is no need to inspect a weight in order to know which allele it refers to. Concretely, when the available dosage counts the opposite allele at a diploid biallelic SNP, we apply g_effect = 2 - g_other, and our tests confirm that a reversed effect allele maps [0, 1, 2] to [2, 1, 0] while an already-aligned variant is left unchanged. We also handle the harder case the question implies. Where the effect allele matches neither the reference nor the alternate allele but its complement does, and the allele pair is not self-complementary, the effect allele has been reported on the opposite strand and we complement it before applying the flip rule. Where the pair is palindromic — A/T or C/G — we reject the variant as strand-ambiguous even when the effect allele appears to match a label literally, and we want to be explicit that this is the case we cannot solve rather than one we solve quietly: for an A/T SNP, effect allele A is consistent both with the forward alternate allele and with the reverse-strand reading of the reference, so aligning on the label alone would silently flip roughly half of such variants. Rejecting them is the only honest behaviour available without external strand information, and the validator accepts them only when a manifest explicitly records that the strand has been resolved from another source. The validator reports match, flip, strand-ambiguous, and rejected counts for every run.

## Reviewer 2, Comment 6 — double programming and independent validation

> If I need double programming or independent validation of the final calculated PRS, could
> bioETH-PRS incorporate this?

**Substantiated now:** `R2.6-C1`, `R2.6-T1` — `validation/`, `evidence/phase3/`.
**Blocked on:** an "Independent validation" paragraph in `Correctness and Protocol
Verification` (Phase 11), and final page/line refs.

We thank the reviewer for this suggestion, which we adopted, and we would note that acting on it materially improved the paper beyond answering the question. bioETH-PRS now ships an independent reference implementation of the entire scoring pipeline, together with a single command that executes both implementations over the same immutable inputs and returns pass or fail. The reference is written in Python, depends on nothing outside the standard library, and implements preprocessing, effect-allele harmonisation, Equation 1, the three-step quantisation, decoding, and comparison. We were careful about what "independent" is allowed to mean here, because two transliterations of one another agree by construction and demonstrate nothing: the reference was derived from the published specification in the manuscript rather than from the existing TypeScript helpers, and it neither imports nor transcribes them. We record the ordering explicitly, since the ordering is the substance of the claim — the reference was complete and all fifty-six of its known-answer checks were passing before the TypeScript implementation was consulted at all, to build the contract-side arm of the comparison. On the three known-answer cases, chosen to cover all-positive weights, mixed signed weights including a negative score, and a reversed effect allele, the two implementations agree exactly, at a comparison tolerance of zero rather than an approximate one; encoded scores are deterministic integers on both sides, so any difference would be a genuine disagreement rather than a rounding artifact. The reference also reproduces the worked example printed in the manuscript exactly. We would emphasise that the independence was not a formality: three defects in the published specification surfaced precisely because the reference followed the paper rather than the code. The weight zero-point is defined in the manuscript without a clamp that both implementations in fact apply, and would be negative and therefore unstorable for an all-positive weight vector; the rounding operator is written without a tie-breaking convention, and the two implementations had silently chosen different ones; and the reconstruction accuracy we described as machine-epsilon is in fact exactly zero on our fixtures, for the non-generalising reason that the source weights carry six decimal places and the recommended scale therefore quantises them losslessly. All three are corrected in the revised manuscript. Finally, we are explicit about the epistemic status of the exercise: this is independent-implementation agreement, not a proof of correctness, and it establishes nothing about sample authenticity, clinical validity, calibration, or ancestry portability. We describe it in those terms in the paper.

## Reviewer 2, Comment 4 - how do I know I can trust these numbers?

> How and who to guarantee the final PRS provided by bioETH-PRS is correctly computed? In other
> words, the bioETH-PRS will eventually provide some numbers. But how do I know I can trust
> these numbers?

**Substantiated now:** `R2.4-E1` (provenance) and `R2.6-C1` (independent reference) -
`evidence/phase4/`, `evidence/phase3/`.
**Blocked on:** MS-07 (Phase 11) for the correctness-guarantee table, MS-14 (Phase 11/12) for
the restated gas figures, and final page/line refs.

We thank the reviewer for this question, which we found to be the most demanding of the review, because answering it honestly required us to admit that the submitted version did not support the trust it invited. Our answer has three parts: what the protocol guarantees, what it explicitly does not, and what a reader can independently check. On the first, we have added a table to Correctness and Protocol Verification that assigns each guarantee to a named party rather than leaving it to the architecture in general. The genotype preprocessor is responsible for variant and effect-allele alignment; the model provider for the weights, the release thresholds, and the scientific validity of the model; the smart contracts for computing a deterministic encoded weighted sum over whatever ciphertexts were submitted; the fhEVM infrastructure for encrypted execution and decryption under its own assumptions; the independent reference implementation for agreement with Equation 1; and the end user for verifying manifest hashes, contract addresses, and the transaction record. On the second, we state without qualification that the protocol guarantees none of sample authenticity, clinical validity, calibration, or ancestry portability, and that blockchain consensus does not establish biological correctness - consensus makes the orchestration auditable, and nothing more. On the third, and this is the substantive change, the reviewer's question exposed a concrete defect: the evaluation code committed a zero hash in place of every model and sample manifest hash, so a figure printed in the manuscript could not be traced back to the fixture that produced it. Trust in a number requires the number to be attributable, and ours were not. Every evaluation script now records the repository commit, the digests of the exact input files, the model manifest, the deployed contract addresses together with their bytecode digests, and the digest of the independent reference output the run was checked against, and a regression test fails the build if any of that is reintroduced as a placeholder. We would highlight that this change immediately justified itself by exposing a second error we would otherwise have published: linking the reference output to the on-chain run forced the two to be compared directly for the first time on real fixture data, and they disagreed by a factor of exactly three, because our reference had been configured with the wrong quantisation scale for two of the four fixtures. Neither implementation was at fault; a parameter was. The reference and the contract path now agree exactly on the fixture we validate end to end. Finally, we report a consequence that bears on the reviewer's question about trusting numbers in general. Recording real provenance costs 40,568 gas per model, so the model-publication figures in the submitted manuscript correspond to a configuration in which provenance was not recorded, and we have restated them. We also found that our upload-path gas measurements are not reproducible to the individual gas unit across runs, although model publication and compute are, so we no longer quote gas at a precision the measurement does not support.

## Reviewer 2, Comment 7 - individual-level agreement with Equation 1

> In the Empirical Evaluation section, I was expecting to see that the individual PRS calculated
> by bioETH-PRS is consistent with the PRS calculated from Equation 1. Could the authors provide
> that information?

**Substantiated now:** `R2.7-E1` - `evidence/phase5/`, 200-row comparison.
**Blocked on:** MS-15 (Phase 11) for the scatter plot, metrics table, and supplement.

We thank the reviewer for asking for this directly, because the expectation was reasonable and the submitted manuscript did not meet it. On re-examining our own evaluation we found that the encrypted contract path had been executed for only the first individual at each fixture size; the remaining forty-nine were checked for unsigned-integer overflow on the client side and never compared against a decoded on-chain result. The agreement we claimed was therefore narrower than a reader would reasonably have inferred. We have now run all fifty individuals at each of the four fixture sizes, two hundred jobs in total, each a separate job against a single published model, and compared every decoded score against Equation 1 as computed by an independent reference implementation. All two hundred agree exactly: mean absolute error, root-mean-square error, and maximum absolute error are all zero, every individual is an exact match, and the Pearson correlation is exactly one, which we establish in exact decimal arithmetic rather than estimating in floating point. The full two hundred rows are provided as supplementary material, with a scatter plot and summary table in the main text. We want to be careful about what this does and does not establish, because the result is stronger than we can honestly take credit for. The error is zero by construction rather than by measurement: every weight in these fixtures is distributed with at most six decimal places, and the quantisation advisor's recommended scale is an integer multiple of one million, so the fixed-point encoding is lossless and no rounding occurs at all. Reporting zero error as evidence that our encoding is accurate would attribute to the scheme a property that belongs to the input data, and we have revised the Quantisation Accuracy discussion accordingly. What the comparison does validate is the pipeline end to end - genotype preprocessing, effect-allele alignment, quantisation, chunked homomorphic execution on chain, access-controlled decryption, and decoding - against an implementation derived independently from the published specification, and a nonzero value would have been a genuine finding rather than a rounding artifact. We also report, per the reviewer's mention of categories, that classification agreement is exact for all forty-eight individuals whose scores lie outside the noise band around a threshold, with two of fifty falling inside it. We deliberately do not report this as fifty out of fifty: the release mechanism adds one-sided noise, so an individual within the noise bound of a threshold may legitimately classify on either side, and the two in-band individuals agreeing on our run reflects a favourable draw rather than a guarantee. Finally, we note an explicit detail that affects how these counts should be read: each fixture carries a leading constant column with weight zero and dosage one, so the encoded vector length is the nominal variant count plus one - one hundred and one positions for the fixture we describe as one hundred SNPs.

## Not yet drafted

Do not pre-write these; each needs its Stage A evidence first.

| Comment | Topic | Blocked on |
|---|---|---|
| R1 C1 | Mock-only evaluation | `R1.1-E1`, `R1.1-E2` (Phase 7) |
| R1 C6 | Scale / bounded intended use | `R1.6-E1` (Phase 8) |
| R1 C7 | HEPRS comparison by dimension | Phases 7–8 |
| R1 C8 | Cost projections | `R1.8-E1` (Phase 8) |
| R2 C1 | Narrow SNP class | Phase 8 |
| R2 C5 | Interpretability of the encoded pipeline | Phase 9 |

---

# Part 3 — Citable evidence identifiers

Stable references the manuscript and response letter may cite. Keep in sync with the code.

| ID | Artifact | Cites |
|---|---|---|
| EV-01 | `test/prs_compute_engine_chunked_snp_test.ts` → `TRUST BOUNDARY: accepts arbitrary encrypted SNP values, including invalid hard calls — ciphertext/sample binding is not enforced on-chain` | MS-03; R1 C5 |
| EV-02 | `test/rate_limit_randomized_release_test.ts` (renamed from `rate_limit_dp_test.ts`) | MS-02; R1 C3 |
| EV-03 | `contracts/ResultOracle.sol` `@dev` TERMINOLOGY block | MS-02; R1 C3 |
| EV-04 | `evidence/phase1/README.md` — bytecode-identity proof, sha256 `c9d1640a...b056332`, 3541 bytes | R1 C3 |
| EV-05 | `evidence/baseline/` — node 22 baseline: 137 passing, 11 contracts, 100-SNP mock validated | MS-05 |
| EV-06 | `evidence/baseline/wide/` — pre-Phase-2 gas, HCU, and quantization artifacts | MS-08 |
| EV-07 | `contracts/ModelMarketplace.sol` `ReleasePolicy` struct + `setReleasePolicy` | MS-09; R1 C4 |
| EV-08 | `test/job_lifecycle_test.ts` → `R1.4-T1: no protected classification entry point accepts requester thresholds` | MS-09; R1 C4 |
| EV-09 | `evidence/phase2/gas_delta.md` and `release_policy_gas.txt` — +0.0009% total gas, 77,314 gas per policy | R1 C4; MS-08 |
| EV-10 | `test/rate_limit_randomized_release_test.ts` → `blocks the same sample across requesters when the sample window is exhausted` | R1 C4 (Sybil boundary) |
| EV-11 | `validation/independent_prs_reference.py` — independent Python reference, stdlib only | MS-10, MS-11, MS-12, MS-13; R2 C2, C3, C6 |
| EV-12 | `npm run validate:cross-language` — one-command pass/fail, tolerance 0, 3 cases | R2 C6 |
| EV-13 | reference self test — 56/56 checks, incl. orientation and every QC rule | R2 C2, C3 |
| EV-14 | `validation/cases/*.json` — 27 hand-computed expectations, all re-derived and agreeing | R2 C6 |
| EV-15 | `evidence/phase3/reference/heprs_*snp_reference.json` — expected answers, all 200 individuals, round-trip error 0 | MS-13; R2 C7 |
| EV-16 | `scripts/utils/provenance.ts` - commit, input digests, bytecode digests, reference-output digest | MS-14; R2 C4 |
| EV-17 | `test/provenance_guard_test.ts` - 9 tests; zero-hash regression guard incl. exemption-list staleness | R2 C4 |
| EV-18 | `evidence/phase4/gas_delta.md` - +40,568 gas/model for real provenance, attributed by phase | MS-14, MS-08; R1 C8 |
| EV-19 | 100-SNP cross-validation: reference and contract agree at `encodedScore = 758,685` | R2 C4, C7 |
| EV-20 | `evidence/phase5/individual_level_comparison.csv` - 200 rows, all exact | MS-15; R2 C7 |
| EV-21 | `evidence/phase5/summary_statistics.json` - MAE/RMSE/max = 0, Pearson r = 1 exact | MS-15; R2 C7 |
| EV-22 | `evidence/phase5/category_agreement_100snp.json` - 48/48 outside band, 2/50 in band | MS-15; R2 C7, R1 C3 |
| EV-23 | `scripts/individual_level_validation.ts` - runner, `npm run validate:individual-level` | MS-15 |
| EV-24 | `evidence/phase6/anti_probing_results.json` - 6 arms, extraction-cost curve, wall-clock derivation | MS-04; R1 C4 |
| EV-25 | `contracts/attack-baseline/` - frozen `2d6f21d` design, byte-faithful | MS-04; R1 C4 |
| EV-26 | `test/attack_baseline_isolation_test.ts` - 6 tests: fidelity + never deployable | R1 C4 |
| EV-27 | `scripts/anti_probing_evaluation.ts` - `npm run evaluate:anti-probing` | MS-04 |
| EV-28 | `evidence/phase7/live_preflight.json` - deployment gas, both job variants, Sepolia budget, harness readiness | MS-05, MS-08 |
| EV-29 | `evidence/phase7/hcu_public.txt`, `hcu_private.txt` - ceiling 21 for both visibilities | MS-05 |
| EV-30 | `scripts/live_preflight.ts` - `npm run preflight:live` | MS-05 |

## Commit trail

| Commit | Contents |
|---|---|
| `2d6f21d` | Submitted snapshot |
| `0ebbfda` | Frozen RTR baseline: docx, tex, plan |
| `b935d5f` | Phase 0 evidence store |
| `e4c968c` | Phase 0 complete; node 22 pinned; `CD-002` closed |
| `b0c86a4` | Phase 1: DP framing removed, trust boundary labelled |
| `7870d4c` | Phase 2: release policy fixed and immutable; requester thresholds removed |
| `88ecb89` | Phase 3: independent Python reference; cross-language agreement at tolerance 0 |
| `bb0ddfd` | Phase 4: real provenance across all evidence-producing code; zero-hash guard |
| `29836a6` | Phase 5: 200-individual Equation 1 comparison, all exact |
| `7c1ffd2` | Phase 6: adversarial evaluation; 2,800-hour claim refuted and replaced |
| `<phase7>` | Phase 7: live runs blocked on credentials; HCU/optimisation/private-cost findings |
