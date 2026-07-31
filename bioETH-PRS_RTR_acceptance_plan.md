# bioETH-PRS RTR action plan: two synchronized views

Date: 27 July 2026  
Revision 2 (28 July 2026): reordered into code-and-evidence-first execution. Action IDs and
verbatim reviewer comments are unchanged; only the schedule moved.  
Repository snapshot reviewed: `2d6f21d4560db77da026aa7d5043e5f1e789288c`  
Manuscript reviewed: `bioeth_prs (4).tex`  
RTR reviewed: `RTR bioETH-PRS.docx`

## How to use this plan

This document has two views of the same work:

1. View 1 preserves every reviewer comment verbatim and assigns atomic action IDs below it.
2. View 2 schedules those same action IDs in dependency order.

Update an action in both views when its status changes.

**This file is the issue tracker.** There is no external tracker and no owner column — the
revision has a single implementer. An action's authoritative status is its View 1 checkbox and
`Progress:` line; the crosswalk and View 2 must be updated to agree whenever it changes.

### Ordering doctrine: build the evidence, then write the paper

Revision 2 of this plan reorders every action into two sequential stages:

- **Stage A (Phases 1-8) - code and evidence.** All 16 contract changes, validation
  scripts, tests, and experiments run first. Nothing is written about a mechanism
  until that mechanism exists, is tested, and has produced its numbers.
- **Stage B (Phases 9-13) - manuscript.** All 19 manuscript actions follow. Every
  method sentence is transcribed from shipped code, every results sentence from a
  saved output file, and every claim from an artifact that already exists on disk.

The practical consequence: the codebase is the source of truth for terminology,
preprocessing rules, threshold policy, and every reported number. The manuscript is
revised to match the code, never the reverse. This removes the conformity risk in
which prose describes an intended design that the implementation never adopted.

Status convention:

- `[ ]` Not completed
- `[x]` Completed
- `Progress: 0%` can be changed to an intermediate percentage while work is in progress.

Overall RTR progress: **35/35 actions completed (100%)**
Stage A: **16/16** &nbsp;&nbsp; Stage B: **19/19**

## Baseline already verified

- [x] Repository snapshot identified.
- [x] Solidity project compiles.
- [x] Existing automated suite passes: 137 tests.
- [x] Existing 100-SNP Hardhat mock validation passes.
- [x] Submitted manuscript sections and all RTR comments mapped.

## Action crosswalk: ID to execution slot

Every action ID below appears exactly once. Stage A must be complete for a given
topic before its Stage B counterpart is written.

| Action | Stage | Phase | Primary artifact |
|---|:---:|---|---|
| `R1.5-T1` | A | 1 - Code terminology conformity | renamed regression test documenting the trust boundary |
| `R1.4-C1` | A | 2 - Release-policy hardening | contracts/ModelMarketplace.sol release policy |
| `R1.4-T1` | A | 2 - Release-policy hardening | fixed-threshold + multi-wallet tests |
| `R2.2-C1` | A | 3 - Independent validation stack | preprocessing/QC functions + counts report |
| `R2.2-T1` | A | 3 - Independent validation stack | QC and missingness known-answer tests |
| `R2.3-C1` | A | 3 - Independent validation stack | effect-allele harmonization + harmonization report |
| `R2.3-T1` | A | 3 - Independent validation stack | allele-orientation known-answer tests |
| `R2.6-C1` | A | 3 - Independent validation stack | validation/independent_prs_reference.py |
| `R2.6-T1` | A | 3 - Independent validation stack | one cross-language pass/fail reproducibility command |
| `R2.4-E1` | A | 4 - Evidence provenance | real manifest/fixture hashes in all evaluation scripts |
| `R2.7-E1` | A | 5 - Individual-level correctness evidence | 200-row individual-level comparison file |
| `R1.4-E1` | A | 6 - Adversarial evidence | scripts/anti_probing_evaluation.ts + extraction metrics |
| `R1.1-E1` | A | 7 - Live fhEVM validation | live public-weight run: JSON + Markdown report |
| `R1.1-E2` | A | 7 - Live fhEVM validation | live private-weight run, or a documented blocker |
| `R1.6-E1` | A | 8 - Evidence synthesis | three-class scale evidence table (data) |
| `R1.8-E1` | A | 8 - Evidence synthesis | measured transaction-use table, fees kept separate |
| `R2.2-M1` | B | 9 - Methods written from code | Methods: Genotype preprocessing, QC, and model alignment |
| `R2.3-M1` | B | 9 - Methods written from code | Methods: effect-allele dosage and blinded alignment |
| `R2.5-M1` | B | 9 - Methods written from code | simplified three-SNP example + six-step workflow figure |
| `R1.2-M2` | B | 10 - Security model and release narrative | trust and failure-boundary table |
| `R1.3-M1` | B | 10 - Security model and release narrative | removal of all DP framing |
| `R1.3-M2` | B | 10 - Security model and release narrative | mechanism-as-implemented description |
| `R1.5-M1` | B | 10 - Security model and release narrative | SNP authenticity relocated into Security Model |
| `R1.5-M2` | B | 10 - Security model and release narrative | trusted-preparation assumption + future binding work |
| `R1.1-M1` | B | 11 - Results from measured evidence | Live / Hardhat mock / Analytic projection labels |
| `R1.4-M1` | B | 11 - Results from measured evidence | measured anti-probing conclusions replacing 2,800 hours |
| `R2.4-M1` | B | 11 - Results from measured evidence | correctness-guarantee boundary table |
| `R2.7-M1` | B | 11 - Results from measured evidence | scatter plot, error metrics table, 200-row supplement |
| `R1.6-M1` | B | 12 - Scope, cost, and HEPRS comparison | bounded intended use |
| `R1.6-M2` | B | 12 - Scope, cost, and HEPRS comparison | scale limitation surfaced early |
| `R1.7-M1` | B | 12 - Scope, cost, and HEPRS comparison | HEPRS comparison rebuilt by dimension |
| `R1.7-M2` | B | 12 - Scope, cost, and HEPRS comparison | trade-off language replacing superiority language |
| `R1.8-M1` | B | 12 - Scope, cost, and HEPRS comparison | clinical/commercial practicality claims removed |
| `R2.1-M1` | B | 12 - Scope, cost, and HEPRS comparison | self-contained narrow-scope answer to Reviewer 2 |
| `R1.2-M1` | B | 13 - Front matter and conclusion | title, graphical abstract, abstract, key points, conclusion |

---

# View 1: exact reviewer comments and actions

# Reviewer 1

## Reviewer 1 overall comment — verbatim

> This manuscript presents bioETH-PRS, a privacy-preserving framework for polygenic risk score computation using fully homomorphic encryption on a programmable blockchain. The central idea is to replace the trusted evaluator used in prior encrypted PRS pipelines with auditable smart contracts, while protecting both patient genotypes and GWAS model weights. The manuscript is timely and conceptually interesting, particularly at the intersection of genomic privacy, encrypted computation, and decentralized infrastructure. However, the current evidence remains largely proof-of-concept, and several claims about deployability, privacy guarantees, and clinical feasibility are not yet fully supported.

This is the reviewer’s summary, not a separate numbered request. It is addressed collectively by Actions R1.1 through R1.8.

## Reviewer 1, Comment 1 — verbatim

> 1. The empirical evaluation relies heavily on a mock coprocessor environment. The reported gas consumption, HCU budget, latency, and protocol behavior are mainly evaluated using a Hardhat in-process mock coprocessor rather than a real fhEVM deployment or public testnet. This substantially weakens the deployment claims. The authors should either provide real-network validation or clearly frame these results as simulation-based estimates.

### R1.1-E1 — Run and record a live public-model fhEVM experiment

- [x] Progress: 100% — completed 31 July 2026. The public 100-SNP Sepolia run produced
  25 status-1 workflow receipts, 20,710,271 gas, a Gateway/KMS decryption in 8,081 ms, and
  encoded score 758,685 matching the independent reference. See
  `evidence/phase7/live_2026-07-31/public_success.json` and `CD-024`.
- Stage: Code and evidence - Phase 7 (Live fhEVM validation)
- Type: Experiment and existing script update
- Code action:
  - Use `scripts/sepolia_validation.ts` rather than creating a new execution framework.
  - Run a complete 100-SNP public-weight job on the live fhEVM test network.
  - Record chain ID, deployed contract addresses, transaction hashes, block numbers, transaction count, host gas, submission-to-result latency, decryption latency, and decoded result.
  - Save the output as machine-readable JSON plus a short Markdown report.
- Manuscript action:
  - Add a “Live fhEVM validation” paragraph to `Empirical Evaluation → Experimental Setup`.
  - Add a live-network row to the evaluation table.
- Completion criterion:
  - A reader can follow transaction identifiers and verify that a real encrypted result was produced and matched the independent reference result.

### R1.1-E2 — Run one live private-weight validation

- [x] Progress: 100% — fallback accepted 31 July 2026. Private mode passes end to end on mock
  and writes a distinct verifiable report, but the 0.012769 ETH remaining after deployment, a
  preserved failed attempt, and the successful public run does not safely cover the 100-SNP
  private workflow. No underfunded transaction was submitted. Per the completion criterion, the
  revision will say private-weight execution is mock-validated only. See
  `evidence/phase7/live_2026-07-31/`, `MS-05`, and `CD-024`.
- Stage: Code and evidence - Phase 7 (Live fhEVM validation)
- Type: Experiment
- Code action:
  - Extend or parameterize `scripts/sepolia_validation.ts` to publish encrypted model weights and run one 100-SNP private-weight job.
  - Reuse the same genotype and reference score as R1.1-E1.
  - If the current live SDK does not support this path, document the exact blocker and narrow the manuscript’s live-deployment claim to public weights.
- Manuscript action:
  - In `System Design → Model Marketplace`, distinguish “implemented in the contracts” from “validated on a live network.”
  - Report private-weight live evidence only if the run succeeds.
- Completion criterion:
  - Either a successful private-weight transaction record exists, or the manuscript explicitly says private-weight execution is mock-validated only.

### R1.1-M1 — Separate live, mock, and projected evidence everywhere

- [x] Progress: 100% — completed Phase 11, 31 July 2026
- Stage: Manuscript - Phase 11 (Results from measured evidence)
- Type: Manuscript
- Current wording to change:
  - `Experimental Setup`: “gas numbers are expected to be within 10--20\% of real-network deployment.”
  - `Comparison with HEPRS`: bioETH-PRS latency shown as `~386 ms` beside HEPRS real-FHE latency.
- Replace with:
  - “Hardhat results validate contract logic and transaction geometry but do not measure real fhEVM latency, HCU availability, or production fees.”
  - Label every result as `Live fhEVM`, `Hardhat mock`, or `Analytic projection`.
- Relevant manuscript sections:
  - Abstract
  - Key Points
  - `Programmable Blockchain and fhEVM`
  - `Empirical Evaluation`
  - `Comparison with HEPRS`
  - Discussion and Conclusion
- Completion criterion:
  - No mock timing, mock HCU ceiling, or projected cost is described as a live deployment measurement.

## Reviewer 1, Comment 2 — verbatim

