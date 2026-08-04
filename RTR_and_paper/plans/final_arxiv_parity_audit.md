# Final arXiv parity audit

## Scope

This audit compares:

- the original submission in `RTR_and_paper/original_arxiv_upload/`;
- the post-response manuscript in `RTR_and_paper/manuscript/source/bioeth_prs.tex`; and
- the delivery package in `RTR_and_paper/final_arxiv_upload/`.

The purpose is to preserve the original submission unless a change answers a reviewer request,
matches evidence generated during the response-to-reviewers (RTR) work, or implements the final
figure instructions.

## Final-package change boundary

The final builder starts from the post-RTR manuscript and changes only figure paths, two figure
captions, removal of the workflow/agreement figures, replacement prose/table cross-reference,
and opening-page spacing/graphical-abstract scale. The layout change prevents a two-line abstract
spill page and does not alter any content. The builder does not change a manuscript equation,
table value, result value, transaction count, threshold, contract method, or calculation step.

The workflow and agreement assets are not redrawn or included. Their relevant content remains in
the workflow prose and the independent-agreement text and table.

## RTR-driven manuscript changes relative to the original upload

| Change area | Reason in the reviewer record | Final position |
|---|---|---|
| Sepolia versus local simulation | Reviewer 1, Comment 1 | One public-weight 100-SNP Classic calculation is identified as Sepolia; Streaming scale results and the private-weight result are identified as local. |
| Trust language | Reviewer 1, Comment 2 | A designated evaluator is removed, but the contracts, blockchain, fhEVM computation, and decryption services remain dependencies. |
| Randomized category terminology | Reviewer 1, Comment 3 | The mechanism is called a randomized risk category and is explicitly not described as differential privacy. |
| Repeated-query analysis | Reviewer 1, Comment 4 | Adaptive and fixed queries, multiple wallets/samples, and correlated inputs are reported with their measured limits. |
| Submitted-SNP authenticity | Reviewer 1, Comment 5 | The registry controls permission but does not prove that encrypted values came from the biological sample. |
| Variant scale | Reviewer 1, Comment 6 and Reviewer 2, Comment 1 | The evaluated maximum is 5,000 variants; genome-wide and clinical use are not claimed. |
| HEPRS comparison | Reviewer 1, Comment 7 | Architecture, evaluated size, timing, and deployment dependencies are separated rather than ranked as broadly superior/inferior. |
| Cost wording | Reviewer 1, Comment 8 | Sepolia measurements are separated from calculated fee examples based on local gas. |
| Genotype QC and allele orientation | Reviewer 2, Comments 2 and 3 | Cohort-level checks are distinguished from per-person checks; dosages count the model effect allele. |
| Arithmetic correctness and individual agreement | Reviewer 2, Comments 4--7 | The worked example, independent calculation, responsibilities, and all 200 individual comparisons are reported. |

The final wording deliberately does not attribute the missing Sepolia Streaming measurement to
wallet balance, test-ETH availability, a failed command, or another unverified cause. Those were
intermediate execution notes, not study results. Key Points contain only completed findings and
the main privacy limitation.

The repeated-query section now defines the diagnostic 20-weight model, one query, adaptive and
precommitted selection, provider-fixed thresholds, $B=128$, the `Within B` tolerance, Pearson
correlation, sign accuracy, the common 320-query comparison budget, multiple-wallet/sample tests,
and the synthetic five-SNP correlated-block setting. The definitions do not change any reported
counts or results; they explain their scope and prevent the experimental settings from being read
as protocol constants or biological assumptions.

## Figure provenance and permitted edits

| Displayed figure | Source | Final treatment |
|---|---|---|
| Graphical abstract | Original PNG | Original artwork retained. Trust/dependency wording and the lattice-security label were corrected; the revised lattice label uses the same light-gray card interior as the neighboring boxes. No data graphic was redrawn. |
| Architecture | Original PNG | Original artwork retained. The Result Oracle description now says randomized category, not differential privacy, and allows the model-configured requester-only raw score. |
| Quantization | Original PNG | Byte-for-byte original, as requested. The caption points readers to the manuscript equations for the exact rounding rule and unsigned clamp. |
| Workflow and individual agreement | Existing post-RTR PDFs | Omitted at the user's request. Workflow steps are prose; individual agreement remains in the results text and table. |
| Classic versus Streaming protocol | Original PNG | Original artwork retained. The incorrect TSTORE label was replaced with “no persistent storage; encrypted inputs used once.” |
| Security | Original PNG | Original artwork retained. “No raw score release” and “DP noise injection” were replaced with the model-configured result choices and randomized-category terminology. |
| Gas scaling | Original PNG | Byte-for-byte original, as requested. The caption identifies the post-review table as the source of the final numerical comparison. |

