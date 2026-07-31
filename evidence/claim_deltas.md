# Claim deltas

Every submitted-manuscript claim, or plan assumption, that Stage A evidence contradicts,
weakens, or fails to support. Stage A **records** deltas here and does not edit the
manuscript. Stage B works through this file and resolves each entry.

Columns: `ID` · what the submitted text or plan says · what the evidence shows · which action
resolves it.

Status: `open` · `resolved-in-tex` · `withdrawn`

---

## CD-001 — `R2.4-E1` file scope is understated

- **Opened:** Phase 0, 28 July 2026
- **Status:** open
- **Resolves via:** `R2.4-E1` (Phase 4)

The plan lists three files for zero-manifest-hash remediation: `scripts/sepolia_validation.ts`,
`scripts/heprs_fixture_profile.ts`, and `test/heprs_fixture_test.ts`. A repository-wide search
finds `ethers.ZeroHash` in **ten** files:

| File | Occurrences | Produces reported evidence? |
|---|---:|---|
| `scripts/sepolia_validation.ts` | 4 | Yes — live and mock validation runs |
| `scripts/heprs_fixture_profile.ts` | 4 | Yes — HEPRS fixture timing and gas |
| `scripts/gas_profile.ts` | 4 | Yes — gas vs SNP-count curve |
| `scripts/probe_hcu_ceiling.ts` | 4 | Yes — HCU ceiling figures |
| `test/heprs_fixture_test.ts` | 8 | Yes — fixture correctness |
| `test/rate_limit_randomized_release_test.ts` | 6 | Yes — anti-probing behaviour |
| `test/registry_marketplace_oracle_test.ts` | 18 | No — unit fixtures |
| `test/model_marketplace_chunked_test.ts` | 19 | No — unit fixtures |
| `test/prs_compute_engine_chunked_snp_test.ts` | 13 | No — unit fixtures |
| `test/job_lifecycle_test.ts` | 2 | No — unit fixtures |

`scripts/gas_profile.ts` and `scripts/probe_hcu_ceiling.ts` both feed numbers that appear in
the submitted manuscript (gas scaling curve, HCU ceiling) yet were not in the plan's
remediation list. **Action:** extend `R2.4-E1` to all six evidence-producing files. Unit-test
fixtures may keep `ZeroHash`, since they assert contract logic rather than report measurements.

---

## CD-002 — Baseline artifacts were produced on an unsupported node runtime

- **Opened:** Phase 0, 28 July 2026
- **Status:** **resolved** (Phase 0, 28 July 2026)
- **Resolved by:** installing nvm 0.40.6 and pinning node v22.23.1, then re-capturing the
  entire baseline from a fresh `npm ci`

`.nvmrc` pins node 22; the first Phase 0 capture ran on the system node v25.5.0 and Hardhat
2.22 warned `You are currently using Node.js v25.5.0, which is not supported by Hardhat`.
Compile and all 137 tests passed regardless, but a measurement taken on an unsupported runtime
is not defensible in a manuscript under review for evidence quality.

Resolution: nvm 0.40.6 installed at `~/.nvm` with the loader added to `~/.zshrc`; node
v22.23.1 (npm 10.9.8) installed and set as the default alias. `node_modules` was rebuilt from
scratch with `npm ci` so no native module retained the node 25 ABI, then `npx hardhat clean`
forced a full recompile. Re-captured results are identical — 11 contracts compiled, **137
passing**, 100-SNP mock validation passing — and the unsupported-runtime warning is absent
from `baseline/compile.txt`.

**Standing rule for the rest of Stage A:** run `nvm use` (which reads `.nvmrc`) before any
command that produces a reportable number. Every artifact in `evidence/` must record its
runtime in the same way `baseline/environment.txt` does.

---

## CD-003 — `R1.3-M2`'s code scope was 10 files, not the 2 the plan named

- **Opened:** Phase 1, 28 July 2026
- **Status:** **resolved** (Phase 1, 28 July 2026)
- **Resolved by:** extending the rename to every file that carried DP framing

The plan scoped the code half of `R1.3-M2` to `contracts/ResultOracle.sol` and
`test/rate_limit_dp_test.ts`. A repository-wide search found DP framing in ten files. Leaving
any of them would have let Stage B pick up "DP-inspired" from repo documentation and reintroduce
the exact wording Reviewer 1 objected to.

Renamed: `contracts/ResultOracle.sol`, `CLAUDE.md`, `README.md`, `docs/design.md`,
`docs/onboarding.md`, `docs/roadmap.md`, `docs/reference.md`,
`.claude/instructions/solidity-fhevm.md`, `.claude/commands/security-review.md`.

Two findings inside this scope correction:

1. **`test/rate_limit_dp_test.ts` needed no description changes.** Its `describe` blocks
   already read `Noisy Release Hardening`. Only the *filename* carried `dp`, so the file was
   renamed to `test/rate_limit_randomized_release_test.ts`. The plan's assumption that test
   descriptions said "DP" was wrong.