> 2. The privacy claims should be stated more cautiously. The manuscript argues that bioETH-PRS removes the trusted evaluator assumption. This is a meaningful architectural contribution, but the system still depends on the correctness and availability of the fhEVM stack, smart contracts, ACL/decryption infrastructure, and blockchain consensus. Terms such as “zero trust” or “trustless” should be softened or carefully qualified.

### R1.2-M1 — Replace absolute trust language with evaluator minimization

- [x] Progress: 100% — completed Phase 13, 31 July 2026
- Stage: Manuscript - Phase 13 (Front matter and conclusion)
- Ordering note: moved from first action to last. The trust vocabulary is fixed by the Phase 1 code renames and the Phase 10 trust table before it propagates into the title, graphical abstract, abstract, key points, and conclusion.
- Type: Manuscript wording
- Current wording to change:
  - Title: “without a Trusted Evaluator”
  - Graphical abstract: “computation verified by blockchain consensus”
  - Contribution: “four-contract architecture without a trusted evaluator”
  - Conclusion: “on-chain FHE computation without a trusted evaluator”
- Suggested replacements:
  - Title: “bioETH-PRS: Confidential Polygenic Risk Scoring with Auditable fhEVM Orchestration”
  - “removes the designated application-level evaluator” instead of “removes trust”
  - “contract execution is publicly auditable, while confidentiality and decryption depend on the fhEVM coprocessor, ACL, Gateway/KMS, and chain assumptions”
  - “evaluator-minimized” instead of “trustless” or “zero trust”
- Relevant manuscript sections:
  - Title, graphical abstract, Abstract, Introduction, Key Points, Discussion, Conclusion
- Completion criterion:
  - A full-text search finds no unqualified `trustless`, `zero trust`, or claim that blockchain consensus alone verifies FHE correctness.

### R1.2-M2 — Add a trust and failure-boundary table

- [x] Progress: 100% — completed Phase 10, 31 July 2026
- Stage: Manuscript - Phase 10 (Security model and release narrative)
- Type: Manuscript
- Action:
  - Add a table to `Security Model → Threat Model` with the following rows:
    - genotype provider/preprocessor;
    - model provider;
    - smart contracts;
    - blockchain consensus;
    - fhEVM coprocessor;
    - Gateway/relayer;
    - ACL and threshold decryption infrastructure.
  - For each row, state whether failure can affect confidentiality, correctness, availability, or provenance.
- Conforming manuscript changes:
  - Update `Core Privacy Invariants` so invariants are explicitly conditional on these assumptions.
  - Update Figure `fig_security` caption to call these assumptions rather than “verifiable security properties.”
- Completion criterion:
  - Every external component identified by the reviewer appears in the table and is referenced by the revised privacy claims.

## Reviewer 1, Comment 3 — verbatim

> 3. The noisy output oracle does not provide formal differential privacy. The authors acknowledge that the current mechanism is DP-inspired rather than a calibrated (epsilon, delta)-differential privacy guarantee. Given the sensitivity of genomic data, this limitation should be emphasized more prominently. If the authors wish to retain strong privacy language, they should provide a formal adjacency definition, sensitivity analysis, and privacy-parameter calibration.

### R1.3-M1 — Remove differential-privacy framing

- [x] Progress: 100% — completed Phase 10, 31 July 2026
- Stage: Manuscript - Phase 10 (Security model and release narrative)
- Type: Manuscript wording
- Current wording to change:
  - `Noisy Output Release`: “DP-inspired noisy output release mechanism”
  - `Limitations`: heading “DP bias”
  - Any source-code or manuscript references to a DP oracle.
- Replace with:
  - “bounded randomized categorical release”
  - “This heuristic does not provide an \((\varepsilon,\delta)\)-differential privacy guarantee.”
  - Rename “DP bias” to “One-sided randomization and bias.”
- Relevant manuscript sections:
  - Abstract, Key Points, Introduction contributions, `Noisy Output Release`, Limitations, Conclusion
- Completion criterion:
  - The paper contains no wording that a reader could interpret as a formal DP claim.

### R1.3-M2 — Describe only the mechanism that is actually implemented

- [x] Progress: 100% — code half completed Phase 1 and manuscript half completed Phase 10,
  31 July 2026
- Stage: Split action - code renames execute in Phase 1; manuscript terminology follows in Phase 10. Complete only when both are done.
- Type: Manuscript method clarification
- Action:
  - Retain the current equation \(e_{\mathrm{noisy}}=e+\nu\), with \(\nu\sim\mathrm{Uniform}(0,B)\).
  - State its one-sided support, expected bias, threshold adjustment, and lack of composition analysis.
  - Move formal adjacency, sensitivity, and calibrated DP to Future Directions.
- Code conformity:
  - Rename test descriptions and documentation in `contracts/ResultOracle.sol` and `test/rate_limit_dp_test.ts` from `DP`/`DP-inspired` to `randomized release`.
  - Done in Phase 1. The file itself was renamed to `test/rate_limit_randomized_release_test.ts`, since leaving `dp` in a filename the manuscript cites would defeat the rename.
  - Do not change the implemented distribution merely to retain DP terminology.
- Completion criterion:
  - Code comments, test names, and manuscript terminology all use the same non-DP name.

## Reviewer 1, Comment 4 — verbatim

> 4. The manuscript estimates that model extraction would require thousands of hours under recommended rate-limiting settings. However, this calculation appears heuristic and does not fully address adaptive querying, multiple-wallet attacks, threshold manipulation, correlated SNP structure, or cross-sample probing. A stronger adversarial analysis is needed before the anti-probing claims can be considered established.

### R1.4-C1 — Remove requester-controlled thresholds from protected classification

- [x] Progress: 100% — completed Phase 2, 28 July 2026
- Stage: Code and evidence - Phase 2 (Release-policy hardening)
- Type: Contract change
- Current code behavior:
  - `PRSComputeEngine.finalizeAndClassify(jobId, oracle, lowThreshold, highThreshold)` accepts thresholds from the requester.
  - Both paper algorithms show the requester passing \(\tau_L,\tau_H\).
- Change code to:
  - Store `lowThreshold`, `highThreshold`, and approved oracle as a per-model release policy in `contracts/ModelMarketplace.sol`.
  - Set and validate the policy before model finalization.
  - Make it immutable after model finalization.
  - Change `PRSComputeEngine.finalizeAndClassify` to load the model policy rather than accept requester thresholds.
- Manuscript conformity:
  - Update Algorithms `Classic chunked PRS computation` and `Streaming PRS computation`.
  - Update `Noisy Output Release` to say thresholds are model-defined and fixed before querying.
- Completion criterion:
  - No protected classification entry point allows the requester to choose thresholds.

### R1.4-T1 — Add fixed-threshold and multi-wallet tests

- [x] Progress: 100% — completed Phase 2, 28 July 2026
- Stage: Code and evidence - Phase 2 (Release-policy hardening)
- Type: Tests
- Code action:
  - Extend `test/rate_limit_randomized_release_test.ts` (renamed from `rate_limit_dp_test.ts` in Phase 1) and `test/registry_marketplace_oracle_test.ts`.
  - Verify requester-supplied thresholds are impossible.
  - Verify the same registered sample remains sample-rate-limited across wallets.
  - Verify different wallets with different samples can still create independent windows, documenting the remaining Sybil boundary.
- Manuscript conformity:
  - Cite these tests in the anti-probing methods, without calling them proof of extraction resistance.
- Completion criterion:
  - Tests fail under the old caller-selected interface and pass under the fixed-policy interface.

### R1.4-E1 — Run the reviewer-requested adversarial analysis

- [x] Progress: 100% — completed Phase 6, 28 July 2026
- Stage: Code and evidence - Phase 6 (Adversarial evidence)
- Type: Experiment
- Code action:
  - Add `scripts/anti_probing_evaluation.ts` or an equivalent reproducible script.
  - Compare:
    1. non-adaptive versus adaptive queries;
    2. one wallet versus multiple wallets;
    3. fixed thresholds versus the old caller-selected threshold design;
    4. independent SNPs versus correlated SNP inputs;
    5. one sample versus multiple samples.
  - Report query count and a direct extraction metric such as recovered-weight correlation or sign accuracy.
- Manuscript action:
  - Add one adversarial-analysis subsection and one compact results figure/table.
- Completion criterion:
  - All five attack variations named by the reviewer are evaluated or explicitly identified as outside the remaining threat model.

### R1.4-M1 — Replace the “2,800 hours” claim with measured conclusions

- [x] Progress: 100% — completed Phase 11, 31 July 2026
- Stage: Manuscript - Phase 11 (Results from measured evidence)
- Ordering note: blocked until `R1.4-E1` (Phase 6) has produced measured numbers. Do not draft a placeholder sentence.
- Type: Manuscript wording
- Current wording to change:
  - `Anti-Probing: Rate Limiting`: “extracting a single 20-bit weight ... corresponding to approximately 2,800 hours”
  - Introduction contribution: “raise the cost ... to thousands of hours”
- Replace with:
  - A numerical summary derived from R1.4-E1.
  - A limited conclusion: “The controls reduce output resolution and increase query cost under the evaluated attacker models; they do not prevent Sybil attacks or provide a formal model-confidentiality guarantee.”
- Completion criterion:
  - No heuristic wall-clock headline remains unless reproduced by the new experiment with stated assumptions.

## Reviewer 1, Comment 5 — verbatim

> 5. The inability to verify submitted encrypted SNPs is a major unresolved security issue. The system verifies access to a registered sample but cannot confirm that the submitted encrypted SNP values faithfully represent that sample. This allows malicious users to submit crafted inputs, which directly affects model-probing and misuse risks. This issue should be moved from a limitation to the main security discussion.

### R1.5-M1 — Move SNP authenticity into the main Security Model

- [x] Progress: 100% — completed Phase 10, 31 July 2026
- Stage: Manuscript - Phase 10 (Security model and release narrative)
- Type: Manuscript restructuring
- Current location:
  - `Discussion → Limitations and Open Problems → SNP provenance`
- Change:
  - Move the full issue to `Security Model`, immediately after `Threat Model`.
  - Add an explicit malicious authorized requester who may upload arbitrary encrypted values.
  - State: “The contracts guarantee computation over submitted ciphertexts; they do not prove that those ciphertexts encode genotypes derived from the registered sample.”
- Conforming changes:
  - Keep a shorter cross-reference in Limitations.
  - Update Figure `fig_security` so ciphertext/sample binding is outside the guaranteed boundary.
- Completion criterion:
  - The issue appears before privacy invariants and is treated as a primary security assumption, not a minor future limitation.

### R1.5-T1 — Preserve the crafted-input test as evidence of the boundary

- [x] Progress: 100% — completed Phase 1, 28 July 2026
- Stage: Code and evidence - Phase 1 (Code terminology conformity)
- Type: Test documentation, not a claimed fix
- Existing evidence:
  - `test/prs_compute_engine_chunked_snp_test.ts` already contains: “accepts arbitrary encrypted SNP values today; hardcall enforcement remains off-chain.”
- Action:
  - Keep this regression test.
  - Rename or comment it so its purpose is clearly to document the trust boundary.
  - Add a supplementary test/evidence reference in the manuscript.
- Manuscript conformity:
  - Do not say that `registerSampleWithManifest` cryptographically binds ciphertexts to the sample.
- Completion criterion:
  - The test and the paper make the same statement about what is and is not verified.

### R1.5-M2 — Define the practical assumption and future solution without overclaiming