## Deliberate legacy-figure exceptions

Two retained originals do not reproduce every post-RTR detail inside the artwork:

1. The quantization graphic contains the original scale annotation and does not display the
   `max(0, -min(q))` clamp. The manuscript equations remain the implementation definition.
2. The gas graphic contains the original plotted gas values. Table 7 in the final manuscript
   contains the final post-review measurements. Its caption explicitly establishes the table,
   rather than the legacy graphic, as the numerical source.

These exceptions are deliberate responses to the instruction to keep those two original files;
they are not silent changes to the manuscript data or algorithm.

## Parity-restoration pass

A later line-by-line comparison against `original_arxiv_upload/bioeth_prs.tex` found revision
churn that no reviewer comment required. The following original material was restored, without
touching any RTR-driven claim, number, or terminology change:

- Section and subsection headings reverted to the original titles and Title Case style
  (`System Design`, `Architecture Overview`, `The Representation Problem`,
  `Three-Step Unsigned Encoding`, `Overflow Safety`, `Quantization Advisor`,
  `Execution Protocols`, `Threat Model`, `Core Privacy Invariants`, `Empirical Evaluation`,
  `Gas Consumption and Scaling`, `Per-SNP Cost Decomposition`,
  `Access Control and Compute Flows` and its three subsections,
  `HEPRS and bioETH-PRS: Complementary Systems`, `Limitations and Open Problems`,
  `Future Directions`). RTR-mandated new titles keep their wording and were Title-Cased for
  consistency with the original style.
- Algorithms 1 and 2 (classic and streaming pseudocode), with `finalizeAndClassify(jobId)`
  corrected to the model-policy signature required by Reviewer 1, Comment 4.
- The five privacy invariants, with randomized-category terminology in place of the noisy-oracle
  wording.
- Deleted technical content: the FHE-primitive paragraph in Background, the TFHE
  consensus-reproducibility rationale, the chunk-size/HCU derivation, the SSTORE gas
  derivation, the encrypted-select and threshold-gap explanation, the rate-limit window
  mechanism and miner-manipulation note, the streaming transaction-count formula, the
  ACL grant-type taxonomy, the job state machine, the mutual-exclusion guard, the layered
  private-model access control, the per-SNP table's technical operation labels, the automated
  test-suite validation statement (updated to 188 tests), and the five planned extensions in
  future work.
- Original paragraph leads and citation style (`The double-privacy problem.`,
  `The FHE opportunity.`, the four contract names, `SNP count ceiling.`, `SNP provenance.`,
  `Kim and Lauter \citep{...}` and the other author-name forms).

Deliberately not restored, because restoring would reintroduce an error or contradict the RTR:
the EIP-1153/TSTORE claim for streaming SNP storage (the same error corrected in the protocol
figure), the `\approx`60\% cheaper ciphertext-times-plaintext multiply claim, the RLWE
attribution for TFHE, the `4.61 \times 10^{12}` worst-case ceiling example, the `DP bias`
paragraph label, and the L1/L2/app-chain USD cost projections. US `quantization` spelling is
also kept throughout rather than reverting to the original's mixed British spelling.

## Reproducibility checks

- `fig_quantization.png` and `fig_gas_scaling.png` have identical SHA-256 hashes to the files in
  `RTR_and_paper/original_arxiv_upload/figures/`.
- The final manuscript is generated from the post-RTR source; its substantive numerical and
  algorithmic text is not rewritten by the final-package builder.
- The final source is compiled and its figure pages are rendered for visual review before release.
- The RTR response is generated from `RTR_and_paper/scripts/build_rtr_response.py`; numerical statements are
  checked against the final manuscript and the phase 5--8 evidence summaries. Each substantive
  response begins with plain-language context where useful and identifies both the prior wording
  and the revised wording/section locations.
- The rendered manuscript and RTR PDFs are stored with the verified source in
  `RTR_and_paper/final_arxiv_upload/`.
- The final manuscript renders to 16 pages and the RTR to 12 pages. Every page was inspected after
  rendering for clipping, broken tables, figure overflow, and awkward page breaks.
- The complete Hardhat test suite passes (188 tests), including the reader-facing evidence,
  evidence-synthesis, release-policy, lifecycle, finalization, and Sepolia sweep checks.
