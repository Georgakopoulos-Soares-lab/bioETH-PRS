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

## MS-04 · `R1.4-M1` · Phase 11 · Replace the 2,800-hour claim

**Status: `BLOCKED`** on `R1.4-E1` (Phase 6). Do not draft a placeholder number.

Remove from `Anti-Probing: Rate Limiting`: `extracting a single 20-bit weight ... approximately
2,800 hours`. Remove from the Introduction contributions: `raise the cost ... to thousands of
hours`. Replace with the measured summary from Phase 6 plus the bounded conclusion: *The controls
reduce output resolution and increase query cost under the evaluated attacker models; they do not
prevent Sybil attacks or provide a formal model-confidentiality guarantee.*

## MS-05 · `R1.1-M1` · Phase 11 · Evidence-class labelling

**Status: `BLOCKED`** on `R1.1-E1` / `R1.1-E2` (Phase 7).

Label every result `Live fhEVM`, `Hardhat mock`, or `Analytic projection`. Delete `gas numbers
are expected to be within 10--20\% of real-network deployment`. Stop placing the `~386 ms` mock
latency beside HEPRS real-FHE latency. Replace with: *Hardhat results validate contract logic and
transaction geometry but do not measure real fhEVM latency, HCU availability, or production fees.*

**Carry forward from `CD-002`:** every mock number in the paper must state its runtime, or be
re-measured on node 22. The Phase 0 baseline was re-captured on node v22.23.1 precisely so this
sentence can be written truthfully.

## MS-06 · `R1.2-M2` · Phase 10 · Trust and failure-boundary table

**Status: `READY`** (structure fixed; no measurement needed)

Add to `Security Model → Threat Model`, one row each: genotype provider/preprocessor; model
provider; smart contracts; blockchain consensus; fhEVM coprocessor; Gateway/relayer; ACL and
threshold decryption. For each, state whether failure affects **confidentiality, correctness,
availability, or provenance**. Make `Core Privacy Invariants` explicitly conditional on these
assumptions. Replace `verifiable security properties` in the `fig_security` caption with the
assumptions the layers actually rest on.

## MS-07 · `R2.4-M1` · Phase 11 · Correctness-guarantee boundary table

**Status: `BLOCKED`** on `R2.6-C1` (Phase 3) — the independent-reference row cannot be written
until the reference exists.

Add to `Correctness and Protocol Verification`, naming what each party guarantees: genotype
preprocessor (variant and effect-allele alignment); model provider (weights, thresholds,
scientific validity); smart contracts (deterministic encoded weighted sum); fhEVM infrastructure
(encrypted execution and decryption under its assumptions); independent reference implementation
(agreement with Equation 1); end user (verifies manifest hashes, contract addresses, transaction
record). State explicitly that the protocol guarantees **none** of sample authenticity, clinical
validity, calibration, or ancestry portability.

## MS-08 · Phase 12 · Cost-scope correction carried from `CD-001`

**Status: `BLOCKED`** on `R2.4-E1` (Phase 4) and `R1.8-E1` (Phase 8).

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

## Reviewer 1, Comment 4 — model extraction and adaptive querying

> The manuscript estimates that model extraction would require thousands of hours under
> recommended rate-limiting settings. However, this calculation appears heuristic and does not
> fully address adaptive querying, multiple-wallet attacks, threshold manipulation, correlated
> SNP structure, or cross-sample probing. A stronger adversarial analysis is needed before the
> anti-probing claims can be considered established.

**Substantiated now:** `R1.4-C1` and `R1.4-T1` — commit below, `evidence/phase2/`.
**Blocked on:** `R1.4-E1` (Phase 6) for the five-variation analysis, MS-04 (Phase 11) for the
numerical replacement, MS-09 (Phase 9/10) for the algorithm listings.