2. **`docs/reviewer-questions-assessment.md` was not rewritten.** It records a *previous*
   review round in which "DP-inspired" was itself the agreed remediation. Rewriting it would
   erase that history and make the document self-contradictory. It received a supersession
   banner instead, explaining that RTR Reviewer 1 Comment 3 rejected the earlier wording and
   pointing at the current terminology. Its "Recommended wording" block is marked do-not-reuse.

**Standing rule for Stage B:** the manuscript adopts **"bounded randomized categorical
release"** verbatim. Do not coin a third variant.

---

## CD-004 — Two submitted-manuscript algorithms show an interface that no longer exists

- **Opened:** Phase 2, 28 July 2026
- **Status:** open
- **Resolves via:** `R1.4-C1` manuscript conformity in Phase 9/10, and `R1.4-M1` in Phase 11

Both paper algorithms — `Classic chunked PRS computation` and `Streaming PRS computation` —
show the requester passing \(\tau_L, \tau_H\) into classification. After Phase 2 the requester
passes only a job id; the thresholds are model-defined and immutable. Both algorithm listings
must be redrawn, and `Noisy Output Release` must state that thresholds are fixed before any
query is possible.

Two further conformity items found while implementing:

1. **`setOracleRequired` / `setApprovedOracle` are gone**, not merely superseded. Any manuscript
   or documentation sentence describing a two-step "enable oracle mode, then register an
   approved oracle" workflow is now wrong. The workflow is a single `setReleasePolicy` call
   before `finalizeModel`.
2. **Multi-wallet coverage already existed.** `R1.4-T1` asked for tests proving a registered
   sample stays rate-limited across wallets. Two such tests were already present and passing
   (`blocks the same sample across requesters when the sample window is exhausted`,
   `rate limits are independent across different samples and requesters`). No new tests were
   needed for that half of the action, but the manuscript must cite the existing tests rather
   than claim new ones, and must state plainly that they document a **remaining Sybil boundary**
   rather than closing it: distinct wallets with distinct registered samples still receive
   independent windows.

## CD-005 — Phase 6's attack baseline cannot come from the shipped contracts

- **Opened:** Phase 2, 28 July 2026
- **Status:** open
- **Resolves via:** `R1.4-E1` (Phase 6)

`R1.4-E1` must compare fixed thresholds against "the old caller-selected threshold design."
Retaining a legacy threshold-taking entry point in the shipped contracts would violate
`R1.4-C1`'s completion criterion ("No protected classification entry point allows the requester
to choose thresholds"), so none was kept.

The baseline arm must therefore deploy the pre-Phase-2 contracts from the frozen snapshot
`2d6f21d`. This is strictly better than a legacy shim: it measures the **genuine submitted
design** rather than an approximation, and it keeps the shipped contracts free of an attack
surface that exists only for benchmarking. Phase 6 must record which commit each arm was
compiled from.

---

## CD-006 — Quantisation on the HEPRS fixtures is *exact*, not "machine-epsilon", and the reason does not generalise

- **Opened:** Phase 3, 28 July 2026
- **Status:** open
- **Resolves via:** `R2.7-M1` (Phase 11) and the `Quantisation Accuracy` subsection

Measured with the independent reference over all four fixtures:

| Nominal | Weights | Max decimal places | Exact at `s = 10^6` | Max round-trip \|error\| |
|---:|---:|---:|:---:|---:|
| 100 | 101 | 6 | 101 / 101 | **0** |
| 500 | 501 | 6 | 501 / 501 | **0** |
| 1,000 | 1,001 | 6 | 1,001 / 1,001 | **0** |
| 5,000 | 5,001 | 6 | 5,001 / 5,001 | **0** |

Every one of the 6,604 fixture weights is distributed with at most six decimal places.
At the advisor's recommended scale of \(10^6\), `round(s * beta)` therefore performs **no
rounding at all** — each weight maps to an exact integer — and the decode round trip is
exactly zero, not machine epsilon.

Two consequences for the manuscript:

1. **The claim is understated but for a non-generalising reason.** The paper reports
   "machine-epsilon reconstruction accuracy". The measured error is identically zero. But
   this is a property of the *source data precision*, not of the encoding scheme: any model
   whose weights carry more than six decimal places at \(s = 10^6\) would round and would
   not be exact. The `Quantisation Advisor` subsection already says "the limiting factor is
   source data precision"; the accuracy claims elsewhere must be connected to that
   statement rather than presented as a property of the scheme.
2. **`R2.7-M1` must not report a nonzero MAE/RMSE as though it measured quantisation
   error.** On these fixtures those statistics are zero by construction. The individual-level
   comparison in Phase 5 is still worth running — it validates the *pipeline*, not the
   arithmetic precision — but the paper must say which of the two it establishes.

## CD-007 — The manuscript's `z_w` formula is missing a clamp that both implementations apply

- **Opened:** Phase 3, 28 July 2026
- **Status:** open
- **Resolves via:** `Quantisation Scheme`, Step 2, in Phase 9