- [x] Progress: 100% — completed Phase 10, 31 July 2026
- Stage: Manuscript - Phase 10 (Security model and release narrative)
- Type: Manuscript
- Action:
  - Define the evaluated setting as trusted genotype preparation by the patient’s local pipeline, laboratory, or approved data custodian.
  - Explain that `manifestHash` can record genome build, input-file hash, variant order, and preparation policy but is only a provenance commitment.
  - Put signed laboratory attestation or a zero-knowledge ciphertext-to-sample proof in Future Directions.
- Completion criterion:
  - The response admits that the current code does not solve sample authenticity and does not present metadata hashing as a proof.

## Reviewer 1, Comment 6 — verbatim

> 6. The prototype is evaluated on 100-5,000 SNP fixtures, whereas many PRS models contain tens of thousands to millions of variants. The authors should more clearly define the intended use case, such as curated small-panel PRS models, and avoid implying general applicability to large-scale clinical PRS deployment.

### R1.6-M1 — Define a bounded intended use

- [x] Progress: 100% — completed Phase 12, 31 July 2026
- Stage: Manuscript - Phase 12 (Scope, cost, and HEPRS comparison)
- Type: Manuscript wording
- Current wording to change:
  - Abstract: “approach may be cost-competitive”
  - Background: “exactly the primitive that FHE systems are designed to support efficiently”
  - Comparison table: “5,000 (scalable)”
  - Conclusion: “bring private, verifiable genomic computation within reach of routine clinical practice”
- Replace with:
  - “bounded-size research prototype for curated additive PRS models”
  - “5,000 variants measured in the Hardhat mock; genome-wide execution was not demonstrated”
  - “The study does not establish clinical deployment feasibility.”
- Relevant manuscript sections:
  - Abstract, Background, Comparison with HEPRS, Empirical Evaluation, Discussion, Conclusion
- Completion criterion:
  - No sentence generalizes the 100–5,000 mock range to genome-wide or routine clinical PRS.

### R1.6-E1 — Create a three-class scale evidence table

- [x] Progress: 100% — complete 31 July 2026. Machine-readable table and rendering in
  `evidence/phase8/scale_evidence.{json,md}`; raw current execution in
  `evidence/phase8/heprs_profile.{json,txt}`.
- Stage: Code and evidence - Phase 8 (Evidence synthesis)
- Type: Evaluation synthesis
- Action:
  - Build one table with evidence class, variant count, model visibility, transaction count, and latency/cost availability.
  - Rows:
    - live fhEVM: successful sizes from R1.1;
    - Hardhat mock: 100, 500, 1,000, 5,000;
    - analytic projection: larger counts, clearly marked unexecuted.
- Manuscript conformity:
  - Replace claims of broad “linear scalability” with “linear host-contract transaction growth over the measured mock range.”
- Completion criterion:
  - Every scale number in the paper can be traced to one of the three evidence classes.

### R1.6-M2 — Make the scale limitation prominent, not only retrospective

- [x] Progress: 100% — completed Phase 12, 31 July 2026
- Stage: Manuscript - Phase 12 (Scope, cost, and HEPRS comparison)
- Type: Manuscript structure
- Action:
  - Put the bounded scope in Abstract, Key Points, the last paragraph of Introduction, and the opening of Empirical Evaluation.
  - Retain the detailed ceiling discussion in Limitations.
- Completion criterion:
  - A reader knows the maximum demonstrated scale before reaching the Discussion.

## Reviewer 1, Comment 7 — verbatim

> 7. bioETH-PRS improves the trust model by removing the designated evaluator, but HEPRS supports much larger SNP counts and has different computational advantages. The manuscript should separate claims about privacy architecture, scalability, latency, memory use, and deployment assumptions rather than presenting bioETH-PRS as broadly superior.

### R1.7-M1 — Rebuild the HEPRS comparison by dimension

- [x] Progress: 100% — completed Phase 12, 31 July 2026
- Stage: Manuscript - Phase 12 (Scope, cost, and HEPRS comparison)
- Type: Manuscript table
- Change Table `tab:comparison` to separate:
  - privacy architecture;
  - designated evaluator;
  - remaining trust assumptions;
  - arithmetic scheme;
  - demonstrated encrypted variant count;
  - latency evidence type;
  - memory evidence;
  - deployment requirements;
  - output policy;
  - metadata exposure.
- Required corrections:
  - `Max variants tested`: change bioETH-PRS from “5,000 (scalable)” to “5,000 in Hardhat mock; live maximum reported separately.”
  - `Per-person latency`: do not place `~386 ms` mock time beside HEPRS real FHE time as if directly comparable.
  - Memory: state that bioETH-PRS memory was not measured if no measurement exists.
- Completion criterion:
  - Each comparison row addresses one dimension and identifies whether evidence is measured, inherited, mock, or unavailable.

### R1.7-M2 — Replace superiority language with trade-off language

- [x] Progress: 100% — completed Phase 12, 31 July 2026
- Stage: Manuscript - Phase 12 (Scope, cost, and HEPRS comparison)
- Type: Manuscript wording
- Current wording to change:
  - Any claim that bioETH-PRS offers broadly stronger privacy or is generally superior.
  - Discussion language suggesting HEPRS is simply inappropriate where bioETH-PRS is appropriate.
- Replace with:
  - “HEPRS demonstrates substantially larger encrypted PRS execution; bioETH-PRS studies auditable contract orchestration and model/output policy at smaller scale.”
  - “The systems optimize different trust, deployment, and performance properties.”
- Relevant manuscript sections:
  - Introduction, `Comparison with HEPRS`, `HEPRS and bioETH-PRS: Complementary Systems`, Related Work, Conclusion
- Completion criterion:
  - The comparison can be read as balanced even by an author of HEPRS.

## Reviewer 1, Comment 8 — verbatim

> 8. The cost projections depend on L2-equivalent or application-chain gas pricing and are not based on measured production deployment. Claims that the system may be clinically or commercially practical should be toned down unless supported by real deployment data.

### R1.8-E1 — Replace projected “deployment cost” evidence with measured transaction evidence

- [x] Progress: 100% — complete 31 July 2026. Measured quantities in
  `evidence/phase8/measured_transaction_use.{json,md}`; fee arithmetic isolated and labelled
  unexecuted in `evidence/phase8/fee_sensitivity.{json,md}`.
- Stage: Code and evidence - Phase 8 (Evidence synthesis)
- Type: Experiment synthesis
- Action:
  - From R1.1, report observed gas and transaction counts for:
    - contract deployment;
    - model publication;
    - per-sample computation;
    - result/decryption path.
  - Do not convert testnet gas into a production USD cost unless a current production fee schedule is documented.
- Manuscript conformity:
  - Rename `Deployment Cost Projections` to `Measured transaction use and fee sensitivity`.
- Completion criterion:
  - Measured network quantities and hypothetical price conversions appear in separate tables or subsections.

### R1.8-M1 — Remove clinical and commercial practicality conclusions

- [x] Progress: 100% — completed Phase 12, 31 July 2026
- Stage: Manuscript - Phase 12 (Scope, cost, and HEPRS comparison)
- Type: Manuscript wording
- Current wording to remove or replace:
  - Abstract: “cost-competitive in low-gas deployment environments”
  - Cost section: comparison with “centralised commercial genomics services”
  - Discussion: “Commercial viability requires...”
  - Conclusion: “practical for curated clinical PRS panels”
- Replace with:
  - “Fee scenarios are sensitivity analyses derived from measured transaction use; production affordability and clinical feasibility were not evaluated.”
- Relevant manuscript sections:
  - Abstract, `Deployment Cost Projections`, Limitations, Conclusion
- Completion criterion:
  - No commercial or clinical affordability claim remains without measured production evidence.

---

# Reviewer 2

## Reviewer 2 overall comment — verbatim

> This manuscript presents bioETH-PRS, a blockchain-based protocol for privacy-preserving polygenic risk scoring (PRS) using TFHE/fhEVM smart contracts. The paper’s main claim is that it removes the need for a trusted evaluator found in prior homomorphic-encryption PRS pipelines by moving orchestration to auditable on-chain contracts. Overall, the paper tries to addresses an important problem at the intersection of genomics, privacy, and decentralized computation. The manuscript is interesting and original. However, I do have several comments.

This is the reviewer’s summary, not a separate numbered request. It is addressed collectively by Actions R2.1 through R2.7.

## Reviewer 2, Comment 1 — verbatim

> 1. bioETH-PRS was evaluated only on 100-5000 SNPs, while a real PRS in practice can involve far larger number of SNPs. Although the authors acknowledged that the HCU budget and transaction count made the genome-wide model impractical on current infrastructure. This is still a serious limitation because the method may only apply to a narrow class of PRS models with limited number of SNPs.

### R2.1-M1 — Answer the duplicate scale concern explicitly

- [x] Progress: 100% — completed Phase 12, 31 July 2026
- Stage: Manuscript - Phase 12 (Scope, cost, and HEPRS comparison)
- Type: Manuscript and response-letter linkage
- Action:
  - Reuse the bounded-scope wording and evidence table from R1.6-M1, R1.6-E1, and R1.6-M2.
  - Add one direct sentence in Discussion: “The current method applies only to a narrow class of bounded-size PRS models; it is not a practical genome-wide PRS engine.”
  - Answer Reviewer 2 separately rather than saying only “see response to Reviewer 1.”
- Completion criterion:
  - Reviewer 2 receives a self-contained response with the exact demonstrated maximum and the narrowed intended use.

## Reviewer 2, Comment 2 — verbatim

> 2. Does bioETH-PRS require quality control of the genotype data, like missing value, minor allele frequency, etc? Please clarify this in the manuscript.

### R2.2-M1 — Add a genotype preprocessing and QC subsection

- [x] Progress: 100% — completed Phase 9, 31 July 2026
- Stage: Manuscript - Phase 9 (Methods written from code)
- Ordering note: written *after* `R2.2-C1` ships. Transcribe the rules from the merged validator; do not specify rules the validator does not implement.
- Type: Manuscript method addition
- Action:
  - Add `Background/Methods → Genotype preprocessing, QC, and model alignment` before the cryptographic pipeline.
  - Define:
    - accepted genotype representation: diploid hard calls \(0,1,2\);
    - genome build and variant-order matching;
    - missing-variant policy;
    - invalid-genotype policy;
    - duplicate/multiallelic handling;
    - fixture-specific assumptions.
  - Explain that MAF and Hardy–Weinberg checks are primarily cohort/model-development QC, while missingness and allele/build matching are scoring-time checks.
- Completion criterion:
  - The manuscript states exactly what happens to a missing, invalid, or unmatched variant before encryption.

### R2.2-C1 — Implement the documented preprocessing rules in the independent validator

- [x] Progress: 100% — completed Phase 3, 28 July 2026
- Stage: Code and evidence - Phase 3 (Independent validation stack)
- Ordering note: do not wait for `R2.2-M1`. The implementation defines the specification; the manuscript subsection is derived from it in Phase 9.
- Type: Validation code
- Code action:
  - Add preprocessing functions to the new independent reference script from R2.6-C1.
  - Make missing-value behavior an explicit option from a manifest, not an implicit zero.
  - Reject genotype values outside \(0,1,2\) for the hardcall mode used in this paper.
