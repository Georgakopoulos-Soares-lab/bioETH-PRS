# bioETH-PRS RTR revision review

Review of `origin/rtr-revision`, `RTR_and_paper/`: pre-revision `original_arxiv_upload/` vs
post-review `final_arxiv_upload/`, cross-checked against `manuscript/source/`, the reviewer
document, the generated response, `evidence/phase5-8`, and the contracts on the same branch.

No files were modified. Everything below is a finding or a recommendation.

## 1. Method

| Check | How |
|---|---|
| Text delta | `diff -u original_arxiv_upload/bioeth_prs.tex final_arxiv_upload/bioeth_prs.tex` (1,890 lines) |
| Package delta | `diff` final vs `manuscript/source/bioeth_prs.tex`; read `scripts/build_final_arxiv_upload.py` |
| Reviewer coverage | reviewer DOCX (8 + 7 comments) mapped to manuscript sections and to the response DOCX |
| Numbers | every figure/table/inline number recomputed and traced to `evidence/phase5-8/*.md|json` |
| Contract claims | `contracts/{ResultOracle,ModelMarketplace,PRSComputeEngine}.sol` on the branch |
| Build integrity | cite keys vs `.bib` vs `.bbl`, `\label`/`\ref` closure, figure SHA-256, rendered PDF pages |
| Voice | phrase-frequency and disclaimer-density comparison against the pre-revision text |

## 2. Verdict

The scientific de-escalation is done properly. Every reviewer comment has a traceable change,
the numbers reconcile with the archived evidence, and the contract-level claims match the code.
Two problems remain.

**Facts.** The prose was rewritten; four of six figures were only patched at a few pixel
rectangles, and two were kept byte-for-byte. Text and figures now disagree — in one case a
figure still asserts a claim the text retracted. Separately, the response to reviewers describes
the arXiv package, not the journal manuscript, and the two differ in figure content.

**Assessment of AI-generated language.** The revision does not read as machine-generated at
sentence level; it is plain, concrete, and correctly cautious. It does read as machine-*revised*
at document level: one hedge is repeated seven times, ~30 paragraphs end with a same-shaped
disclaimer, and one word ("calculation", 113 uses) was substituted for the domain vocabulary
throughout. Those three patterns are what a careful reader will notice. Fixing them is
mechanical and does not touch a single number.

## 3. Blocking — fix before submission

Line numbers refer to `final_arxiv_upload/bioeth_prs.tex` unless stated.

### 3.1 Figure 1 still claims "Machine-epsilon Accuracy"

The graphical abstract's bottom badge row reads `37% Gas Reduction (Streaming Path)` /
`Machine-epsilon Accuracy` / `TFHE/Lattice Security Assumption`.

`build_final_arxiv_upload.py:edit_graphical_abstract` patches only the header, the right-hand
caption, and the lattice card. The other two badges were never touched, and
`plans/final_arxiv_parity_audit.md` does not mention them.