The manuscript defines the weight zero-point unconditionally:

> \(z_w = -\min_i q_i, \quad u_i = q_i + z_w \geq 0 \;\forall i\)

When every quantised weight is positive, \(-\min_i q_i\) is **negative**. The stated
invariant \(u_i \geq 0\) still holds, so the mathematics is not wrong — but the on-chain
`weightZeroPoint` is a `uint64` and cannot store a negative value.

Both implementations clamp, independently of one another: `test/utils/heprs.ts` uses
`minWeight < 0 ? -minWeight : 0`, and the independent Python reference uses
`max(0, -min q)`. The paper is the only place the clamp is missing. Step 2 should read
\(z_w = \max(0, -\min_i q_i)\), with a sentence explaining that the clamp is required by the
unsigned on-chain representation rather than by the algebra.

Case 2 of the reference self test covers this: all-positive weights, `z_w` clamped to 0
where the unclamped expression would give −10, and the decode still round-trips exactly.

## CD-008 — `round()` in the quantisation scheme has no stated tie-breaking rule

- **Opened:** Phase 3, 28 July 2026
- **Status:** open
- **Resolves via:** `Quantisation Scheme`, Step 1, in Phase 9

The manuscript writes \(q_i = \mathrm{round}(s \cdot \beta_i)\) without naming a convention.
Three are in common use and they disagree at exact `.5` boundaries: half-away-from-zero
(±1), half-to-even (Python's builtin, 0), and half-up (JavaScript `Math.round`, +1/0).
`test/utils/heprs.ts` inherits half-up from `Math.round` and additionally multiplies in
binary floating point; the independent reference uses half-away-from-zero over exact
decimals.

**Measured impact on the reported results: none.** Because of `CD-006` no fixture weight
requires rounding at \(s = 10^6\), so both conventions produce identical quantised vectors,
identical `weightZeroPoint` and `scoreOffset`, and identical encoded scores across all 200
individuals. Verified by re-scoring every fixture with `--float-arithmetic`, which
reproduces the JavaScript float-and-half-up behaviour: 0 differences.

The ambiguity is therefore immaterial to this paper's numbers but must still be stated,
because a future model with weights at finer precision than the scale would diverge between
the two implementations. Step 1 should name the convention.

---

## CD-009 — `R2.4-E1`'s file scope narrowed after inspection: 5 files, not 6

- **Opened:** Phase 4, 28 July 2026
- **Status:** **resolved** (Phase 4, 28 July 2026)

`CD-001` widened `R2.4-E1` from the plan's three files to six. On implementing it, one of
those six turned out not to belong: `test/rate_limit_randomized_release_test.ts` is
**behavioural**. It asserts contract logic — rate-limit windows, oracle-required mode,
threshold-gap enforcement — and reports no measurement that reaches a table or figure.
Placeholder hashes are appropriate there, and forcing real provenance into it would add noise
without adding traceability.

Final guarded set, all five now wired to `scripts/utils/provenance.ts`:
`scripts/sepolia_validation.ts`, `scripts/heprs_fixture_profile.ts`, `scripts/gas_profile.ts`,
`scripts/probe_hcu_ceiling.ts`, `test/heprs_fixture_test.ts`.

The distinction is enforced rather than documented: `test/provenance_guard_test.ts` fails if
any guarded file contains `ZeroHash`, if any guarded file stops importing the provenance
helper, **or** if an entry on the behavioural-exemption list becomes stale. The exemption list
is therefore a recorded decision that cannot quietly rot.

## CD-010 — Phase 3's fixture manifests used the wrong scale for the 100- and 500-SNP fixtures

- **Opened:** Phase 4, 28 July 2026
- **Status:** **resolved** (Phase 4, 28 July 2026)

The advisor's recommended *balanced* scale is **3 × 10⁶** for the 100- and 500-SNP fixtures and
**1 × 10⁶** for the 1,000- and 5,000-SNP fixtures. The Phase 3 manifest generator defaulted to
1 × 10⁶ for all four sizes, so `evidence/phase3/reference/heprs_{100,500}snp_reference.json`
were produced at one third of the scale the contract path actually uses.

Caught only because Phase 4 wired the model manifest hash and the reference-output hash into
the same provenance block, which forced the reference and the on-chain run to be compared
directly for the first time on real fixture data. The 100-SNP validation run reported an
encoded score of 758,685 against the reference's 252,895 — a ratio of exactly 3.

**Neither implementation was wrong.** The discrepancy was a model *parameter* mismatch. This
distinction matters for the independence claim: independence concerns the derivation of the
*algorithm*, not the choice of *inputs and parameters*. The scale is an input, like the fixture
data itself, and both arms must use the same value or the comparison is meaningless.

Impact had it not been caught: Phase 5 (`R2.7-E1`) would have compared 200 individuals at
mismatched scales and reported a uniform 3× disagreement, which looks exactly like a
correctness failure in the encoding.

Fix: the advisor scale is now a recorded table in `independent_prs_reference.py`
(`ADVISOR_BALANCED_SCALE`) mirroring `HEPRS_BALANCED_RECOMMENDATIONS`, `fixture-manifest` uses
it by default instead of a flat constant, an unknown fixture size raises rather than guessing,
and the self test asserts all four values. All four reference files regenerated; the 100-SNP
individual 0 encoded score now matches the on-chain run exactly at **758,685**.

Note that `CD-006` survives: 3 × 10⁶ is an integer multiple of 10⁶, so the six-decimal-place
fixture weights remain exactly representable and the round-trip error is still identically zero.

## CD-011 — `SNP upload gas` is not reproducible to the gas, so the paper over-reports precision

- **Opened:** Phase 4, 28 July 2026
- **Status:** open
- **Resolves via:** `R1.1-M1` (Phase 11) and `R1.8-M1` (Phase 12)

Three consecutive runs of `scripts/gas_profile.ts` at 100 SNPs, identical commit and inputs:

| Run | Model publish | Compute | SNP upload | Total |
|---:|---:|---:|---:|---:|
| 1 | 1,125,534 | 5,626,326 | 10,287,985 | 17,528,113 |
| 2 | 1,125,534 | 5,626,326 | 10,287,997 | 17,528,125 |
| 3 | 1,125,534 | 5,626,326 | 10,287,721 | 17,527,849 |

`Model publish gas` and `Compute gas` are **exactly** deterministic. `SNP upload gas` varies
over a spread of ~276 gas (~0.003%), and `Total gas` inherits that variance. The most likely
cause is that the mock coprocessor's input-proof bytes depend on generated handle values,
which differ per run, and calldata is charged per byte at different rates for zero and
non-zero bytes.

The magnitude is negligible; the **reporting convention** is the issue. The submitted
manuscript quotes gas figures to the individual gas unit, which implies a determinism the
upload path does not have. Any table reporting SNP-upload or total gas must either round to a
stated precision or give a spread over repeated runs. This is a small instance of the general
point in `R1.1-M1`: a number's presentation should not claim more than its measurement
supports.

## CD-012 — Model publication gas in the submitted paper is understated, because it was measured with zero hashes

- **Opened:** Phase 4, 28 July 2026
- **Status:** **resolved in evidence synthesis** (Phase 8); manuscript correction pending
- **Resolves via:** `R1.8-E1` (Phase 8) and `R1.8-M1` (Phase 12); feeds MS-08

Writing a nonzero `bytes32` to previously-zero storage costs materially more than writing a
zero. With `manifestHash` and `sourceModelHash` now carrying real digests, `Model publish gas`
rises by a **flat +40,568 gas per model**, independent of variant count:

| SNPs | Model publish, zero hashes | Model publish, real hashes | Delta | As % of publish | As % of total |
|---:|---:|---:|---:|---:|---:|
| 100 | 1,084,966 | 1,125,534 | +40,568 | +3.74% | +0.232% |
| 300 | 2,646,740 | 2,687,308 | +40,568 | +1.53% | +0.080% |
| 600 | 4,989,383 | 5,029,939 | +40,556 | +0.81% | +0.041% |

Every other measured quantity is unchanged: job creation, compute, and finalize are identical,
and the HCU ceiling remains `20 < ceiling <= 25` because provenance is read and written with
ordinary storage operations and adds no homomorphic work.

Why this is a claim delta rather than a mere cost increase: the submitted manuscript describes
`manifestHash` as anchoring sample and model provenance, and `R1.5-M2` commits us to describing
it as a provenance commitment recording genome build, input-file hash, variant order, and
preparation policy. A deployment that actually does that stores nonzero hashes and therefore
pays this cost. The published model-publication figures correspond to a configuration in which
provenance was **not** recorded, so they understate the cost of the system as described.

Phase 8 must report model publication with real hashes, and note that the increment is fixed
per model rather than per variant — so it is proportionally largest for exactly the small
curated panels the paper identifies as its intended use.

---

## CD-013 — The guarded file list was built from a stale list rather than a fresh audit

- **Opened:** Phase 4, 28 July 2026
- **Status:** **resolved** (Phase 4, 28 July 2026)

The provenance guard's `EVIDENCE_PRODUCING` list was populated from `CD-001`, which had been
written during Phase 0. But `scripts/release_policy_gas.ts` was created later, in **Phase 2**,
and reports the per-model `setReleasePolicy` gas that Phase 8's cost synthesis will cite. It
was therefore evidence-producing and unguarded, and a final `grep` audit — not the guard
itself — is what caught it.

Two lessons recorded rather than quietly fixed:

1. **A guard list derived from an earlier inventory ages badly.** The correct question is not
   "which files did CD-001 name" but "which files produce a number that reaches the paper",
   and that set grows as work proceeds. Any script added in Phases 5–8 must be added to
   `EVIDENCE_PRODUCING` at the time it is written.
2. **The guard cannot detect its own incompleteness.** It verifies that listed files are clean;
   it cannot know about a file nobody listed. The `grep` sweep over `scripts/` and `test/` is
   therefore part of each phase's exit check, not a one-off.

Now wired and guarded: `scripts/release_policy_gas.ts` commits to its synthetic generation
spec and registers its sample with a real manifest hash. Reported figures are unchanged —
`setReleasePolicy` 77,314 gas and `finalizeAndClassify` 432,230 gas — because neither
transaction writes the model hashes. Guarded set is now six files.

---

## CD-014 — Category agreement cannot be exact, so a single agreement figure would mislead

- **Opened:** Phase 5, 28 July 2026
- **Status:** open
- **Resolves via:** `R2.7-M1` (Phase 11) and `R1.3-M2` (Phase 10)

`R2.7-E1` asks for category agreement. It cannot be an exact quantity. The bounded randomized
release adds noise uniform on `[0, B)`, so an individual whose encoded score lies within `B`
below a threshold may legitimately classify on either side of it. Any single "agreement
percentage" therefore conflates a correctness property with a noise draw.

Measured at 100 SNPs, `B = 128`, thresholds at the score tertiles:

| Measure | Value |
|---|---|
| Individuals classified | 50 |
| Outside the ambiguous band | 48 |
| Outside the band, agreeing with the plaintext category | **48 / 48** |
| Within `B` of a threshold | 2 |
| Disagreements observed | 0 |

Both in-band individuals happened to agree. **That is a favourable noise draw, not a
guarantee**, and the paper must not report 50/50. The defensible claim is: agreement is exact
for every individual outside the ambiguous band, and 2 of 50 fell inside it, where the
mechanism is designed not to be deterministic.

Measured at one fixture size deliberately: `ResultOracle` consumes a single encoded score and
two thresholds, so classification is independent of variant count and 100 SNPs is fully
representative. State that reasoning rather than leaving the single size looking like a gap.

## CD-015 — The `B/2` bias correction places the boundary individual at maximum ambiguity

- **Opened:** Phase 5, 28 July 2026
- **Status:** open
- **Resolves via:** `Noisy Output Release` in Phase 10 (`R1.3-M2`)

`ResultOracle.expectedNoiseBias()` returns `B/2` and the contract documents adding it to each
threshold so the noisy comparison aligns with the intended plaintext boundary. That guidance is
correct for the *aggregate*: it removes the systematic upward shift the one-sided noise
introduces.

But it has a consequence not currently stated anywhere. If a threshold is derived from the score
distribution — a tertile, a quantile, a clinical cut point calibrated on a cohort — then adding
`B/2` places the individual *defining* that cut point exactly `B/2` below the adjusted
threshold: dead centre of the ambiguous band, the point of maximum classification uncertainty.

Observed directly, not inferred. Both in-band individuals in the Phase 5 category study sat at
exactly 64 = `B/2` below their threshold, because the thresholds were `tertile + B/2` and those
two individuals were the tertile boundaries.

This is an inherent trade-off in the mechanism, not a defect: threshold adjustment can fix
aggregate bias or per-individual boundary certainty, not both. `Noisy Output Release` should
state it, because a reader following the documented `+B/2` guidance for a clinically calibrated
threshold would otherwise be unaware that patients near the cut point receive the least
reliable classification.

## CD-016 — Mock per-individual latency is now measured, and the submitted `~386 ms` needs a label

- **Opened:** Phase 5, 28 July 2026
- **Status:** open
- **Resolves via:** `R1.1-M1` (Phase 11) and `R1.7-M1` (Phase 12)

Per-individual wall-clock through the streaming contract path, mock coprocessor:

| Nominal SNPs | Encoded positions | ms / individual | ms / encoded position |
|---:|---:|---:|---:|
| 100 | 101 | 157 | 1.554 |
| 500 | 501 | 780 | 1.557 |
| 1,000 | 1,001 | 1,672 | 1.670 |
| 5,000 | 5,001 | 8,819 | 1.763 |

Per-position cost rises ~13% across the range, so scaling is close to linear but mildly
superlinear — worth stating precisely rather than claiming plain linearity.

The reporting requirement: this is **mock-coprocessor plaintext arithmetic plus transaction
overhead**. It measures neither TFHE evaluation time nor real network latency. The submitted
manuscript places a `~386 ms` bioETH-PRS latency beside HEPRS real-FHE latency in
`tab:comparison` as though the two were comparable; `R1.7-M1` already requires that row to be
split by evidence type, and these numbers supply the mock column. They must never appear
unlabelled.

---

## CD-017 — The 2,800-hour extraction claim is wrong in three independent ways

- **Opened:** Phase 6, 28 July 2026
- **Status:** open
- **Resolves via:** `R1.4-M1` (Phase 11); this is the measured replacement

Submitted text, `Anti-Probing: Rate Limiting`:

> At suggested settings for private models (R = 3, W = 1000, B = 128), extracting a single
> 20-bit weight requires approximately 2 x 10^4/(3 x 1.58) ~ 4,220 block windows,
> corresponding to ~2,800 hours at 12 s/block.

**1. Dimensional error.** `2 x 10^4` is a *count of candidate weight values* — the weight range
is about 2 x 9,534 = 19,068. It is divided by a *bit rate* (1.58 bits/query x 3 queries/window).
Dividing a count of values by a bit rate is a units error. The information required is
`log2(2 x 10^4) ~ 14.3 bits`, not 2 x 10^4 of them. This alone inflates the query estimate by
a factor of roughly **1,400**.

**2. Internal inconsistency.** Taking the paper's own intermediate figure: 4,220 windows x
W = 1,000 blocks x 12 s = **14,067 hours**, not 2,800. The 2,800-hour conclusion is consistent
with W ~ 199 blocks, contradicting the W = 1,000 stated in the same sentence. The intermediate
and the conclusion cannot both be correct.

**3. Measured cost.** Against the frozen submitted contracts, at the paper's own R = 3,
W = 1,000, 12 s/block — so 4,000 s per query:

| | Queries | Hours |
|---|---:|---:|
| Per weight, measured | **10** | **11.1** |
| All 20 weights, measured | **200** | **222.2** |
| Per weight, as claimed | — | 2,800 |
| **Overstatement** | | **~252x** |

The measured 10 queries per weight closely matches the **corrected** information-theoretic bound
of 9.04 queries, which is the main reason to trust the measurement over the estimate.

**What `R1.4-M1` must do.** Delete the calculation rather than repair it, and replace it with the
measured extraction-cost curve plus the explicit two-factor decomposition: queries required
(information cost, measured with rate limiting off) multiplied by seconds per query (rate limit x
assumed block time). The original figure's core defect was collapsing those two factors into one
unchecked number, so the replacement must keep them separate.

## CD-018 — Fixed thresholds prevent precise recovery but still leak structure

- **Opened:** Phase 6, 28 July 2026
- **Status:** open
- **Resolves via:** `R1.4-M1` (Phase 11), `R1.2-M2` trust table (Phase 10)

Measured at an equal 320-query budget on a private 20-weight model:

| Design | Pearson *r* | Sign accuracy | Recovered within B |
|---|---:|---:|---:|
| No oracle (raw score, 20 queries) | 1.0000 | 100% | 100% |
| Baseline, caller-chosen thresholds, adaptive | 1.0000 | 100% | 100% |
| **Hardened, fixed thresholds, adaptive** | **0.9391** | **70%** | **0%** |

The hardening is effective on the axis that matters most — **no weight is recovered to within the
noise bound**, against all twenty under the submitted design — but *r* = 0.94 means the attacker
still learns the relative shape of the weight vector. High correlation with only 70% sign accuracy
indicates the estimate captures relative magnitudes while missing the absolute level.

The paper must therefore claim **reduced output resolution**, not **model confidentiality**. The
plan's mandated wording — "the controls reduce output resolution and increase query cost under the
evaluated attacker models; they do not prevent Sybil attacks or provide a formal
model-confidentiality guarantee" — is exactly right and is now backed by measurement.

Also worth stating: adaptivity converts into precision **only** when the decision boundary can be
moved. Baseline adaptive recovers everything; baseline non-adaptive recovers nothing to within B at
the same budget; hardened adaptive recovers nothing to within B despite higher correlation.

## CD-019 — The noise bound is far too small relative to the weight magnitudes

- **Opened:** Phase 6, 28 July 2026
- **Status:** open
- **Resolves via:** `R1.3-M2` (Phase 10) and Future Directions

With scale 10^6 and real HEPRS betas, the largest quantised weight magnitude is 9,534. The
recommended noise bound is B = 128.

- B is **1.34%** of the largest weight magnitude.
- `log2(128) = 7` bits of blur on a weight carrying `log2(9534) = 13.2` bits.

So the noise conceals roughly the low half of each weight and nothing above it. A bound intended
to protect weight confidentiality has to scale with the weight magnitudes; a fixed 128 at scale
10^6 is decorative. This is a concrete, quantified instance of the general point in `R1.3`: the
mechanism is a bounded randomized release with an uncalibrated bound, and "uncalibrated" here has
a measurable cost.

`Noisy Output Release` should state the ratio explicitly and note that choosing B requires
reference to the quantised weight distribution — which the quantisation advisor already computes
and could therefore recommend.

## CD-020 — The correlated-SNP mitigation is vacuous without input validation

- **Opened:** Phase 6, 28 July 2026
- **Status:** open
- **Resolves via:** `R1.4-M1` (Phase 11) and `R1.5-M1` (Phase 10) — the two must cross-reference

Recovery does collapse when probes are constrained to LD-like blocks: *r* = −0.004 with blocks of
5 identical dosages, because the design matrix becomes rank-deficient and only block sums are
identifiable. It is tempting to present correlated genotype structure as a natural defence.

It is not one. **Nothing forces an attacker to submit correlated genotypes.** The contracts do not
validate inputs — exactly the trust boundary recorded by `R1.5-T1`, where the regression test
submits dosages of 9 and 11 and the engine computes over them without objection. An attacker
submits unit vectors that no real genome would produce, and unit vectors are the optimal probes.

**Therefore R1 C4 and R1 C5 cannot be answered independently.** The unverifiable-input gap is what
makes the strongest probing attack expressible; conversely, on-chain hard-call validation would
retroactively give the correlated-structure argument force. The two responses must cross-reference,
and the adversarial subsection must state that the measured protection assumes an attacker who
declines to use the freedom the protocol grants them.

The honest measure of attacker capability is the independent-probe arm, not the correlated one.

---

## CD-021 — The HCU ceiling is 21, not 20, and is identical for public and private models

- **Opened:** Phase 7, 29 July 2026
- **Status:** **resolved in code documentation** (Phase 7); manuscript wording pending
- **Resolves via:** `R1.1-M1` (Phase 11)

The submitted manuscript and the contract headers state a mock HCU ceiling of 20 without
qualifying model visibility. Two problems.

**The ceiling is 21.** The probe's candidate list was coarse — 10, 15, 20, 25, 32 — so 20 was
simply the largest candidate that passed. Bracketing finely gives 21 pass / 22 fail. The
shipped default of 20 is therefore one slot of headroom rather than the limit, which is fine,
but the *measured ceiling* is 21 and should be reported as such.

**It does not depend on model visibility.** This was worth checking because private models
compute `FHE.mul(encryptedWeight, snp)` (ciphertext x ciphertext) while public models compute
`FHE.mul(snp, FHE.asEuint64(weight))`, and the mock's own HCU table prices non-scalar `Uint64`
multiplication at 596,000 against 365,000 scalar. A 63% difference would have moved the
ceiling substantially. Measured:

| Model visibility | Max passing | Min failing | gas/chunk at 20 |
|---|---:|---:|---:|
| public | **21** | 22 | 1,150,414 |
| private | **21** | 22 | 1,604,024 |

Identical ceilings, 39% different gas. The explanation is `CD-022`: the public path does not
obtain the scalar discount, so both paths are charged as ciphertext x ciphertext, and the gas
difference comes from storage layout rather than from FHE work.

`probe_hcu_ceiling.ts` now takes `MODEL_VISIBILITY` and `HCU_CHUNK_SIZES`, so both figures are
reproducible. The Sepolia ceiling remains unmeasured for both visibilities — see `CD-024`.

## CD-022 — `FHE.asEuint64` does not obtain the scalar discount, so the documented C×P optimisation does not happen

- **Opened:** Phase 7, 29 July 2026
- **Status:** documentation **corrected**; the optimisation itself is **deferred**
- **Resolves via:** Future Directions, and a post-revision contract change

`CLAUDE.md` stated:

> Public weights use `FHE.mul(snp, FHE.asEuint64(weight))` (trivially encrypted — coprocessor
> optimizes C×P internally).

and `docs/design.md` went further:

> The coprocessor internally optimises C×P multiplications — this is why public-weight models
> are ~60% cheaper to compute than private models.

**Both claims are false.** `FHE.asEuint64(w)` returns a genuine `euint64` handle, so the
following `FHE.mul` resolves to the `euint64 x euint64` overload, which calls
`Impl.mul(a, b, false)` — the third argument is the scalar flag. The mock determines scalar
pricing from that flag (`scalarByte === "0x01"`), so the public path is charged **596,000 HCU**
per multiplication, exactly as the private path is, not the 365,000 a scalar multiplication
costs.

The scalar discount is available and unused: `FHE.mul(euint64 a, uint64 b)` calls
`Impl.mul(..., true)`.

| Path | HCU per `Uint64` mul |
|---|---:|
| `FHE.mul(snp, FHE.asEuint64(w))` — current | 596,000 |
| `FHE.mul(snp, w)` — scalar overload | **365,000** |
| Saving | 231,000 (**38.8%**) |

Projected effect of adopting it, from the measured ceiling of 21: the public compute-chunk
ceiling rises to roughly **34** SNPs, cutting compute transactions for a 5,000-SNP job from
**239 to about 148**. Since transaction count is the binding constraint on cost and latency in
this design, that is a material improvement to the scalability story — and it is available
without any change to the protocol or its security properties.

The "~60% cheaper" figure is also wrong on its own terms. Measured at chunk size 20, public
compute costs 1,150,414 gas against private 1,604,024 — **28% cheaper, not 60%** — and the
saving comes from reading packed `uint64[]` weights rather than one 32-byte `euint64` handle
per weight, not from coprocessor optimisation.

**Deliberately not applied now.** Changing `computeChunk` would invalidate the gas, HCU, and
adversarial measurements taken in Phases 4 through 6, and Stage A is meant to freeze evidence
rather than churn it. The corrected documentation is in place; the optimisation belongs in
Future Directions and a follow-up change.

## CD-023 — Private-weight jobs cost about twice as much as public ones, and the paper prices the wrong one

- **Opened:** Phase 7, 29 July 2026
- **Status:** **resolved in evidence synthesis** (Phase 8); manuscript correction pending
- **Resolves via:** `R1.8-E1` (Phase 8) and `R1.8-M1` (Phase 12)

Measured end to end for a 100-SNP job, model publication through finalize:

| | Transactions | Total gas | Ratio |
|---|---:|---:|---:|
| Public weights | 15 | 11,690,033 | 1.00x |
| Private weights | 17 | 23,507,892 | **2.01x** |

The two extra transactions are the `setPrivateModelReader` authorisations for the engine and
the requester. The gas difference is dominated by encrypted weight upload and by reading one
32-byte handle per weight during compute.

Why this is a claim delta and not just a number: the manuscript's cost discussion is built on
public-model measurements, while its **anti-probing** discussion is explicitly about private
models — "at suggested settings for private models" — and Phase 6 showed that model extraction
is only a threat for private models, because public weights are plaintext by construction. So
the configuration that needs the protection costs roughly double the configuration that was
priced. Phase 8 must report both, and the paper must not quote the public figure while
discussing the private threat model.

## CD-024 — Phase 7's live runs are blocked on a funded wallet; the manuscript must take the plan's own fallback

- **Opened:** Phase 7, 29 July 2026
- **Status:** **blocked** — not resolvable in this environment
- **Resolves via:** `R1.1-E1`, `R1.1-E2` once credentials exist; otherwise `R1.1-M1` narrows the claim

`R1.1-E1` and `R1.1-E2` require transactions on a live fhEVM network. No `MNEMONIC` is
configured (`npx hardhat vars list` is empty), and `scripts/sepolia_validation.ts` correctly
refuses to run against the public Hardhat test mnemonic. The runs therefore cannot be executed
here, and no live number has been fabricated.

**Everything else about the live run is verified.** Sepolia RPC is reachable (chain ID
11155111, block 11374028 at time of check). All four contracts are far inside the EIP-170 limit
— the largest, `PRSComputeEngine`, is 10,426 B or 42.4%. The 31 July follow-up closes the two
remaining software gaps: one harness now supports public and encrypted private weights, and
both modes record chain ID, deployed identities, every transaction hash and block number,
transaction count, host gas, timings, exact runner-source hash, and decoded/reference scores.
Public/private modes pass on the mock at 20/22 classic-path transactions and the known encoded
score 758,685. `npm run preflight:live` asserts **8/8** readiness properties.

Measured budget, at a Sepolia gas price of 1.048 gwei read from the network:

| | Gas | ETH |
|---|---:|---:|
| Deployment, all four contracts | 5,892,613 | 0.00617 |
| + public 100-SNP job | 11,690,033 | 0.01842 cumulative |
| + private 100-SNP job | 23,507,892 | 0.04305 cumulative |
| Recommended with 3x headroom | | **~0.13** |

**What the manuscript must do meanwhile.** `R1.1-E2` already provides for this: "either a
successful private-weight transaction record exists, or the manuscript explicitly says
private-weight execution is mock-validated only." Absent credentials that fallback applies to
**both** runs, not just the private one. Until a live run exists, the paper must state that all
results are Hardhat-mock validated, must not claim live-network deployment, and must leave the
Sepolia HCU ceiling as unmeasured for both model visibilities. `MS-05` is updated accordingly
with both branches.

**Exact remaining commands:**

```sh
npx hardhat vars set MNEMONIC
npm run deploy:sepolia
MODEL_VISIBILITY=public npm run validate:sepolia
MODEL_VISIBILITY=private npm run validate:sepolia
npm run probe:hcu
```

The blocker is now wallet funding/execution only, not private-mode parameterisation or missing
receipt fields. Evidence: `evidence/phase7/readiness_2026-07-31_final/`.

## CD-025 — Phase 7 prose copied total gas 12 units above its machine-readable record

- **Opened:** Phase 8, 31 July 2026
- **Status:** **resolved** (Phase 8)
- **Resolves via:** `R1.8-E1`; reinforces `CD-011`

Phase 7's Markdown tables give exact public/private 100-variant totals of 11,690,033 and
23,507,892 gas. The authoritative `evidence/phase7/live_preflight.json` records component sums
of 11,690,021 and 23,507,880:

| Visibility | Phase 7 prose | Machine-readable component sum | Difference |
|---|---:|---:|---:|
| public | 11,690,033 | 11,690,021 | 12 |
| private | 23,507,892 | 23,507,880 | 12 |

The JSON is internally consistent: each total equals model publication + sample registration +
job creation + streaming upload/compute + finalization, and the saved Sepolia-budget arithmetic
uses those JSON totals. No execution claim or economic conclusion changes.

The discrepancy is valuable because it independently confirms `CD-011`: total gas involving
encrypted calldata should not be reported to the individual unit. Phase 8 makes the
machine-readable component sums authoritative, preserves their raw values in
`measured_transaction_use.json`, and renders the manuscript-facing totals at meaningful
precision as **11.690 M** and **23.508 M**. The earlier Phase 7 record is not rewritten; this
delta documents the supersession.