- Manuscript conformity:
  - The pseudocode in R2.2-M1 must match the implementation exactly.
- Completion criterion:
  - The script emits counts of matched, missing, imputed/rejected, and invalid variants.

### R2.2-T1 — Add QC and missingness tests

- [x] Progress: 100% — completed Phase 3, 28 July 2026
- Stage: Code and evidence - Phase 3 (Independent validation stack)
- Type: Tests
- Code action:
  - Test a complete sample, a missing variant, an invalid value, a wrong build, and a wrong variant order.
  - Store expected outcomes in known-answer fixtures.
- Completion criterion:
  - Every QC rule described in the manuscript has at least one passing or failing test.

## Reviewer 2, Comment 3 — verbatim

> 3. For some cases, the genotype of a SNP may be coded as 0, 1, 2 in terms of the number of risk alleles; but during the weights derivation, the genotype of that SNP in an independent dataset may be coded as 2, 1, 0 in terms of the number of minor alleles (when the risk allele is not the minor allele). Although we can require the genotype and the weights are provided with consistent coding, how to validate this requirement when they are totally blinded to each other? How does bioETH-PRS handle such situation?

### R2.3-M1 — Change “allele dosage” to “effect-allele dosage” and explain blinded alignment

- [x] Progress: 100% — completed Phase 9, 31 July 2026
- Stage: Manuscript - Phase 9 (Methods written from code)
- Ordering note: written *after* `R2.3-C1` ships. The pseudocode in the paper is a transcription of the merged harmonization function.
- Type: Manuscript wording and method
- Current wording to change:
  - Equation 1 definition: “\(g_i\) is the allele dosage”
  - Any wording that implies minor-allele count is sufficient.
- Replace with:
  - “\(g_i\) is the dosage of the model-specified effect allele.”
  - Public model metadata must expose variant identity, genome build, effect allele, other allele, and order even when the weights remain encrypted.
  - Alignment occurs locally before encryption; encrypted weights do not prevent use of public allele metadata.
  - If the available dosage is for the opposite allele at a diploid biallelic SNP, use \(g_{\mathrm{effect}}=2-g_{\mathrm{other}}\).
- Fixture caveat:
  - State that the supplied HEPRS fixtures are assumed to be pre-aligned and do not independently validate strand/build metadata.
- Completion criterion:
  - The paper never treats “minor allele” and “effect/risk allele” as interchangeable.

### R2.3-C1 — Add effect-allele harmonization to the reference/preprocessing script

- [x] Progress: 100% — completed Phase 3, 28 July 2026
- Stage: Code and evidence - Phase 3 (Independent validation stack)
- Ordering note: do not wait for `R2.3-M1`. The merged decision rules become the paper's pseudocode in Phase 9.
- Type: Validation code
- Code action:
  - Parse a variant manifest with build, REF, ALT, effect allele, other allele, and column order.
  - Keep matching dosages unchanged.
  - Convert opposite-allele dosages with \(2-g\).
  - Reject unresolved A/T or C/G strand ambiguity and incompatible alleles.
- Manuscript conformity:
  - Add the same decision rules as pseudocode in the new preprocessing subsection.
- Completion criterion:
  - The validator produces a harmonization report with match, flip, strand-ambiguous, and rejected counts.

### R2.3-T1 — Add allele-orientation known-answer tests

- [x] Progress: 100% — completed Phase 3, 28 July 2026
- Stage: Code and evidence - Phase 3 (Independent validation stack)
- Type: Tests
- Code action:
  - Include one already aligned SNP, one reversed effect allele, one strand-compatible SNP, and one unresolved palindromic SNP.
  - Confirm that the reversed example changes `[0,1,2]` to `[2,1,0]`.
- Completion criterion:
  - The documented orientation logic is independently executable and tested.

## Reviewer 2, Comment 4 — verbatim

> 4. How and who to guarantee the final PRS provided by bioETH-PRS is correctly computed? In other words, the bioETH-PRS will eventually provide some numbers. But how do I know I can trust these numbers?

### R2.4-M1 — Add a correctness-guarantee boundary

- [x] Progress: 100% — completed Phase 11, 31 July 2026
- Stage: Manuscript - Phase 11 (Results from measured evidence)
- Type: Manuscript
- Action:
  - Add a table to `Correctness and Protocol Verification` with:
    - genotype preprocessor: variant and effect-allele alignment;
    - model provider: weights, thresholds, and scientific validity;
    - smart contracts: deterministic encoded weighted sum;
    - fhEVM infrastructure: encrypted execution/decryption under its assumptions;
    - independent reference implementation: agreement with Equation 1;
    - end user: verifies manifest hashes, contract addresses, and transaction record.
  - State explicitly that the protocol does not guarantee sample authenticity, clinical validity, calibration, or ancestry portability.
- Completion criterion:
  - The manuscript answers “who guarantees what” without implying that blockchain consensus guarantees biological correctness.

### R2.4-E1 — Bind every reported result to reproducibility identifiers

- [x] Progress: 100% — completed Phase 4, 28 July 2026
- Stage: Code and evidence - Phase 4 (Evidence provenance)
- Type: Evaluation provenance
- Action:
  - For every final table, record:
    - repository commit;
    - model/fixture hashes;
    - manifest hash;
    - contract bytecode/address for live runs;
    - transaction IDs;
    - independent reference output hash.
  - Change evaluation code that currently uses `ethers.ZeroHash` for experimental manifests to use real hashes.
- Relevant code:
  - `scripts/sepolia_validation.ts`
  - `scripts/heprs_fixture_profile.ts`
  - `test/heprs_fixture_test.ts`
- Completion criterion:
  - A reported score can be traced to exact inputs, code, and deployment.

## Reviewer 2, Comment 5 — verbatim

> 5. The original PRS calculation is simple and easy to understand/interpret, which is a weighted sum of multiple SNPs. The PRS calculation by bioETH-PRS seems more complicated with certain black boxes. Could the authors comment on that?

### R2.5-M1 — Reframe the existing three-SNP example around the simple PRS

- [x] Progress: 100% — completed Phase 9, 31 July 2026
- Stage: Manuscript - Phase 9 (Methods written from code)
- Type: Manuscript explanation and figure
- Action:
  - Keep the existing three-SNP worked example but begin with the plaintext weighted sum.
  - Then show that bioETH-PRS performs the same sum after encoding:
    1. align effect-allele dosages;
    2. quantize weights;
    3. encrypt dosages/weights;
    4. multiply and sum;
    5. correct the zero point;
    6. decrypt and decode.
  - Add one simple workflow figure with these six steps.
  - Explain the four contracts in one sentence each and move low-level handle/ACL detail out of the main explanation.
- Relevant manuscript sections:
  - `Polygenic Risk Scores`
  - `Architecture Overview`
  - `Quantisation Scheme → Worked Example`
- Completion criterion:
  - A reader can reproduce the three-SNP result by hand before reading contract details.

## Reviewer 2, Comment 6 — verbatim

> 6. If I need double programming or independent validation of the final calculated PRS, could bioETH-PRS incorporate this?

### R2.6-C1 — Add an independent Python reference implementation

- [x] Progress: 100% — completed Phase 3, 28 July 2026
- Stage: Code and evidence - Phase 3 (Independent validation stack)
- Type: New validation code
- Code action:
  - Add `validation/independent_prs_reference.py`.
  - Do not import or translate the TypeScript helper functions from `test/utils/heprs.ts`.
  - Independently implement preprocessing, effect-allele harmonization, Equation 1, quantization, decoding, and comparison.
  - Read contract-output JSON and generate comparison CSV/JSON.
- Manuscript action:
  - Add an “Independent validation” paragraph to `Correctness and Protocol Verification`.
- Completion criterion:
  - The Python result agrees with hand-calculated known-answer examples and is code-independent from the TypeScript path.

### R2.6-T1 — Add cross-language known-answer validation

- [x] Progress: 100% — completed Phase 3, 28 July 2026
- Stage: Code and evidence - Phase 3 (Independent validation stack)
- Type: Test and reproducibility workflow
- Code action:
  - Create at least three known-answer cases: positive weights, mixed signed weights, and allele reversal.
  - Run the TypeScript/contract path and Python path on the same immutable inputs.
  - Fail the validation command if encoded or decoded outputs disagree beyond the declared quantization tolerance.
- Manuscript conformity:
  - Describe this as independent implementation validation, not a formal proof.
- Completion criterion:
  - One reproducibility command executes both implementations and returns pass/fail.

## Reviewer 2, Comment 7 — verbatim

> 7. In the Empirical Evaluation section, I was expecting to see that the individual PRS calculated by bioETH-PRS is consistent with the PRS calculated from Equation 1. Could the authors provide that information?

### R2.7-E1 — Produce individual-level Equation 1 comparisons

- [x] Progress: 100% — completed Phase 5, 28 July 2026
- Stage: Code and evidence - Phase 5 (Individual-level correctness evidence)
- Type: Experiment
- Current evidence gap:
  - `test/heprs_fixture_test.ts` executes the encrypted contract path for only the first individual at each fixture size.
  - All 50 individuals are currently checked only for TypeScript overflow, not independently against decoded contract results.
- Action:
  - Run all 50 individuals for each nominal fixture size: 100, 500, 1,000, and 5,000.
  - Reuse one published model per size and create one job per individual.
  - Record plaintext Equation 1 score, decoded bioETH-PRS score, absolute error, and category agreement if categories remain.
  - Be explicit that each fixture contains a leading intercept/constant column, so the actual encoded vector length is nominal size plus one.
- Completion criterion:
  - A machine-readable 200-row comparison file exists.

### R2.7-M1 — Add the requested individual-level results to Empirical Evaluation

- [x] Progress: 100% — completed Phase 11, 31 July 2026
- Stage: Manuscript - Phase 11 (Results from measured evidence)
- Type: Manuscript results
- Action:
  - Add a scatter plot of Equation 1 versus decoded bioETH-PRS.
  - Add a summary table reporting MAE, RMSE, maximum absolute error, Pearson correlation, and category agreement.
  - Put all 200 individual rows in supplementary material.
  - Rewrite the current claim “all 50 individuals ... machine epsilon” so it cites the new independent comparison rather than only the TypeScript quantization advisor.
- Completion criterion:
  - The main paper visibly answers the reviewer’s request, and the full person-level evidence is available.

---

# Editor — verbatim

> (There are no comments.)

No editor-specific technical action is required. The cover response should thank the editor and summarize the major revision.

---

# View 2: execution schedule, code and evidence first

## Scheduling principles

1. Ship the code before describing it. Every method sentence in the revised manuscript
   is transcribed from a merged, tested implementation - never from an intended one.
2. Gather every number before writing any results sentence. No placeholder figures.
3. Harden the protected-release interface before evaluating attacks against it.
4. Rename in code before renaming in prose, so the paper inherits the codebase's final
   vocabulary rather than imposing vocabulary the code does not use.
5. Run live-network experiments only once an independent reference supplies the expected
   answer, so a live run validates a known result instead of creating a new unverified one.
6. Write the title, graphical abstract, abstract, key points, and conclusion last.
7. Use the same action IDs as View 1; do not create untracked work.

## What changed from revision 1 of this plan

