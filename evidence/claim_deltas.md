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
- **Status:** open
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