"Machine-epsilon" is precisely the wording the revision retracted (now: exact "because the study
weights were represented without rounding", lines 112–115, 896–899). The retracted claim is back
on page 1 in larger type than the abstract. `37%` also lacks the local-simulation qualifier the
text applies everywhere else.

Fix: repaint both badges — `35.4–37.2% less gas (local simulation)` and
`Exact agreement, 200 local calculations`.

### 3.2 Figure 1 banner re-asserts consensus enforcement

Banner: "Consensus-enforced Confidential Polygenic Risk Scoring via FHE on Blockchain".

Body text (lines 182–183, 305–307, 366–368, 1096) states that consensus records but does not
verify the encrypted arithmetic. Reviewer 1, comment 2 asked exactly for this softening; the
banner reverses it at the most visible point in the paper. "Consensus-enforced" was chosen as the
replacement for "Trustless", but it is the same class of claim.

Fix: "Confidential Polygenic Risk Scoring with FHE Smart Contracts".

### 3.3 Figure 6 (gas scaling) contradicts Table 7

`fig_gas_scaling.png` is byte-identical to the pre-revision file. In-figure values vs Table 7:

| SNPs | Figure | Table 7 | Figure reduction | Table 7 reduction |
|---:|---:|---:|---:|---:|
| 100 | 17.8 M / 11.5 M | 17.863 M / 11.538 M | 35.5% | 35.4% |
| 500 | 83.8 M / 52.9 M | 83.985 M / 53.063 M | 36.8% | 36.8% |
| 1,000 | 166.6 M / 104.8 M | 166.875 M / 105.013 M | 37.1% | 37.1% |
| 5,000 | 828.4 M / 519.9 M | 829.422 M / 520.487 M | 37.2% | 37.2% |

The figure also prints "Note: Linear scaling O(N) confirmed in both paths", stronger than the
revised text ("grows approximately linearly over the measured range; this is not a claim about
scaling on Sepolia", lines 952–954). The abstract's `35.4–37.2%` and the figure's `35.5%` are
visibly inconsistent on facing pages.

`manuscript/source` already carries a regenerated PDF version of this figure with a clean
caption. Use it. Retaining a superseded plot invites a fresh objection on the exact axis
Reviewer 1 raised.

### 3.4 Two captions discuss the paper's own revision history

- Line 434: "**Original** three-stage overview of the fixed-point conversion…"
- Line 960: "**Original** gas-scaling visualization… The graphic retains the original plotted
  values; Table~\ref{tab:gas} reports the final **post-review** measurements and is the numerical
  source for the revised comparison."

A published reader has no "original" or "post-review" frame; this is internal audit language
leaking into the artifact. Both captions were injected by the builder
(`build_final_arxiv_upload.py`, `new_quantization_caption` / `new_gas_caption`) and *replace*
correct content-describing captions that already exist in `manuscript/source` (lines 433–437 and
967–971 there). Restore the manuscript captions.

### 3.5 Figure 3 (quantization) prints a superseded formula

Byte-identical legacy figure. Three defects, now visible because the text corrected the maths:

1. Stage 2 shows `z_w = −min(q_i)`; Eq. 3 (line 453) is `z_w = max(0, −min_i q_i)`, and lines
   456–458 explain why the clamp is required.
2. Stage 1 says "Scale factor s = 10⁶ chosen by quantization advisor" while the worked example in
   the same panel (`β=[−0.30,0.10,0.25] → q=[−30,10,25]`) implies s = 100 — the value §4.3 now
   states explicitly (line 487).
3. Stage 3 renders `partialSum` as `∂Sum` (partial-derivative glyph).

Item 1 is a mathematical contradiction with a numbered equation, not a cosmetic issue.

### 3.6 Figures and text now use different vocabularies

The prose systematically removed terms the figures still display:

| In figures | Status in revised text |
|---|---|
| `ACL`, `per-address ACL`, `ACL-gated decryption`, `ACL entry` | removed everywhere; replaced by "record stating who may decrypt it" |
| `SSTORE`, `TSTORE`, `EIP-1153` | removed |
| `Ciphertext opacity invariant` | Invariants 1–5 deleted from the text |
| `Protocol Guarantees` (fig. 5 column header) | §6 reframes these as *assumptions* about fhEVM services (lines 366–368, 737–738) |
| `FSM`, `PENDING→UPLOADING→READY→COMPUTING→DONE` | state machine removed; §7.2 gives an unnamed four-step order |
| `Quantised weights` | text is now consistently American: "quantized" |
| `manifest URI on-chain` | text says "cryptographic fingerprint of the input-preparation record" |
| `appendSnpChunk`, `finalizeSnpUpload`, `computeChunk`, `appendAndComputeChunk`, `finalizeAndClassify` | undefined in text; Algorithms 1–2 were deleted, only `readPartial` survives |

A reader cannot map Figures 2, 4 and 5 onto the text. Either regenerate the figures in the new
vocabulary (the `manuscript/source` PDFs presumably do this) or reintroduce the terms with a
one-line gloss. See also §5.4.

Also: Figure 5's caption (lines 678–682) claims the figure shows that the contracts "do not prove
that the encrypted SNPs came from the registered sample" — no such element exists in the graphic.

### 3.7 Eq. 9 renders a wrong glyph

Lines 759–760 use `\mathbb{1}[...]`. With `amssymb` the `\mathbb` alphabet has no digit glyphs;
the rendered PDF (p. 8) shows a nonsense symbol in place of the indicator. Pre-existing, still
shipping. Use `\mathbf{1}` or load `bbm` and use `\mathbbm{1}`.

### 3.8 Table 6 is never referenced

`tab:probing` (line 804) has no `\ref` anywhere. §6.5 narrates the results in prose immediately
after the float. Add "Table~\ref{tab:probing} reports…". (`eq:classify` is likewise unreferenced —
harmless.)

### 3.9 Compute-chunk size is stated three ways

| Location | Claim |
|---|---|
| §5.1, line 639 | Classic "score is calculated in groups of 20 SNPs, just below the largest successful local group of 21" |
| Table 3 caption, line 873 | "upload groups of 32, calculation groups of **10**, and 25 transactions" |
| Table 7 caption, line 970 | "Both methods used calculation chunks of **20** SNPs" |

`evidence/phase7/live_2026-07-31/public_success.json` gives `uploadChunkSize: 32`,
`computeChunkSize: 10` — so Table 3 is right and §5.1 generalises a value that the reported
Sepolia run did not use. Given Reviewer 1's comment 1, state plainly that the Sepolia run and its
local parity run used groups of 10, and the gas-curve runs used 20, with the reason.

### 3.10 Latency section conflicts with Table 3 and omits the method

§9.6 (lines 1019–1024): local times 157 / 780 / 1,672 / 8,819 ms. Table 3 (line 883) gives the
local 100-SNP time as 147 ms. Different runs and different methods (the series is Streaming per
`evidence/phase8`; Table 3 is Classic), but §9.6 never says so, so the two numbers read as a
contradiction. Label the method in both places.

### 3.11 The journal manuscript is not buildable from the repo

`manuscript/source/bioeth_prs.tex` includes `figures/*.pdf`, including
`fig_scoring_workflow.pdf` and `fig_individual_agreement.pdf`. Neither file — nor any
`manuscript/**/figures/` directory — exists on the branch, and `.gitignore` does not explain the
absence. The version presumably going to the magazine cannot be compiled or reproduced by a
co-author or a data-availability check.

### 3.12 The response to reviewers describes a different manuscript

The response states (Reviewer 2, comment 7): "The manuscript summarizes these comparisons in the
agreement table rather than a separate figure" and "**avoids a separate individual-agreement
figure**". `manuscript/source/bioeth_prs.tex` contains exactly that figure
(`fig:individual_agreement`, with a 200-point scatter). The response was written against the
arXiv package, where the builder deletes the figure.

Whichever version the editor receives, the response must describe it. Same risk class for the
scoring-workflow figure (figure in the journal version, prose in the arXiv version).

### 3.13 The reviewer response ships inside the arXiv package

`MANIFEST.txt` and the builder both place `bioETH-PRS_RTR_response.pdf` in
`final_arxiv_upload/`. Uploading that directory publishes the point-by-point response as an arXiv
ancillary file. Almost certainly unintended; remove it from the upload set (keep it in
`reviewer/`).

## 4. Numbers and claims — verified clean

Do not re-audit these; they check out.

**Sepolia (evidence/phase7/live_2026-07-31).** 4 deployment tx / 5,892,559 gas /
0.0062781714 ETH; 25 calculation tx / 20,710,271 gas / 0.0252747648 ETH; 269,320 ms to result;
8,081 ms decryption; encoded score 758,685 = independent value. Local Classic parity run
18,755,864 gas; 20,710,271 / 18,755,864 = 1.1042 → the stated +10.42%.

**Gas curve (Table 7).** All four reductions recompute exactly to 35.4 / 36.8 / 37.1 / 37.2%.

**Transaction counts (Table 5).** 15 / 47 / 88 / 413 public Streaming and 17 private reconcile
with `evidence/phase8/measured_transaction_use.md` (model publication 6 tx + registration 1 +
job creation 1 + 6 streaming chunks + 1 release = 15 at 100 SNPs).

**Fee examples.** 5,892,613 / 11,690,021 / 23,507,880 gas × 1 and 30 gwei reproduce all six
quoted ETH values to the last digit. Private/public ratio 2.0109 → the stated 2.01×. Note the two
deployment figures differ by design (Sepolia 5,892,559 vs local 5,892,613) and are labelled — but
they are close enough to read as a typo; consider a half-sentence saying so.

**Per-SNP (Table 8).** 50+27+27+25+25+12 = 166k Classic; 50+27+27 = 104k Streaming; matches the
95,000–104,000 floor in the text.

**Latency arithmetic.** 157/101, 780/501, 1,672/1,001, 8,819/5,001 → 1.554–1.763 ms per position;
1.7635/1.554 = 1.135 → the stated ~13%.

**Randomization.** B = 128 → exact mean 63.5 vs integer correction 64; 48 + 2 = 50 individuals;
260 queries at 3 per 1,000 blocks → 288.9 h at 12 s and 48.1 h at 2 s.

**Repeated-query table.** Rows match `evidence/phase6/anti_probing_results.json` framing and the
response text (20/20 at 20 raw-score queries; 19/20 at 200; 20/20 first at 260; 0/20 at 320 for
the three constrained settings; r = 0.6689 / 0.9388 / 0.0223).

**Contract-level claims match the code on this branch.**

| Manuscript claim | Code |
|---|---|
| "oracle deployer fixes B in the oracle constructor" | `ResultOracle.sol:36,48` — `immutable`, power-of-two required |
| noise from the chain, requester cannot choose it | `ResultOracle.sol:136` — `FHE.randEuint64(noiseUpperBound)` |
| thresholds ≥ B apart | enforced twice: `ResultOracle.sol:129` and `ModelMarketplace.setReleasePolicy` |
| "release policy cannot be changed after model finalization" | `setReleasePolicy` calls `_requireOwnedDraftModel`; no update path |
| "the owner can update or disable the query-rate limits" | `setRateLimit` is callable post-finalization by design |
| `readPartial` exists, blocked for oracle-required models | `PRSComputeEngine.sol:366` |
| registry access checked at job creation | `PRSComputeEngine.sol:112`; model reader re-checked per chunk |

**Bibliography.** 20 cite keys ↔ 20 `.bib` entries ↔ 20 `.bbl` entries; no unresolved or unused
keys; all `\ref` targets resolve. Author lists were corrected in the revision (e.g. Wray 2021:
"Ting Lin"/"Judy Austin" → "Lin, Tian"/"Austin, Jeremy"). One small regression: the Inouye 2018
title lost its subtitle ("Implications for Primary Prevention") and the author list was collapsed
to `and others`.

**Claims correctly withdrawn.** "trustless" / "zero trust" / "trust anchor", "the blockchain is
the trust anchor", "post-quantum security" as a property, "DP-inspired noisy output", "machine
epsilon", "5,000 (scalable)", "economically plausible", USD projections ($1.72–$46,840), "first
application of fhEVM to clinical genomics", and the 2,800-hour bits-per-query extraction estimate
are all gone from the text. Reviewer coverage is complete: all 8 + 7 comments map to identifiable
changes.

## 5. Academic voice — where it reads machine-revised

### 5.1 One hedge, seven times

"…but the system still depends on the blockchain and fhEVM services" (or a near-identical
variant) appears at lines 84, 101–102, 125, 180, 379, 1145, 1164 and 1255 — graphical abstract,
abstract, Key Points, Introduction, §3.2, Discussion opening, §11.1, Conclusion.

Reviewer 1 asked for the dependency to be stated, not restated in every section. A human reviser
states it once in the threat model, once in the limitations, and once in the abstract, then relies
on the reader.

Recommendation: keep lines 101–102 (abstract), 697–698 + Table 2 (§6, where it is load-bearing),
and 1255 (conclusion). Delete the other five.

### 5.2 ~30 paragraphs end with a same-shaped disclaimer

Lines 231, 512, 586, 697, 737, 833, 836–837, 862, 896, 953, 992, 1072, 1080, 1097, 1107, 1149,
1195, 1201, 1272 and more all close on the pattern *"X is A, not B"* or *"this does not
establish Y"*:

- "It is an arithmetic safety check, not evidence that the system can process models larger than…"
- "…this percentage is not a general conversion between local and network results."
- "The 320-query rows use a common comparison budget rather than a protocol security threshold."
- "These are calculated examples, not measured network times."
- "…this is not a claim about scaling on Sepolia."
- "…is not a universal production default."
- "This is not a reliable safeguard because…"

Each sentence is individually correct and each was earned by a reviewer comment. Cumulatively, the
uniform syntax is the single clearest tell that the caveats were applied by pass rather than
written by an author. It also flattens emphasis: when everything is qualified, the two caveats
that matter most (SNP provenance, no formal DP) stop standing out.

Recommendation: keep the disclaimer inline where it changes how a number may be used (Table 3
caption, the fee paragraph, the correlated-block result). Move the rest into §11.2 Limitations,
which already exists and is the conventional home for them. Target roughly a third of the current
count.

### 5.3 "Calculation" replaced the domain vocabulary

| Term | Pre-revision | Revision |
|---|---:|---:|
| calculation / calculate | 0 | 113 |
| computation / compute | 72 | 19 |

Downstream effects: "the **calculation** contract", "§5 **Calculation methods**", "§9.1 Where
**calculations** were evaluated", "§7.2 Order of the **calculation**", "§7 Who may use the data
and **calculation** order", "§9.7 Calculation checks and responsibilities". "Encrypted dot
product" and "inner product" survive only in §2.1.

Nothing in either review asks for this. "Computation" is the standard term in every cited work,
including HEPRS. Recommendation: restore "computation" for the process and the contract, keep
"calculation" for arithmetic instances ("an independent calculation of Equation 1"). Restore
"encrypted dot product" where the operation is meant.

### 5.4 De-jargoning overshot the request

Reviewer 1 asked for cautious claims; Reviewer 2 asked for a followable path from genotype to
score. Neither asked for standard terminology to be removed. Casualties:

- "Threat Model" → "Attacker considered" (§6.1)
- "Overflow Safety" → "Checking the integer range" (§4.4)
- Table 8 rows: "ACL SSTORE" → "Store who may use it (classic only)"; "SLOAD, misc. overhead" →
  "Read stored data and other overhead"
- §7 heading: "Who may use the data and calculation order" — two unrelated topics joined by "and"

The Table 8 rewrite is a net loss of precision: "Store who may use it" does not identify the
operation, and the figure beside it still says `SSTORE count per SNP: 2 (handle + ACL entry)`.

Recommendation: restore the technical term and gloss it once — "an access-control-list (ACL)
record naming who may decrypt each handle" — then use the term.

### 5.5 Content deleted without a reviewer request

Removed between versions: Algorithms 1 and 2 (both protocols in pseudocode), Invariants 1–5, the
whole §"Access Control and Compute Flows" ACL grant-type taxonomy (persistent contract / persistent
user / transient / public), the HCU operation-count derivation (`3r_c + 2` ops, 62 at r=20), and
the concrete overflow ceiling (N ≤ 4.61 × 10¹²).

Consequence: §5.2 now asserts the streaming saving is "explained by" avoiding two permanent
records, but the mechanism that made that quantitative — two ~25,000-gas SSTOREs per SNP, one for
the handle and one for the ACL entry — was deleted, while the figure still shows it. Reviewer 2's
comments 5 and 6 (comprehensibility, independent validation) argue for keeping the pseudocode,
not dropping it.

Recommendation: restore Algorithms 1–2 and the ACL grant-type list as an appendix if space is
tight. Restore one sentence with the HCU op count, since §2.4 and §9.1 both cite the 21-SNP
ceiling without saying what limits it.

### 5.6 Copy-editing artifacts from partial rewriting

| Issue | Evidence |
|---|---|
| Mixed heading case | "Related Work", "Worked Example", "Polygenic Risk Scores", "Fully Homomorphic Encryption" (legacy title case) vs "System design", "Where calculations were evaluated", "Variant scale" (new sentence case) |
| Duplicate heading | "Comparison with HEPRS" is both §3.2 and §11.1 |
| Mixed sentence spacing | 223 double-space vs 58 single-space after a period (pre-revision: 170 / 25) — new prose was typed with single spaces |
| Mixed units for one measurement | abstract and §9.1: "269,320 ms … 8,081 ms"; Table 1: "269.320 s … 8.081 s"; abstract also "20.710271 million gas" |
| Misplaced paragraph | lines 507–513 put a system-flow paragraph at the end of §4.3 *Worked Example*, interrupting the arithmetic; it exists only because the builder converts the dropped workflow figure into prose. Move to §2.2 or the head of §5 |
| Weak abstract appositive | line 98: "HEPRS, the homomorphic-encryption system used for comparison in this study, requires a designated evaluator." Suggest: "Prior homomorphic-encryption approaches, including HEPRS, rely on a designated evaluator." |
| Keyword downgrade | "Privacy-Preserving Output Release" → "Risk Categories"; prefer "Randomized Output Release" |
| Latent LaTeX bug | preamble line 30 uses `\itbfseries`, not a command; harmless only because no `\subsubsection` is used |
| Squeezed figures | `fig_protocol` and `fig_security` are landscape graphics at `\columnwidth`; in-figure text is illegible in print (PDF p. 7). Promote to `figure*` as Tables 1/2/4/6 already are |

### 5.7 The response document

Structurally strong: every response names the manuscript sections and gives an explicit
"Previous wording:" / "Revised wording:" pair (17 of each). Keep that.

Formulaic elements to vary: "We thank the reviewer…" opens 18 of 19 responses (7 as the identical
"We thank the reviewer and agree"), and every response starts with a definitional paragraph
because the preamble announces the template ("Where a specialized term first matters, we begin
with a short plain-language explanation before giving the technical details"). Delete that
sentence — the practice is better left unannounced — and vary the openings.

## 6. Recommended order of work

1. §3.12, §3.11, §3.13 — decide which manuscript is the submission, put its figures under version
   control, align the response document to it, drop the response PDF from the upload set.
2. §3.1–§3.6 — regenerate the six figures from `manuscript/source` instead of patching legacy
   PNGs. One decision closes six findings, including the retracted "machine-epsilon" claim and
   the Table 7 contradiction.
3. §3.7–§3.10 — indicator glyph, Table 6 reference, chunk-size statement, latency method labels.
4. §5.1–§5.3 — delete five of seven repeated hedges; move roughly two thirds of the trailing
   disclaimers into Limitations; restore "computation".
5. §5.4–§5.6 — restore the technical terms with one-line glosses, restore the pseudocode and ACL
   taxonomy (appendix is fine), then one copy-editing pass for heading case, units, spacing, the
   duplicate heading, and the misplaced §4.3 paragraph.

None of the above changes a measured value. Item 2 is the only one that changes what a reader
sees on page 1.