| Revision 1 | Revision 2 | Reason |
|---|---|---|
| `R1.2-M1` trust wording was action #1 | Moved to Phase 13, the final action | The title and abstract should be written once, against settled vocabulary and final evidence |
| `R2.2-M1` / `R2.3-M1` specs written before their validators | Validators ship in Phase 3; prose transcribed in Phase 9 | Eliminates the risk of documenting rules the code never implements |
| `R1.3-M2` mixed prose and code renames in one step | Code renames in Phase 1, prose in Phase 10 | The codebase fixes the non-DP name; the paper adopts it |
| Old Phase 1 opened with claim wording | All wording now sits behind the evidence stage | A claim cannot be scoped correctly before its evidence exists |
| Live validation was Phase 5 of 7 | Phase 7, last in Stage A | Live runs are the most expensive and least repeatable step; everything they depend on lands first |
| Manuscript work interleaved across phases | Contiguous Stage B | One continuous writing pass over a frozen evidence set |

## Phase 0 - Freeze the revision baseline and tracker

Phase progress: **100%** (4/4 items)

- [x] Create a revision branch from snapshot `2d6f21d4560db77da026aa7d5043e5f1e789288c`.
      Branch `rtr-revision`; baseline commit `0ebbfda` adds the RTR docx, the submitted
      `bioeth_prs (4).tex`, and this plan with no code changes.
- [x] Track all 35 action IDs with status, output path, and manuscript location.
      **This file is the issue tracker.** No external tracker and no owner column: the
      revision has a single implementer, so ownership is implicit. Each action is tracked by
      its View 1 entry (status, progress, code action, manuscript action, completion
      criterion), its `- Stage:` line, and its row in the crosswalk table above.
- [x] Save baseline compile, 137-test, and 100-SNP mock outputs.
      In `evidence/baseline/`, all on node v22.23.1 from a fresh `npm ci` and a
      `hardhat clean` recompile: `npm run build` exit 0 (11 contracts, evm `cancun`, 56
      typings), `npm run test` **137 passing / 0 failing**, `npm run validate:mock` 1 passing
      with an end-to-end decrypted score on chainId 31337. No unsupported-runtime warning.
- [x] Create `evidence/` as the single destination for every artifact produced in Stage A.
      `evidence/README.md` fixes the three evidence classes (`Live fhEVM`, `Hardhat mock`,
      `Analytic projection`), the provenance requirement, and the Stage A to Stage B gate.
      `evidence/claim_deltas.md` holds `CD-001` (open, widens `R2.4-E1` scope) and `CD-002`
      (resolved, runtime pinned to node 22).

Exit gate:

- [x] Every action appears exactly once in this file and no implementation begins on an
      untracked action. Verified programmatically: 35 View 1 action headings, 35 crosswalk
      rows, 35 `- Stage:` annotations, zero unmapped and zero missing.
- [x] No manuscript file is edited until Stage A is complete. `bioeth_prs (4).tex` is committed
      unmodified at `0ebbfda` and must not be touched before the Stage A exit gate clears.
- [x] The build runtime matches `.nvmrc`. nvm v0.40.6 installed at `~/.nvm` with node v22.23.1
      (npm 10.9.8) as the default alias; the Hardhat 2.22 unsupported-runtime warning is gone.
      Closes `CD-002`.

---

# Stage A - Code and evidence (Phases 1-8, 16 actions)

Stage A progress: **16/16 actions (100%)** — complete 31 July 2026. The public Phase 7 run
passed; the private action takes its documented mock-only fallback after an exact funding blocker

Stage A rule: the manuscript is not touched. If a code result contradicts something the
submitted paper claims, record the contradiction in `evidence/claim_deltas.md` and resolve
it in Stage B. Do not fix it in the tex file yet.

## Phase 1 - Code terminology conformity

Why first: every later file, test name, report, and eventually the paper inherits these
names. Renaming now costs minutes; renaming after the experiments costs a re-run.

Phase progress: **1/1 actions (100%)** — complete 28 July 2026. Record: `evidence/phase1/`.

- [x] `R1.3-M2` (code half) `DP` / `DP-inspired` replaced by **bounded randomized categorical
      release** across `contracts/ResultOracle.sol`, `CLAUDE.md`, `README.md`, `docs/design.md`,
      `docs/onboarding.md`, `docs/roadmap.md`, `docs/reference.md`,
      `.claude/instructions/solidity-fhevm.md`, and `.claude/commands/security-review.md`.
      `docs/reviewer-questions-assessment.md` received a supersession banner rather than a
      rewrite, since it records a prior review round. The noise distribution was **not**
      touched. The test file was renamed to `test/rate_limit_randomized_release_test.ts`; its
      `describe` blocks already said `Noisy Release Hardening`, so no descriptions needed
      changing. Scope was 10 files, not the 2 the plan named — see `CD-003`.
      The manuscript half completes in Phase 10.
- [x] `R1.5-T1` The crafted-input test in `test/prs_compute_engine_chunked_snp_test.ts` is now
      `TRUST BOUNDARY: accepts arbitrary encrypted SNP values, including invalid hard calls —
      ciphertext/sample binding is not enforced on-chain`, with a comment block recording what
      is and is not guaranteed, that `[9, 11]` are deliberately invalid dosages, that
      `manifestHash` is provenance rather than binding, and an instruction to update the
      manuscript if the test ever starts passing for the opposite reason.

Phase exit gate:

- [x] A repository-wide search for `DP-inspired` returns no hits in contracts or tests.
      Verified: 0 hits for `DP-inspired`, 0 hits for bare `DP`.
- [x] The compile and the 137-test suite still pass. `hardhat clean` + rebuild exit 0 (11
      contracts, evm `cancun`); **137 passing / 0 failing**; `validate:mock` 1 passing.
- [x] Behavior provably unchanged. `ResultOracle` deployed bytecode with the CBOR metadata
      trailer stripped is byte-identical before and after (sha256
      `c9d1640a...b056332`, 3541 bytes), confirming the code half is a pure rename.

## Phase 2 - Release-policy hardening

Why second: the adversarial experiment in Phase 6 must attack the hardened interface.

Phase progress: **2/2 actions (100%)** — complete 28 July 2026. Record: `evidence/phase2/`.

- [x] `R1.4-C1` `lowThreshold`, `highThreshold`, oracle, and the `oracleRequired` flag now
      live in a per-model `ReleasePolicy` struct in `contracts/ModelMarketplace.sol`, set by
      `setReleasePolicy(...)` under `_requireOwnedDraftModel` and therefore immutable after
      `finalizeModel`. `setOracleRequired` and `setApprovedOracle` were **removed** — both were
      mutable post-finalization, which was itself a bypass; `isOracleRequired` and
      `getApprovedOracle` remain as read-only views. `PRSComputeEngine.finalizeAndClassify` is
      now `finalizeAndClassify(uint256 jobId)` and loads the policy. The threshold-gap check
      moved forward to configuration time so a model cannot be published with a policy that
      would revert on first use.
- [x] `R1.4-T1` New `Release policy` suite in `test/job_lifecycle_test.ts` covering immutability
      after finalization, owner-only configuration, all four validation rejections, the
      unconfigured-model case, policy round-trip, and the `ReleasePolicySet` event. The central
      assertion is at ABI level: `finalizeAndClassify` has exactly one overload with exactly one
      parameter named `jobId`, no engine function has any parameter matching `/threshold/i`, and
      the two removed setters are absent. `test/registry_marketplace_oracle_test.ts` gains a
      behavioural test proving the returned category reflects the **model's** thresholds.
      Multi-wallet and per-sample quota behaviour was already covered by the two existing tests
      `blocks the same sample across requesters when the sample window is exhausted` and
      `rate limits are independent across different samples and requesters`, which document the
      remaining Sybil boundary; see `CD-004`.

Dependencies: Phase 1 naming.

Phase exit gate:

- [x] No protected classification entry point accepts a requester-supplied threshold. Verified
      at ABI level, not by convention: there is no threshold parameter to supply.
- [x] Tests fail against the old interface and pass against the new one. 19 tests failed
      pre-migration; **140 passing / 0 failing** after (up from the 137 baseline).
- [x] Security invariants in `CLAUDE.md` updated: 8 and 9 revised, 10 replaced by
      `Model-defined release policy — no requester-chosen thresholds`, new 11
      `Release policy is immutable after model finalization`, old 11 renumbered to 12.
      `docs/design.md` §6, `docs/roadmap.md`, `.claude/instructions/hardhat-tests.md`,
      `.claude/instructions/solidity-fhevm.md`, `.claude/commands/security-review.md`, and
      `docs/onboarding.md` all updated to the one-argument signature.
- [x] Gas and HCU impact measured: total gas +0.0003% to +0.0009%, HCU ceiling unchanged at
      `20 < ceiling <= 25`. One-time `setReleasePolicy` cost is 77,314 gas per model,
      independent of variant count (`npm run profile:policy-gas`).

## Phase 3 - Independent validation stack

Why third: this produces the expected answers that Phases 5 and 7 validate against, and
the executable rules that Phase 9 transcribes into the Methods section.

Phase progress: **6/6 actions (100%)** — complete 28 July 2026. Record: `evidence/phase3/`,
implementation in `validation/`.

Headline: two implementations derived independently from the manuscript agree **exactly**
(tolerance zero) on encoding parameters, encoded scores, and decoded scores for every
known-answer case. The reference reproduces the manuscript's worked example exactly.
One command, `npm run validate:cross-language`, returns pass/fail and also gates
`npm run validate:local`.

- [x] `R2.6-C1` `validation/independent_prs_reference.py`, standard library only. Implements
      Equation 1, the three-step encoding, decoding, preprocessing, harmonisation, and
      comparison. Written from `bioeth_prs (4).tex` and `docs/design.md`; does not import,
      translate, or transcribe `test/utils/heprs.ts`. The **ordering is recorded** because it
      is the substance of the claim: the Python was finished and all 56 self-checks passing
      before the TypeScript helper was opened to build the contract-side arm.
- [x] `R2.2-C1` Preprocessing and QC, all at scoring time: hard calls restricted to
      `{0,1,2}` with `0.7` and `9` **rejected rather than clamped**; missing-value policy
      **required** in the manifest (`reject` / `zero_dosage` / `mean_dosage`) with no default,
      so an implicit zero is impossible; genome build must be declared and must match;
      variant order verified element-by-element, not by length; duplicates, multiallelics, and
      indels rejected. Emits matched / intercept / missing / imputed / invalid / rejected counts.
- [x] `R2.3-C1` Effect-allele harmonisation with the full six-rule decision table: reject
      multiallelic; reject palindromic `A/T` and `C/G` pairs as strand-ambiguous unless
      explicitly resolved (a literal label match is *not* sufficient there); keep matching
      dosages; apply `2 - g` on reversal; resolve non-palindromic complement matches as strand
      flips; reject incompatible. Emits match / flip / strand-flip / strand-ambiguous /
      incompatible counts.
- [x] `R2.2-T1` QC coverage in the self test: complete sample, missing variant under each
      policy, non-integer dosage, out-of-range dosage, non-numeric dosage, wrong genome build,
      undeclared build, swapped variant order, truncated variant order, duplicate ids,
      multiallelic, and intercept handling.
- [x] `R2.3-T1` Orientation coverage: aligned SNP unchanged; reversed effect allele maps
      `[0,1,2]` to `[2,1,0]`; strand-compatible SNP resolved via complement; unresolved
      palindromic SNP rejected; explicitly strand-resolved palindrome accepted.
