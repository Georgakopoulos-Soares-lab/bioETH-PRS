# Phase 6 — Adversarial evidence

- Evidence class: **Hardhat mock** (real contracts, real FHE protocol, plaintext arithmetic)
- Runtime: node v22.23.1
- Action: `R1.4-E1`
- Reviewer comment addressed: R1 C4 (model extraction, adaptive querying, multi-wallet,
  threshold manipulation, correlated SNPs, cross-sample probing)
- Date: 28 July 2026
- Command: `npm run evaluate:anti-probing` (51 s, ~1,600 real jobs)

## The headline finding

**The manuscript's 2,800-hour extraction estimate is wrong in three independent ways, and
overstates the attacker's cost by roughly 250× per weight.** Reviewer 1's suspicion that the
figure "appears heuristic" was correct, but the problem is worse than heuristic.

The submitted text reads:

> At suggested settings for private models (R = 3, W = 1000, B = 128), extracting a single
> 20-bit weight requires approximately 2 × 10⁴/(3 × 1.58) ≈ 4,220 block windows,
> corresponding to ≈2,800 hours at 12 s/block.

**Problem 1 — a dimensional error.** `2 × 10⁴` is a *count of candidate weight values* (the
weight range is ≈ 2 × 9,534 = 19,068). It is divided by a *bit rate* (1.58 bits per query ×
3 queries per window). Dividing a count of values by a rate of bits is a units error. The
information actually required is **log₂(2 × 10⁴) ≈ 14.3 bits**, not 2 × 10⁴ of them. The
error inflates the query estimate by a factor of **≈1,400**.

**Problem 2 — the stated arithmetic is internally inconsistent.** Taking the paper's own
intermediate result: 4,220 windows × W = 1,000 blocks × 12 s = **14,067 hours**, not 2,800.
The 2,800-hour figure is consistent with W ≈ 199 blocks, not the W = 1,000 stated one clause
earlier. So the intermediate and the conclusion cannot both be right.

**Problem 3 — the measured cost.** Against the frozen submitted contracts, at the paper's own
R = 3, W = 1,000, 12 s/block:

| | Queries | Hours |
|---|---:|---:|
| Per weight, measured | **10** | **11.1** |
| All 20 weights, measured | **200** | **222.2** |
| Per weight, paper's claim | — | 2,800 |
| **Overstatement** | | **≈252×** |

The measured 10 queries per weight closely matches the *corrected* information-theoretic
bound of 9.04, which is the main reason to trust the measurement rather than the estimate.

## What was measured, and how

Every query is a **real job against real contracts** — `createPRSJob`, one streaming chunk,
then `finalize` or `finalizeAndClassify`, followed by a real decryption. Nothing is simulated.

**Threat model.** Extraction only threatens **private** models; a public model's weights are
plaintext `uint64` by design, so there is nothing to extract. Every arm therefore uses a
private model with encrypted weights, and the attacker is an **authorised private-model
reader** — the model owner has called `setPrivateModelReader`. That is both the realistic
adversary (a collaborator with legitimate access) and the strongest one, since an unauthorised
wallet cannot create a job against a private model at all.

**Configuration.** N = 20 private weights taken from the real HEPRS 100-SNP fixture betas,
scale 10⁶, B = 128, z_w = 9,534, z_s = 46,088.

**Separation of concerns.** The extraction arms run with rate limiting **disabled**, so they
measure the *information* cost in queries. Arm 6 measures the permitted query *rate*. Wall
clock is the product, with the block time stated as an assumption rather than buried. That
decomposition is what makes the replacement figure checkable, and it is the structural fix for
what went wrong in the original claim.

**Baseline fidelity (CD-005).** The caller-selected-threshold arm deploys
`contracts/attack-baseline/`, a frozen copy of the submitted design at commit `2d6f21d`.
`test/attack_baseline_isolation_test.ts` proves the copy is faithful — reversing only the
documented renames reproduces the frozen source **byte for byte** — and that it can never
reach a deployment.

## Results

All five reviewer-named variations, at an equal 320-query budget except arm 1:

| Arm | Design | Adaptive | Queries | Pearson *r* | Sign acc. | Recovered within B |
|---|---|:---:|---:|---:|---:|---:|
| 1 | No oracle, raw score | — | **20** | **1.0000** | **100%** | **100%** |
| 2 | Baseline, caller-chosen thresholds | yes | 320 | **1.0000** | **100%** | **100%** |
| 3 | Baseline, caller-chosen thresholds | no | 320 | 0.6689 | 65% | 0% |
| 4 | **Hardened, fixed thresholds** | yes | 320 | 0.9391 | 70% | **0%** |
| 5 | Hardened + correlated (LD) probes | no | 320 | −0.0037 | 65% | 0% |

Arm 2's full extraction-cost curve is in `anti_probing_results.json`; the key points are 120
queries → *r* = 0.99, 160 → 65% recovered within B, **200 → 100% recovered within B**.

