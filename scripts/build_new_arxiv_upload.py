#!/usr/bin/env python3
"""Build a clean arXiv source package from the current manuscript."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "bioeth_prs (4).tex"
BIBLIOGRAPHY = ROOT / "bioeth_prs.bib"
COMPILED_BBL = ROOT / "output" / "pdf" / "bioeth_prs (4).bbl"
SOURCE_FIGURES = ROOT / "figures"
DEFAULT_OUTPUT = ROOT / "new arxiv upload"

def build(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    figure_dir = output / "figures"
    figure_dir.mkdir(parents=True, exist_ok=True)

    text = SOURCE.read_text(encoding="utf-8")

    # The arXiv public preprint is clean; the separately delivered reviewer PDF retains
    # line numbers for the point-by-point page/line references.
    text = text.replace("\\usepackage[switch]{lineno}\n", "")
    text = text.replace("\\linenumbers\n", "")
    (output / "bioeth_prs.tex").write_text(text, encoding="utf-8")
    shutil.copy2(BIBLIOGRAPHY, output / "bioeth_prs.bib")
    if COMPILED_BBL.is_file():
        shutil.copy2(COMPILED_BBL, output / "bioeth_prs.bbl")
    for source_figure in sorted(SOURCE_FIGURES.glob("*.pdf")):
        shutil.copy2(source_figure, figure_dir / source_figure.name)

    readme = """# bioETH-PRS arXiv source

Main source: `bioeth_prs.tex` (with `bioeth_prs.bbl` included for arXiv's TeX run)

This folder contains the manuscript source, bibliography, and vector figures for the
bioETH-PRS preprint.

## Figures

The figures use the same terms as the manuscript: Sepolia for the public-network result
and local simulation for calculations performed in the local contract environment.
The bioETH-PRS results shown in the figures contain no more than 5,000 variants.

All eight assets are vector PDFs with embedded text.

The public 100-SNP calculation is the only calculation reported from Sepolia. The
private-weight calculation was evaluated only in the local simulation.
"""
    (output / "README.md").write_text(readme, encoding="utf-8")

    manifest = ["README.md", "bioeth_prs.tex", "bioeth_prs.bib"]
    if (output / "bioeth_prs.bbl").is_file():
        manifest.append("bioeth_prs.bbl")
    manifest.extend(f"figures/{name}" for name in sorted(p.name for p in figure_dir.glob("*.pdf")))
    (output / "MANIFEST.txt").write_text("\n".join(manifest) + "\n", encoding="utf-8")
    print(f"wrote arXiv package sources to {output.relative_to(ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    build(args.output_dir.resolve())


if __name__ == "__main__":
    main()