- [x] `R2.6-T1` `npm run validate:cross-language` runs both arms over three immutable
      known-answer cases (positive weights, mixed signed weights, allele reversal) and fails
      on any disagreement. Default tolerance is **zero**, since encoded scores are
      deterministic integers on both sides. Each case carries hand-computed expectations that
      `run-case` re-derives rather than trusts — which caught a real defect in the fixtures
      themselves during construction.

Dependencies: Phase 1 naming. Independent of Phase 2.

Phase exit gate:

- [x] The Python reference reproduces hand-calculated known-answer examples. 56/56 self-checks
      and 27/27 hand-computed case expectations agree, including the manuscript's worked
      example (`e = 105`, `PRS = 0.45`).
- [x] One command returns a single pass/fail for cross-language agreement, and **it can
      actually fail**: both negative controls exercised — mismatched arms report
      `COMPARISON FAILED` with exit 1, and a corrupted expectation is detected.
- [x] Every preprocessing and harmonisation rule that will appear in the paper is executable
      and covered by at least one test.
- [x] Expected answers exist for all 200 fixture individuals across all four sizes, 0 rejected,
      round-trip error identically zero. Phases 5 and 7 now have known answers to validate against.
- [x] Findings recorded rather than silently reconciled: `CD-006` (quantisation is exact, not
      machine-epsilon, and the reason does not generalise), `CD-007` (the paper's `z_w` formula
      is missing a clamp both implementations apply), `CD-008` (`round()` has no stated
      tie-breaking rule; measured impact on this paper's numbers is nil).

## Phase 4 - Evidence provenance

Why before the measuring phases: every artifact produced from here on must be traceable, so
provenance is fixed before any reportable number is generated.

Phase progress: **1/1 actions (100%)** — complete 28 July 2026. Record: `evidence/phase4/`.

- [x] `R2.4-E1` All five evidence-producing files now commit to their real inputs via
      `scripts/utils/provenance.ts`: `scripts/sepolia_validation.ts`,
      `scripts/heprs_fixture_profile.ts`, `scripts/gas_profile.ts`,
      `scripts/probe_hcu_ceiling.ts`, `test/heprs_fixture_test.ts`, and
      `scripts/release_policy_gas.ts`. Zero `ZeroHash` occurrences remain, down from 26. Each run records repository commit and dirty flag,
      branch, node version, network and chain id, per-input file digests with byte counts, the
      three model hashes, deployed contract addresses **and bytecode digests**, and the digest
      of the independent reference output it was checked against. Fixture runs hash the same
      manifest the Python reference consumes. Sample registration moved to
      `registerSampleWithManifest`, which the contract already refuses with a zero hash.
      Synthetic runs commit to a canonical digest of the generation spec, the only
      reproducibility available for generated inputs. The provenance block carries no
      timestamp, so two runs at the same commit over the same inputs are byte-identical.

Dependencies: Phase 3 (the reference output digest requires the reference).

Phase exit gate:

- [x] No evaluation path writes a zero manifest hash. Enforced, not merely fixed:
      `test/provenance_guard_test.ts` (9 tests) fails if a guarded file reintroduces
      `ZeroHash`, if a guarded file stops importing the helper, or if the
      behavioural-exemption list goes stale. Suite 140 → **149 passing, 0 failing**.
- [x] A single reported score can be traced to exact inputs, code, and deployment.
      Demonstrated: the 100-SNP validation run and the independent Python reference now agree
      exactly on individual 0 at `encodedScore = 758,685`, `PRS = 0.003843`, round-trip error
      0 — the first agreement between the reference and real contract execution on fixture
      data rather than on constructed cases.
- [x] Scope corrected twice and both corrections recorded. `CD-009`: the rate-limit test is
      behavioural, not evidence-producing — the rate-limit test is
      behavioural and reports no measurement, so placeholder hashes are appropriate there and
      the exemption is guarded against staleness. `CD-013`: the guard list was seeded from
      `CD-001`'s Phase-0 inventory and missed `scripts/release_policy_gas.ts`, which was added
      in Phase 2 and reports gas Phase 8 will cite. A `grep` sweep caught it, not the guard —
      a guard cannot detect its own incompleteness, so the sweep is now part of each phase's
      exit check. Guarded set is six files.
- [x] Cost of provenance measured and attributed by phase. Model publication rises a flat
      **+40,568 gas per model**, independent of variant count (+3.74% of publish at 100 SNPs,
      +0.23% of total). Job creation, compute, and finalize unchanged; HCU ceiling unchanged at
      `20 < ceiling <= 25`, since provenance adds no homomorphic work. See `CD-012`.
- [x] Findings recorded: `CD-010` (Phase 3 used the wrong advisor scale for the 100/500-SNP
      fixtures — caught here, fixed, all four reference files regenerated), `CD-011`
      (`SNP upload gas` is not reproducible to the gas, so the paper over-reports precision),
      `CD-012` (published model-publication gas was measured with zero hashes and understates
      the system as described).

## Phase 5 - Individual-level correctness evidence

Phase progress: **1/1 actions (100%)** — complete 28 July 2026. Record: `evidence/phase5/`.

Headline: all **200 individuals** (50 at each of 100 / 500 / 1,000 / 5,000 SNPs) scored end to
end through the encrypted contract path and compared against the independent reference.
**200/200 exact agreement**, MAE = RMSE = max absolute error = **0**, Pearson *r* = **exactly 1**
established in exact decimal arithmetic. 10 minutes wall clock.

- [x] `R2.7-E1` `scripts/individual_level_validation.ts`, run via
      `npm run validate:individual-level`. One published model per size, one job per individual,
      streaming path. Records the plaintext Equation 1 score, the decoded bioETH-PRS score, the
      absolute error, and category agreement. Closes the gap the plan identified: the submitted
      evaluation executed the encrypted path for only the **first** individual at each size,
      checking the other 49 for TypeScript-side overflow alone. Output includes a full
      provenance block per size and reuses the Phase 3 comparator format rather than a second
      comparator. Summary statistics via a new `summarise` subcommand on the reference.

Dependencies: Phases 3 and 4.

Phase exit gate:

- [x] A machine-readable 200-row comparison file exists:
      `evidence/phase5/individual_level_comparison.csv`, 200 data rows plus header, 50 per
      fixture size. Audited independently of the runner's own assertion by re-reading both JSON
      sets and comparing encoded scores directly: 0 mismatches.
- [x] Summary statistics computed and saved rather than left to be recomputed by hand:
      `evidence/phase5/summary_statistics.json`, per size and overall.
- [x] The leading intercept column is recorded explicitly. Encoded vector length is nominal
      **+ 1** — 101 / 501 / 1,001 / 5,001 positions — stated in every output file and in the CSV.
- [x] Category agreement measured honestly rather than as a single percentage. At 100 SNPs with
      `B = 128`: **48/48 agree outside the ambiguous band**, 2 of 50 fall within `B` of a
      threshold where the mechanism is designed not to be deterministic. Both in-band
      individuals happened to agree, which is a favourable noise draw and is **not** reported as
      50/50. Measured at one size deliberately, since classification consumes a single encoded
      score and is independent of variant count. See `CD-014`.
- [x] Parameter-mismatch guard added. The runner refuses to proceed if the reference manifest's
      scale, weightZeroPoint, or scoreOffset disagree with the advisor recommendation, naming
      `CD-010` in the error. That is the Phase 4 failure mode: a scale mismatch produced a
      uniform 3x disagreement indistinguishable from an encoding bug.
- [x] Framing constraint recorded, not just the numbers. Per `CD-006` the error is zero **by
      construction** — the fixture weights carry six decimal places and the advisor scale is an
      integer multiple of 10^6, so quantisation is lossless. This validates the **pipeline**
      (preprocessing, alignment, encoding, chunked on-chain execution, ACL-gated decryption,
      decoding), **not** arithmetic precision. `R2.7-M1` must say which claim it makes.
- [x] Further findings recorded: `CD-015` (the documented `B/2` bias correction places the
      individual defining a distribution-derived threshold at the point of maximum
      classification ambiguity — an inherent trade-off, observed directly), `CD-016` (mock
      per-individual latency measured at 1.55-1.76 ms per encoded position, mildly superlinear;
      must never appear unlabelled beside HEPRS real-FHE latency).
- [x] `scripts/individual_level_validation.ts` added to the provenance guard **at the time of
      writing**, per the `CD-013` lesson. Guarded set is now 8 files, 10 guard tests.

## Phase 6 - Adversarial evidence

Phase progress: **1/1 actions (100%)** — complete 28 July 2026. Record: `evidence/phase6/`.

Headline: **the 2,800-hour extraction claim is wrong in three independent ways and overstates
attacker cost by ~252x per weight.** Reviewer 1's suspicion that it "appears heuristic" was
correct, and the problem is worse than heuristic. See `CD-017`.

- [x] `R1.4-E1` `scripts/anti_probing_evaluation.ts`, run via `npm run evaluate:anti-probing`
      (51 s, ~1,600 real jobs). All five reviewer-named variations evaluated against **real
      contracts** on the mock coprocessor — every query is an actual job and every observation a
      real decryption; nothing is simulated. Uses a **private** model throughout, since a public
      model's weights are plaintext by design and extraction is meaningless; the attacker is an
      authorised private-model reader, which is both the realistic and the strongest adversary.
      Extraction arms run with rate limiting **off** to measure the information cost in queries;
      arm 6 measures the permitted rate. Wall clock is the product with the block time stated as
      an assumption — the two-factor decomposition whose collapse produced the original error.

Dependencies: Phase 2 (hardened interface), Phase 4 (provenance).

Measured results at an equal 320-query budget, N = 20 private weights, B = 128:

| Arm | Design | Adaptive | Queries | Pearson r | Sign acc. | Within B |
|---|---|:---:|---:|---:|---:|---:|
| 1 | No oracle, raw score | — | **20** | 1.0000 | 100% | 100% |
| 2 | Baseline, caller-chosen thresholds | yes | 320 | 1.0000 | 100% | 100% |
| 3 | Baseline, caller-chosen thresholds | no | 320 | 0.6689 | 65% | 0% |
| 4 | **Hardened, fixed thresholds** | yes | 320 | 0.9391 | 70% | **0%** |
| 5 | Hardened + correlated LD probes | no | 320 | -0.0037 | 65% | 0% |

Phase exit gate:

- [x] All five attacker capabilities named in Reviewer 1, Comment 4 are **evaluated**, none
      deferred as out of scope. (1) Adaptive vs non-adaptive: decisive, but only when thresholds
      can be moved. (2) Multi-wallet: the same-sample bypass is **closed** — 3 jobs for the first
      wallet, **0** additional for two further wallets on the same registered sample. (3) Fixed vs
      caller-selected thresholds: 200 queries recover all 20 weights under the submitted design;
      **0/20** within the noise bound under the hardened design at 320 queries. (4) Correlated
      SNPs: recovery collapses to r = -0.004, but the mitigation is **vacuous** — see `CD-020`.
      (5) Cross-sample: distinct wallets with distinct samples each receive a full independent
      quota, the remaining Sybil boundary, bounded further for private models by the
      `setPrivateModelReader` allowlist.
- [x] Query count and a direct extraction metric reported: Pearson r, sign accuracy, mean
      relative error, and the fraction of weights recovered to within the noise bound. Arm 2 emits
      a full extraction-cost curve rather than a single point.
- [x] The numbers replacing the 2,800-hour claim are recorded and reproducible: **10 queries per
      weight**, 200 for the whole model, which is 11.1 hours per weight or 222.2 hours for all 20
      at the paper's own R = 3, W = 1000, 12 s/block. The measured figure closely matches the
      **corrected** information bound of 9.04 queries per weight.
- [x] Baseline fidelity guaranteed, not assumed (`CD-005`). `contracts/attack-baseline/` is a
      frozen copy of `2d6f21d`; `test/attack_baseline_isolation_test.ts` (6 tests) proves that
      reversing only the documented renames reproduces the frozen source **byte for byte**, that
      no deployment path references it, that live contracts never import it, and that it still
      exposes the 4-argument entry point while the live contract exposes 1.
- [x] Findings recorded rather than smoothed: `CD-017` (three errors in the 2,800-hour claim),
      `CD-018` (fixed thresholds prevent precise recovery but still leak structure at r = 0.94 —
      claim resolution reduction, **not** confidentiality), `CD-019` (B = 128 is 1.34% of the
      largest weight, ~7 bits of blur on a 13.2-bit weight, so the bound must scale with weight
      magnitude), `CD-020` (the correlated-SNP mitigation is vacuous without input validation,
      which ties R1 C4 to R1 C5 — they cannot be answered independently).
- [x] Limits stated in the record: mock coprocessor, N = 20, one specific estimator strategy, and
      these are **lower bounds** on attacker effort. A better attack may exist; the absence of one
      here is not a security proof.

## Phase 7 - Live fhEVM validation — **COMPLETE: PUBLIC LIVE; PRIVATE MOCK-ONLY FALLBACK**

Why after correctness: the live run should validate known answers, not create another unverified
number. That intent is preserved — the harness asserts the decoded score against the Phase 3/5
known answer, so a live pass would be a validation rather than a new claim.

Phase progress: **2/2 actions complete** — the public 100-SNP run passed on live Sepolia; the
private action takes its explicit mock-only fallback because the remaining wallet balance is
insufficient for a safe run.
Record: `evidence/phase7/`.

- [x] `R1.1-E1` Public-weight live run. Four contracts were deployed once, then the complete
      public 100-SNP classic workflow executed in **25 transactions / 20,710,271 gas**. All
      receipts have status 1. Eleven real compute chunks passed, `JobFinalized` emitted score
      handle `0x436c...0500`, Gateway/KMS user decryption took **8,081 ms**, and the decoded
      score **758,685** exactly matched the independent reference. The full report, checkpoint,
      transcript, source hash, bytecode hashes, and an independent receipt re-check are under
      `evidence/phase7/live_2026-07-31/`.
- [x] `R1.1-E2` Private-weight live run or documented fallback. Parameterisation is complete:
      `MODEL_VISIBILITY=private` encrypts and uploads weights, authorises the engine/requester,
      and writes a distinct checkpointed report. It passes end to end on mock with 22
      classic-path transactions and score 758,685. The wallet now holds **0.012769 ETH**, below
      the safe budget for the roughly 29.8 M-gas mock workflow, so no underfunded private
      transaction was submitted. The accepted fallback is to state that private execution is
      implemented and mock-validated but not validated live; no private live result is reported.

### What Phase 7 established

| Check | Result |
|---|---|
| Network | Sepolia, chain ID 11155111 |
| All contracts within EIP-170 | yes — largest `PRSComputeEngine` 10,426 B (42.4%) |
| Live harness readiness | **8/8 asserted**, including both visibilities, transaction trail, and exact runner-source hash |
| Live deployment | 4 tx / **5,892,559 gas** / **0.0062781714 test ETH** |
| Live public 100-SNP job | 25 tx / **20,710,271 gas** / **0.0252747648 test ETH** |
| Live result | encoded score **758,685**, exact; submission-to-result 269,320 ms; decryption 8,081 ms |
| Geometry-matched public mock | 25 tx / 18,755,864 gas; live total **10.42%** higher at this one point |
| Private 100-SNP mock | 22 classic-path tx / 29,797,061 gas; live not executed |
| Remaining wallet balance | **0.0127690815 test ETH** — insufficient for the private workflow |

The first public attempt is retained rather than overwritten: nine transactions mined before the
Zama relayer closed a TLS socket during the second SNP proof. It produced no final result and is
labelled failed. The runner now prepares all proofs before workflow writes, retries transport-only
failures, and checkpoints every receipt. Attempt 2 exercised that retry before spending and then
completed successfully. The previously flagged empty-proof finalization path also passed against
the real coprocessor; this is a live validation point, not a general proof of future SDK behavior.

Phase exit gate:

- [x] At least one real fhEVM end-to-end score matches the independent Equation 1 reference.
      Public 100-SNP individual 0 decoded to **758,685**, exactly matching both independent and
      mock arms; all 25 transaction receipts and three runtime bytecode identities re-verified.
- [x] The paper's live private-weight claim matches the actual result.
      The accepted `R1.1-E2` fallback requires the manuscript to distinguish the successful
      public live result from the mock-only private path. The Sepolia HCU ceiling remains
      unmeasured; one successful chunk size of 10 is not a ceiling measurement.

### Findings

- [x] `CD-021` The HCU ceiling is **21, not 20**, and is **identical for public and private
      models** (21 pass / 22 fail for both). The old figure was an artefact of a coarse candidate
      list. `probe_hcu_ceiling.ts` now takes `MODEL_VISIBILITY` and `HCU_CHUNK_SIZES`.
- [x] `CD-022` **The documented C×P optimisation does not happen.** `CLAUDE.md` claimed the
      coprocessor "optimizes C×P internally" and `docs/design.md` claimed that made public models
      "~60% cheaper" — both false. `FHE.asEuint64(w)` yields a real handle, so the following
      `mul` takes the `euint64 x euint64` overload and passes `scalar = false`, paying the full
      596,000 HCU instead of 365,000. The discount exists and is unused
      (`FHE.mul(euint64, uint64)` passes `true`): a **38.8%** HCU saving per multiplication that
      would raise the public ceiling from 21 to roughly **34** and cut compute transactions for a
      5,000-SNP job from **239 to about 148**. The real public-vs-private gas gap is **28%**, from
      packed storage reads, not FHE work. Documentation corrected in four places; the optimisation
      **deliberately deferred**, since changing `computeChunk` would invalidate the Phase 4-6
      measurements.
- [x] `CD-023` **Private-weight jobs cost 2.01x public ones** (23.51 M vs 11.69 M gas, 17 vs 15
      transactions). The manuscript prices public models while its anti-probing discussion is
      explicitly about private ones, and Phase 6 established extraction is only a threat for
      private models — so the configuration needing protection costs double the one priced.
- [x] `CD-024` The original credential blocker is partially resolved: public live execution
      passed; private live execution is now blocked only on additional test ETH. The failed
      attempt, actual fees, remaining balance, and manuscript fallback are recorded.

## Phase 8 - Evidence synthesis

Why here: both syntheses read across every prior phase, so they run once the evidence set is
frozen. These build the data behind two paper tables; the tables are inserted in Stage B.

Phase progress: **2/2 actions (100%)** — complete 31 July 2026. Record:
`evidence/phase8/`.

- [x] `R1.6-E1` Three-class table saved machine-first as
      `scale_evidence.json` and rendered as `scale_evidence.md`. The table now contains one
      verified `Live fhEVM` public 100-SNP row at **25 transactions / 20,710,271 gas**, while
      private live execution remains absent. Hardhat-mock execution covers public
      100 / 500 / 1,000 / 5,000-variant streaming flows at
      **15 / 47 / 88 / 413 transactions**, plus private 100 at **17**. Larger public/private
      rows at 10,000 / 100,000 / 1,000,000 are labelled `Analytic projection / unexecuted`
      and report transaction geometry only — no latency or gas extrapolation.
- [x] `R1.8-E1` `measured_transaction_use.json` reports deployment, publication,
      sample registration, job creation, streaming compute, raw/category result alternatives,
      and the off-chain decryption boundary. The live Sepolia deployment is **4 tx / 5,892,559
      gas / 0.0062781714 test ETH**; the live public job is **25 tx / 20,710,271 gas /
      0.0252747648 test ETH**, with 8,081 ms decryption. Four-contract mock deployment is
      5,892,613 gas;
      public/private 100-variant jobs are **15 / 17 tx** and **11.690 / 23.508 M mock gas**.
      A geometry-matched 25-transaction mock used 18,755,864 gas, so the one live point was
      **10.42%** higher; that does not justify a general conversion factor.
      `fee_sensitivity.json` is a separate `Analytic projection`, gives ETH arithmetic only,
      and makes no USD or production-affordability claim. `CD-025` records why totals are
      rounded: Phase 7 prose and machine JSON differ by 12 gas.

Dependencies: Phases 5, 6, and 7.

Stage A exit gate - do not begin Stage B until all of the following hold:

- [x] All 16 Stage A actions are complete. **16/16:** `R1.1-E1` passed live and `R1.1-E2`
      takes its documented private-mock-only fallback after the recorded funding blocker.
- [x] `npm run build` and the full test suite pass. Final Stage A gate:
      **174 passing**, 0 failing, node v22.23.1. Cross-language validation also passes all
      three known-answer cases at tolerance 0. `tsc --noEmit` retains the same 14 pre-existing
      generated-contract typing diagnostics and reports none in the Phase 7/8 changed files.
- [x] Every number that will appear in the revised manuscript exists in a saved file under
      `evidence/`, with a stated evidence class of `Live fhEVM`, `Hardhat mock`, or
      `Analytic projection`.
- [x] `evidence/claim_deltas.md` lists every submitted claim the new evidence contradicts,
      weakens, or fails to support.
- [x] No planned manuscript sentence requires a number that does not yet exist. `MS-05`
      takes the public-live/private-mock branch unless the private run later completes.

---

# Stage B - Manuscript (Phases 9-13, 19 actions)

Stage B progress: **19/19 actions (100%)**

Stage B rule: every edit cites a Stage A artifact. If a sentence cannot name the file,
table, test, or transaction hash behind it, the sentence is removed rather than softened.

## Phase 9 - Methods written from code

Why first in Stage B: these sections define the objects that the security, results, and
comparison sections refer to.

Phase progress: **3/3 actions (100%)**

- [x] `R2.2-M1` Add `Background/Methods -> Genotype preprocessing, QC, and model alignment`,
      transcribed from the merged `R2.2-C1` implementation. Distinguish cohort-development QC
      (MAF, Hardy-Weinberg) from scoring-time checks (missingness, allele and build matching).
- [x] `R2.3-M1` Redefine `g_i` as the dosage of the model-specified effect allele; state that
      public model metadata exposes variant identity, build, effect allele, other allele, and
      order even when weights stay encrypted; give the `2 - g` rule; note that the supplied
      HEPRS fixtures are assumed pre-aligned.
- [x] `R2.5-M1` Lead the three-SNP example with the plaintext weighted sum, then show the six
      encoding steps, add the workflow figure, and move handle/ACL detail out of the main
      explanation.

Dependencies: Phase 3.

Step completion: **3/3**

## Phase 10 - Security model and release narrative

Phase progress: **5/5 actions (100%)**

- [x] `R1.3-M1` Remove all DP framing: `DP-inspired` becomes `bounded randomized categorical
      release`; the `DP bias` heading becomes `One-sided randomization and bias`; state plainly
      that the mechanism provides no `(epsilon, delta)` guarantee.
- [x] `R1.3-M2` Describe only the implemented mechanism: retain `e_noisy = e + nu` with
      `nu ~ Uniform(0, B)`, state its one-sided support, expected bias, threshold adjustment,
      and absent composition analysis; move formal adjacency, sensitivity, and calibrated DP to
      Future Directions. Completes the split action opened in Phase 1.
- [x] `R1.5-M1` Move SNP authenticity from Limitations into `Security Model`, immediately after
      `Threat Model`; add the malicious authorized requester; state that the contracts compute
      over submitted ciphertexts without proving those ciphertexts encode the registered
      sample. Update the `fig_security` caption so ciphertext/sample binding sits outside the
      guaranteed boundary, and cite the renamed `R1.5-T1` test.
- [x] `R1.5-M2` Define the evaluated setting as trusted local genotype preparation; explain
      that `manifestHash` is a provenance commitment only; move signed laboratory attestation
      and zero-knowledge ciphertext-to-sample proofs to Future Directions.
- [x] `R1.2-M2` Add the trust and failure-boundary table covering genotype
      provider/preprocessor, model provider, smart contracts, blockchain consensus, fhEVM
      coprocessor, Gateway/relayer, and ACL/threshold decryption; mark each as affecting
      confidentiality, correctness, availability, or provenance. Make `Core Privacy Invariants`
      explicitly conditional on these assumptions, and replace `verifiable security properties`
      in the `fig_security` caption with the assumptions it actually rests on.

Dependencies: Phases 1, 2, and 9. `R1.4-C1` must already be merged before the release policy
is described as model-defined.

Step completion: **5/5**

## Phase 11 - Results from measured evidence

Phase progress: **4/4 actions (100%)**

- [x] `R2.7-M1` Add the Equation 1 versus decoded bioETH-PRS scatter plot and a summary table
      reporting MAE, RMSE, maximum absolute error, Pearson correlation, and category agreement.
      Put all 200 rows in supplementary material. Rewrite the current `all 50 individuals ...
      machine epsilon` claim so it cites the independent comparison rather than the TypeScript
      quantization advisor.
- [x] `R2.4-M1` Add the correctness-guarantee boundary table to `Correctness and Protocol
      Verification`, naming what the genotype preprocessor, model provider, smart contracts,
      fhEVM infrastructure, independent reference implementation, and end user each guarantee.
      State that the protocol guarantees none of sample authenticity, clinical validity,
      calibration, or ancestry portability.
- [x] `R1.4-M1` Replace the 2,800-hour and `thousands of hours` claims with the Phase 6 numbers
      plus the bounded conclusion that the controls reduce output resolution and raise query
      cost under the evaluated attacker models without preventing Sybil attacks or providing a
      formal model-confidentiality guarantee.
- [x] `R1.1-M1` Label every result `Live fhEVM`, `Hardhat mock`, or `Analytic projection`. Add
      the live validation paragraph and table row from Phase 7. Delete the `within 10--20% of
      real-network deployment` sentence. Stop presenting the `~386 ms` mock latency beside HEPRS
      real-FHE latency. In `System Design -> Model Marketplace`, separate `implemented in the
      contracts` from `validated on a live network`, matching the actual `R1.1-E2` outcome.

Dependencies: Phases 5, 6, 7, and 10.

Step completion: **4/4**

## Phase 12 - Scope, cost, and HEPRS comparison

Why after results: each of these is a bounding statement over numbers that must already be on
the page.

Phase progress: **6/6 actions (100%)**

- [x] `R1.6-M1` Define the bounded intended use: a bounded-size research prototype for curated
      additive PRS models. Replace `5,000 (scalable)`, the `exactly the primitive that FHE
      systems are designed to support efficiently` framing, and the routine-clinical-practice
      conclusion. State that the study does not establish clinical deployment feasibility.
- [x] `R1.6-M2` Surface the bounded scope in the last paragraph of the Introduction and at the
      opening of `Empirical Evaluation`, keeping the detailed ceiling discussion in Limitations.
      The Abstract and Key Points instances land in Phase 13.
- [x] `R2.1-M1` Add the direct Discussion sentence that the method applies only to a narrow
      class of bounded-size PRS models and is not a practical genome-wide PRS engine. Answer
      Reviewer 2 self-containedly in the response letter, not by cross-reference.
- [x] `R1.8-M1` Rename `Deployment Cost Projections` to `Measured transaction use and fee
      sensitivity`; insert the Phase 8 measured table; remove the commercial-genomics
      comparison, the `Commercial viability requires` passage, and the `practical for curated
      clinical PRS panels` conclusion. Keep measured quantities and hypothetical price
      conversions in separate subsections.
- [x] `R1.7-M1` Rebuild `tab:comparison` one dimension per row: privacy architecture,
      designated evaluator, remaining trust assumptions, arithmetic scheme, demonstrated
      encrypted variant count, latency evidence type, memory evidence, deployment requirements,
      output policy, metadata exposure. Mark each row measured, inherited, mock, or unavailable.
      State that bioETH-PRS memory was not measured. Update the `Trust model` row to name
      contracts, consensus, coprocessor, and ACL/KMS as retained trust anchors.
- [x] `R1.7-M2` Replace superiority language with trade-off language across the Introduction,
      `Comparison with HEPRS`, `HEPRS and bioETH-PRS: Complementary Systems`, Related Work, and
      Conclusion, so the comparison reads as balanced to an author of HEPRS.

Dependencies: Phases 7, 8, and 11.

Step completion: **6/6**

## Phase 13 - Front matter and conclusion

Why last: the title, graphical abstract, abstract, and key points are the highest-leverage
claims in the paper and should be written once, over a finished body.

Phase progress: **1/1 actions (100%)**

- [x] `R1.2-M1` Retitle to `bioETH-PRS: Confidential Polygenic Risk Scoring with Auditable
      fhEVM Orchestration on a Programmable Blockchain`. Replace `removes trust` with `removes
      the designated application-level evaluator`; replace `trustless` and `zero trust` with
      `evaluator-minimized`; delete `computation verified by blockchain consensus` and state
      that contract execution is publicly auditable while confidentiality and decryption depend
      on the coprocessor, ACL, Gateway/KMS, and chain assumptions. Propagate through the title,
      graphical abstract, Abstract, Introduction, Key Points, Discussion, and Conclusion, and
      carry the Phase 12 scope and cost wording into the Abstract and Key Points in the same pass.

Dependencies: Phases 9 through 12, all complete.

Step completion: **1/1**

Stage B exit gate:

- [x] Every manuscript claim names the `evidence/` artifact behind it.
- [x] No sentence exceeds its evidence class.

---

## Phase 14 - Response letter and final consistency

Phase progress: **100%**

### Step 14.1 - Write the point-by-point response

- [x] Copy each verbatim comment from View 1.
- [x] Under it, list completed action IDs.
- [x] State the numerical result where applicable.
- [x] Add final manuscript page/line ranges.
- [x] Add repository file, figure, table, or transaction references.
- [x] If an action could not be completed, state which claim was removed instead.

### Step 14.2 - Final consistency checks

- [x] Search the manuscript for `trustless`, `zero trust`, `DP-inspired`, `cost-competitive`,
      `commercial viability`, `clinically practical`, `5,000 (scalable)`, `2,800 hours`, and
      unqualified `exact score correctness`.
- [x] Verify all 35 View 1 action checkboxes agree with the crosswalk and View 2.
- [x] Re-run compile, the complete test suite, the independent validator, the adversarial
      script, and live-result verification.
- [x] Regenerate every table and figure from saved `evidence/` outputs.
- [x] Confirm `CLAUDE.md` security invariants match the shipped contracts.

Phase exit gate:

- [x] Overall progress is 35/35 actions.
- [x] Every reviewer comment points to at least one completed action and one manuscript location.
- [x] No final claim exceeds its evidence class.

---

# Completion summary

| Stage | Phase | Actions | Completed | Progress |
|---|---|---:|---:|---:|
| A | 1. Code terminology conformity | 1 | 1 | **100%** |
| A | 2. Release-policy hardening | 2 | 2 | **100%** |
| A | 3. Independent validation stack | 6 | 6 | **100%** |
| A | 4. Evidence provenance | 1 | 1 | **100%** |
| A | 5. Individual-level correctness evidence | 1 | 1 | **100%** |
| A | 6. Adversarial evidence | 1 | 1 | **100%** |
| A | 7. Live fhEVM validation | 2 | 2 | **100% (public live; private fallback)** |
| A | 8. Evidence synthesis | 2 | 2 | **100%** |
| **A** | **Code and evidence subtotal** | **16** | **16** | **100%** |
| B | 9. Methods written from code | 3 | 3 | **100%** |
| B | 10. Security model and release narrative | 5 | 5 | **100%** |
| B | 11. Results from measured evidence | 4 | 4 | **100%** |
| B | 12. Scope, cost, and HEPRS comparison | 6 | 6 | **100%** |
| B | 13. Front matter and conclusion | 1 | 1 | **100%** |
| **B** | **Manuscript subtotal** | **19** | **19** | **100%** |
| | **Total reviewer actions** | **35** | **35** | **100%** |

Phase 0 and Phase 14 are coordination and final-integration gates; they do not add reviewer
action IDs to the 35-action total.

## Reviewer coverage check

| Reviewer comment | Stage A actions | Stage B actions |
|---|---|---|
| R1.1 mock-only evaluation | `R1.1-E1`, `R1.1-E2` | `R1.1-M1` |
| R1.2 trust language | - | `R1.2-M1`, `R1.2-M2` |
| R1.3 differential privacy | `R1.3-M2` (code half) | `R1.3-M1`, `R1.3-M2` |
| R1.4 model extraction | `R1.4-C1`, `R1.4-T1`, `R1.4-E1` | `R1.4-M1` |
| R1.5 SNP authenticity | `R1.5-T1` | `R1.5-M1`, `R1.5-M2` |
| R1.6 scale | `R1.6-E1` | `R1.6-M1`, `R1.6-M2` |
| R1.7 HEPRS comparison | - | `R1.7-M1`, `R1.7-M2` |
| R1.8 cost projections | `R1.8-E1` | `R1.8-M1` |
| R2.1 narrow SNP class | - | `R2.1-M1` |
| R2.2 genotype QC | `R2.2-C1`, `R2.2-T1` | `R2.2-M1` |
| R2.3 effect-allele coding | `R2.3-C1`, `R2.3-T1` | `R2.3-M1` |
| R2.4 correctness guarantee | `R2.4-E1` | `R2.4-M1` |
| R2.5 interpretability | - | `R2.5-M1` |
| R2.6 double programming | `R2.6-C1`, `R2.6-T1` | - |
| R2.7 Equation 1 agreement | `R2.7-E1` | `R2.7-M1` |

Comments R1.2, R1.7, R2.1, and R2.5 are manuscript-only: they are addressed by rewriting
claims over evidence produced elsewhere in Stage A, not by new code.
