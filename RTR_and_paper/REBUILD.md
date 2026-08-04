# Rebuild guide — bioETH-PRS revision

For whoever regenerates the deliverables after the wording pass on branch `rtr-revision`.

The wording edits are already committed in `manuscript/source/bioeth_prs.tex`, and
`final_arxiv_upload/bioeth_prs.tex` has been regenerated from it. **The two PDFs in
`final_arxiv_upload/` and the response DOCX are older than those sources**, so they must be
rebuilt before anything is submitted. Findings and their status are in
[`reports/revision_review.md`](reports/revision_review.md).

All commands run from the repository root.

## 1. Prerequisites

None of the three Python packages is installed on the machine this was prepared on:

```sh
python3 -m pip install matplotlib pillow python-docx
```

Also needed:

- **XeLaTeX** (MacTeX or TeX Live) — no LaTeX is installed here, so nothing was compiled.
- **Word or LibreOffice** to export the response DOCX to PDF.
- Node 26 and the repo's dev dependencies for the test suite: `npm ci`.

`build_final_arxiv_upload.py` writes text into the legacy PNGs at fixed pixel coordinates using
`/System/Library/Fonts/Supplemental/Arial.ttf`, so that step is macOS-only as written.

## 2. Decision before you build: which figures ship

This is the one open call. Everything else below is mechanical.

**Option A — legacy PNG artwork (what the package does today).**
`build_final_arxiv_upload.py` starts from `original_arxiv_upload/figures/*.png`, patches four of
them at pixel level, and keeps `fig_quantization.png` and `fig_gas_scaling.png` byte-for-byte.
This honours the earlier "keep the original artwork" instruction recorded in
`plans/final_arxiv_parity_audit.md`, and leaves these open:

- the graphical abstract still shows the badges `37% Gas Reduction (Streaming Path)` and
  `Machine-epsilon Accuracy` — the second is a claim the revision retracted;
- its banner still reads "Consensus-enforced", which the body text contradicts;
- `fig_gas_scaling.png` plots 35.5% / 828.4 M / 519.9 M against Table 7's 35.4% / 829.422 M /
  520.487 M;
- `fig_quantization.png` prints `z_w = −min(q_i)` against Eq. 3's `z_w = max(0, −min q_i)`, and
  renders `partialSum` as `∂Sum`;
- the figures still say ACL, SSTORE, FSM, "invariant", "Quantised", and name contract functions
  the text no longer mentions.

**Option B — regenerated vector figures (recommended).**
`scripts/generate_arxiv_figures.py` already produces the corrected post-RTR set. It has no
"machine-epsilon" badge and no "Consensus-enforced" banner, it prints
`z_w = max(0, −min_i q_i)`, and it recomputes the gas plot and its percentages live from
`evidence/phase8/heprs_profile.json`, so the figure and Table 7 cannot disagree. Choosing this
closes five of the blocking findings with a script run instead of pixel edits.

Cost: the artwork changes visually, so someone must re-approve the look, and
`build_final_arxiv_upload.py` needs its figure step swapped from "patch legacy PNGs" to "copy the
generated PDFs" (roughly: drop the four `edit_*` calls and the two byte-for-byte copies, and copy
`manuscript/source/figures/*.pdf` instead of rewriting `figures/<name>.pdf` to `.png` in
`final_tex()`).

Also note the graphical abstract, protocol and security panels are landscape images placed at
`\columnwidth`; their internal text is hard to read in print. If you rebuild them, consider
promoting the protocol and security floats to `figure*`. That shifts pagination, so check the
page count afterwards.

## 3. Generate the manuscript figures

Required either way: `manuscript/source/bioeth_prs.tex` includes eight `figures/*.pdf` files, and
none of them is in version control. `fig_scoring_workflow.pdf` and
`fig_individual_agreement.pdf` exist nowhere in the repo, so the journal version currently cannot
be compiled by anyone else.

```sh
python3 RTR_and_paper/scripts/generate_arxiv_figures.py \
  --output-dir RTR_and_paper/manuscript/source/figures
```

Writes: `graphical_abstract.pdf`, `fig_architecture.pdf`, `fig_quantization.pdf`,
`fig_scoring_workflow.pdf`, `fig_protocol.pdf`, `fig_security.pdf`,
`fig_individual_agreement.pdf`, `fig_gas_scaling.pdf`. Inputs are
`evidence/phase5/individual_level_comparison.csv` and `evidence/phase8/heprs_profile.json`.

Without `--output-dir` it writes to `RTR_and_paper/archive/...`, which is gitignored.

Then commit the figures, so the journal source is reproducible:

```sh
git add RTR_and_paper/manuscript/source/figures
git commit -m "build: version the manuscript figure set"
```

## 4. Compile the journal manuscript

`bioeth_prs.bbl` is committed, so BibTeX is not needed unless `bioeth_prs.bib` changed.

```sh
cd RTR_and_paper/manuscript/source
xelatex bioeth_prs.tex
xelatex bioeth_prs.tex          # second pass resolves refs and page numbers
```

If you edited the bibliography: `xelatex` → `bibtex bioeth_prs` → `xelatex` → `xelatex`, then copy
the refreshed `bioeth_prs.bbl` next to the source.

