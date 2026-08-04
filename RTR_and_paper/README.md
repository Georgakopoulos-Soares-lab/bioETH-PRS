# Response to reviewers and paper

This directory contains the complete writing and delivery workflow for the bioETH-PRS
revision. Computational evidence remains in `../evidence/`, while manuscript sources,
reviewer materials, paper-specific scripts, and rendered deliverables are kept here.

## Directory layout

- `manuscript/source/` - post-RTR LaTeX source, bibliography, and arXiv `.bbl` file.
- `original_arxiv_upload/` - the earlier manuscript and original PNG figure artwork used
  for the deliberately minimal final figure edits.
- `reviewer/` - the original reviewer document and the generated point-by-point response.
- `plans/` - the acceptance plan, claim summaries, response map, and final parity audit.
- `scripts/` - paper packaging, RTR generation, and archived figure-generation tools.
- `final_arxiv_upload/` - the submission-ready source package and rendered manuscript/RTR
  PDFs.

## Rebuild

See [REBUILD.md](REBUILD.md) for the full sequence, prerequisites, and the open figure decision.
Short version, from the repository root:

```bash
python3 RTR_and_paper/scripts/build_rtr_response.py
python3 RTR_and_paper/scripts/build_final_arxiv_upload.py
```

The RTR DOCX must be rendered and visually checked before its PDF is copied into
`final_arxiv_upload/`. Compile `final_arxiv_upload/bioeth_prs.tex` with XeLaTeX and retain
the provided `.bbl` for the arXiv source package.

LaTeX intermediates, previews, temporary renders, obsolete generated figure drafts, and
the superseded intermediate arXiv package are ignored. The six figures in the final
package are the original PNG artwork, with only the wording corrections documented in
`plans/final_arxiv_parity_audit.md`.