We thank the reviewer for this comment, which identified a genuine design flaw rather than only a weakness in our estimate, and we have changed the protocol in response. Working through the reviewer's list of adaptive capabilities made clear that threshold manipulation was not one attack among five but the enabling one: because `finalizeAndClassify` accepted `lowThreshold` and `highThreshold` from the requester on every call, an attacker could hold a genotype fixed and sweep the thresholds across successive jobs, performing a binary search on the encrypted score. That extracts far more information per query than the ternary Low/Medium/High output suggests, and it undermines the randomized release, whose protection assumes the adversary observes a coarse categorical answer rather than a comparison at a precision they chose. Widening the minimum threshold gap, which was our original mitigation, bounds the resolution of any single query but leaves the adaptive channel intact. We therefore removed the capability rather than bounding it. Both thresholds and the oracle address now live in a per-model release policy that the model owner fixes before the model is finalized and that is immutable afterwards; `finalizeAndClassify` takes only a job identifier. We also removed the two setters that previously allowed the oracle and the oracle-required flag to be changed after publication, since either would have let an owner advertise a strict policy and then relax it once requesters had committed. We want to be precise about the strength of this claim: requester-chosen thresholds are not rejected at runtime, they are absent from the interface, and our test suite asserts this at the ABI level — that the classification entry point has exactly one parameter, that no function on the compute engine accepts any parameter matching "threshold", and that the removed setters are absent from the compiled ABI. The change is inexpensive: total gas moves by under 0.001%, the HCU ceiling is unchanged because the policy is read with ordinary storage loads and adds no homomorphic operations, and the one-time cost of fixing a policy is 77,314 gas per model, independent of variant count. On the remaining capabilities the reviewer lists, we report a full adversarial evaluation of non-adaptive versus adaptive querying, single versus multiple wallets, fixed versus caller-selected thresholds, independent versus correlated SNP inputs, and single versus multiple samples, and we have replaced the heuristic wall-clock figure with those measurements. We are explicit that multiple-wallet attacks are bounded but not solved: per-sample rate limiting means a registered sample stays throttled across wallets, and two tests in the suite demonstrate this, but distinct wallets holding distinct registered samples still receive independent quotas. We state as a limitation, not a result, that the controls reduce output resolution and raise query cost under the evaluated attacker models while providing neither Sybil resistance nor a formal model-confidentiality guarantee.

## Not yet drafted

Do not pre-write these; each needs its Stage A evidence first.

| Comment | Topic | Blocked on |
|---|---|---|
| R1 C1 | Mock-only evaluation | `R1.1-E1`, `R1.1-E2` (Phase 7) |
| R1 C6 | Scale / bounded intended use | `R1.6-E1` (Phase 8) |
| R1 C7 | HEPRS comparison by dimension | Phases 7–8 |
| R1 C8 | Cost projections | `R1.8-E1` (Phase 8) |
| R2 C1 | Narrow SNP class | Phase 8 |
| R2 C2 | Genotype QC | `R2.2-C1`, `R2.2-T1` (Phase 3) |
| R2 C3 | Effect-allele coding | `R2.3-C1`, `R2.3-T1` (Phase 3) |
| R2 C4 | Who guarantees correctness | `R2.4-E1` (Phase 4), `R2.6-C1` (Phase 3) |
| R2 C5 | Interpretability of the encoded pipeline | Phase 9 |
| R2 C6 | Double programming | `R2.6-C1`, `R2.6-T1` (Phase 3) |
| R2 C7 | Equation 1 agreement | `R2.7-E1` (Phase 5) |

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

## Commit trail

| Commit | Contents |
|---|---|
| `2d6f21d` | Submitted snapshot |
| `0ebbfda` | Frozen RTR baseline: docx, tex, plan |
| `b935d5f` | Phase 0 evidence store |
| `e4c968c` | Phase 0 complete; node 22 pinned; `CD-002` closed |
| `b0c86a4` | Phase 1: DP framing removed, trust boundary labelled |
| `<phase2>` | Phase 2: release policy fixed and immutable; requester thresholds removed |