Expect a clean log. Specifically confirm:

- no `LaTeX Warning: There were undefined references` and no `Citation ... undefined`
  (checked statically already: 20 citations, 20 `.bbl` entries, every `\ref` resolves, every table
  and figure is cited);
- line numbers appear — this version loads `lineno` on purpose for the reviewers;
- the indicator in Eq. 9 renders as a bold **1** (it was `\mathbb{1}`, which has no digit glyph in
  `amssymb` and printed a wrong symbol);
- the page count and that no table or figure overflows its column.

## 5. Rebuild the response to reviewers

```sh
python3 RTR_and_paper/scripts/build_rtr_response.py
```

Writes `RTR_and_paper/reviewer/bioETH-PRS_RTR_response.docx`.

This must be rerun: the response previously said the manuscript "avoids a separate
individual-agreement figure", which is wrong for the journal version — it contains that figure.
That sentence is fixed in the script.

Then open the DOCX, check it visually, and export it to
`RTR_and_paper/reviewer/bioETH-PRS_RTR_response.pdf`. The arXiv builder picks that PDF up
automatically if it is present.

While you are in there, two things worth varying by hand, both flagged in
`reports/revision_review.md` §5.7: 18 of 19 responses open with "We thank the reviewer" (7 with the
identical "We thank the reviewer and agree"), and the preamble announces its own template
("Where a specialized term first matters, we begin with a short plain-language explanation") —
better deleted, since the practice speaks for itself.

## 6. Rebuild the arXiv source package

```sh
python3 RTR_and_paper/scripts/build_final_arxiv_upload.py
```

Regenerates `final_arxiv_upload/`: `bioeth_prs.tex` (derived from the journal source), `.bib`,
`.bbl`, the figures, `README.md` and `MANIFEST.txt`.

The script hard-fails if the blocks it rewrites are missing:

```
RuntimeError: workflow figure block not found in manuscript
RuntimeError: individual-agreement figure block not found in manuscript
```

That means the manuscript wording drifted from the strings in `final_tex()`. Fix the script to
match the manuscript — never the reverse — and rerun. The tex in `final_arxiv_upload/` is a build
artifact; edit `manuscript/source/bioeth_prs.tex` and rebuild.

Then compile it, from a copy of the directory so intermediates stay out of the package:

```sh
cd RTR_and_paper/final_arxiv_upload
xelatex bioeth_prs.tex
xelatex bioeth_prs.tex
mv bioeth_prs.pdf bioeth_prs_final_arxiv.pdf
```

Re-run `build_final_arxiv_upload.py` once more afterwards so `MANIFEST.txt` lists the rendered
PDFs.

**Before uploading, drop the response PDF from the package.** `MANIFEST.txt` and the builder both
place `bioETH-PRS_RTR_response.pdf` inside `final_arxiv_upload/`, which would publish the
point-by-point response to reviewers as an arXiv ancillary file. Keep it in `reviewer/`.

## 7. Verify

```sh
npm ci
npm run build
npm run test
```

The audit trail records 188 passing Hardhat tests; nothing in this pass touched contracts, tests,
or evidence, so the count should be unchanged.

Static checks already done and worth repeating if you edit the tex further:

```sh
# undefined refs / uncited floats / citation closure
python3 - <<'PY'
import re, pathlib
for f in ("RTR_and_paper/manuscript/source/bioeth_prs.tex",
          "RTR_and_paper/final_arxiv_upload/bioeth_prs.tex"):
    t = pathlib.Path(f).read_text()
    labels = set(re.findall(r"\\label\{([^}]*)\}", t))
    refs = set(re.findall(r"\\ref\{([^}]*)\}", t))
    cites = {c.strip() for m in re.findall(r"\\cite[a-z]*\{([^}]*)\}", t) for c in m.split(",")}
    bbl = set(re.findall(r"\\bibitem\[[^]]*\]\{([^}]*)\}",
                         (pathlib.Path(f).parent / "bioeth_prs.bbl").read_text(), re.S))
    print(pathlib.Path(f).parent.name,
          "dangling refs", sorted(refs - labels),
          "| uncited floats", sorted(l for l in labels - refs if l.split(":")[0] in ("tab", "fig")),
          "| cites not in bbl", sorted(cites - bbl))
PY
```

## 8. What still needs a human decision

1. Option A or Option B in §2 — the only change that alters what a reader sees on page 1.
2. Whether to restore Algorithms 1–2 and the ACL grant-type list, dropped in the revision without
   a reviewer asking. Reviewer 2's comments 5 and 6 (comprehensibility, independent validation)
   argue for keeping them; an appendix is enough.
3. Which version goes to the magazine. The response document must describe that version, and its
   figures must be in version control.

## Quick reference

```sh
python3 -m pip install matplotlib pillow python-docx                    # once
python3 RTR_and_paper/scripts/generate_arxiv_figures.py \
  --output-dir RTR_and_paper/manuscript/source/figures                  # figures
python3 RTR_and_paper/scripts/build_rtr_response.py                     # response DOCX
python3 RTR_and_paper/scripts/build_final_arxiv_upload.py               # arXiv sources
# xelatex twice in manuscript/source and again in final_arxiv_upload
npm run test                                                           # 188 tests
```