### Variation-by-variation

**1. Non-adaptive vs adaptive.** Decisive, but *only* when the attacker controls thresholds.
Baseline adaptive reaches *r* = 1.0 and full recovery; baseline non-adaptive reaches *r* = 0.67
and recovers **nothing** to within B at the same budget. Under fixed thresholds, adaptive
steering raises correlation (0.94) but still recovers **0/20** weights to within B. Adaptivity
converts into *precision* only when the decision boundary can be moved.

**2. One wallet vs multiple wallets.** The same-sample bypass is **closed**: with a quota of 3
per window, one wallet obtained 3 jobs and two further wallets obtained **0** additional jobs
against the same registered sample. Per-sample windows are enforced across wallets.

**3. Fixed vs caller-selected thresholds.** The central result. Caller-selected thresholds
permit complete recovery of all 20 weights in 200 queries. Fixed thresholds permit **none** to
within the noise bound at 320 queries, and drop sign accuracy from 100% to 70%.

**4. Independent vs correlated SNPs.** Correlated probes collapse recovery to noise
(*r* = −0.004), because LD blocks make the design matrix rank-deficient and only block sums are
identifiable. **But this is not a defence** — see below.

**5. One sample vs multiple samples.** Distinct wallets holding *distinct* registered samples
each obtained a full independent quota (3 jobs each). This is the remaining Sybil boundary, and
it is bounded further for private models: each additional wallet must be authorised by the
model owner via `setPrivateModelReader`, so expansion is gated by an explicit allowlist and not
by rate limits alone.

## Findings worth stating in the paper

**The hardening works, but it does not stop leakage — it changes its character.** Fixed
thresholds prevent *precise* recovery (0/20 within B, versus 20/20 for the submitted design)
while still permitting *approximate structural* recovery at *r* = 0.94. High correlation with
poor sign accuracy means the attacker learns the relative shape of the weight vector but not its
absolute level. That is a real reduction in resolution and it is **not** confidentiality. The
paper must claim the former and not the latter.

**The noise bound is far too small to matter.** B = 128 against a maximum weight magnitude of
9,534 is **1.34%** — about **7 bits of blur on a 13.2-bit weight**. The noise conceals roughly
the low half of each weight and nothing above it. A noise bound that is meant to protect weights
must be scaled to the weight magnitudes; a fixed 128 is decorative at scale 10⁶.

**The correlated-SNP mitigation is vacuous as stated.** Recovery does collapse under correlated
probes, but nothing forces an attacker to use them: the contracts do not validate inputs, which
is precisely the trust boundary recorded by `R1.5-T1`. An attacker submits whatever dosage
vectors they like, including unit vectors that no real genome would produce. Arm 4, with freely
chosen independent probes, is the honest measure. This links R1 C4 and R1 C5 directly: **the
unverifiable-input gap is what makes the strongest probing attack possible**, so the two
comments cannot be answered independently of one another.

**Removing the raw-score path is the single largest control.** Arm 1 shows complete, exact
extraction in exactly N queries when `finalize()` is available on a private model. Oracle-required
mode is therefore not a refinement; it is the difference between trivial and non-trivial.

## Verification

| Check | Result |
|---|---|
| `npm run evaluate:anti-probing` | exit 0, 6 arms, ~1,600 real jobs, 51 s |
| Baseline fidelity + isolation | 6 tests pass; un-renaming reproduces `2d6f21d` byte for byte |
| Arm 1 assertion | fails the run unless recovery is exact — it is |
| Deterministic | seeded PRNG; no `Math.random` |
| Full suite | 156 passing, 0 failing |
| Cross-language validation | still PASSED at tolerance 0 |

## Honest limits of this evaluation

- **Mock coprocessor.** Real FHE changes cost and latency, not the information channel. The
  query counts should carry over; the wall-clock conversion depends on assumed block time.
- **N = 20.** Chosen so each query fits in one compute chunk. Query cost per weight is
  approximately independent of N for the unit-probe attacks, but this was not verified at
  N = 5,000.
- **These are lower bounds on attacker effort.** A better attack may exist. The absence of one
  here is not a security proof, and the paper must say so.
- **The hardened arm's estimator is one specific strategy** — random independent probes with
  adaptive steering and Kaczmarz least-squares over bin midpoints. A stronger estimator against
  fixed thresholds is plausible.

## Findings ledger

| ID | Summary |
|---|---|
| `CD-017` | The 2,800-hour claim contains a dimensional error, is internally inconsistent, and overstates attacker cost by ≈252× per weight |
| `CD-018` | Fixed thresholds prevent precise recovery but still leak structure at *r* = 0.94; claim resolution reduction, not confidentiality |
| `CD-019` | B = 128 is 1.34% of the largest weight — ~7 bits of blur on a 13.2-bit weight; the bound must scale with weight magnitude |
| `CD-020` | The correlated-SNP mitigation is vacuous without input validation, tying R1 C4 to R1 C5 |
