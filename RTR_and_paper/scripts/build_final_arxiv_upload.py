#!/usr/bin/env python3
"""Build the final arXiv package while preserving the original figure artwork."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


PAPER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PAPER_ROOT.parent
SOURCE = PAPER_ROOT / "manuscript" / "source" / "bioeth_prs.tex"
BIBLIOGRAPHY = PAPER_ROOT / "manuscript" / "source" / "bioeth_prs.bib"
COMPILED_BBL = PAPER_ROOT / "manuscript" / "source" / "bioeth_prs.bbl"
LEGACY_FIGURES = PAPER_ROOT / "original_arxiv_upload" / "figures"
DEFAULT_OUTPUT = PAPER_ROOT / "final_arxiv_upload"

ARIAL = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
ARIAL_BOLD = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")

BLACK = (0, 0, 0)
TEAL = (0, 82, 96)
GREEN = (58, 126, 49)
ORANGE_PALE = (253, 231, 207)
WHITE = (255, 255, 255)


def font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(ARIAL_BOLD if bold else ARIAL), size=size)


def centered_text(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    text: str,
    *,
    size: int,
    fill: tuple[int, int, int] = BLACK,
    bold: bool = False,
    spacing: int = 4,
) -> None:
    x0, y0, x1, y1 = box
    draw.multiline_text(
        ((x0 + x1) / 2, (y0 + y1) / 2),
        text,
        font=font(size, bold=bold),
        fill=fill,
        anchor="mm",
        align="center",
        spacing=spacing,
    )


def edit_graphical_abstract(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGB")
    draw = ImageDraw.Draw(image)

    # Preserve the artwork and replace only the trust/dependency wording revised after review.
    draw.rectangle((0, 10, 1408, 77), fill=WHITE)
    centered_text(
        draw,
        (20, 10, 1388, 77),
        "Consensus-enforced Confidential Polygenic Risk Scoring via FHE on Blockchain",
        size=31,
        bold=True,
    )
    draw.rectangle((710, 534, 1408, 602), fill=WHITE)
    centered_text(
        draw,
        (720, 534, 1398, 602),
        "No designated evaluator.\nfhEVM and blockchain dependencies remain.",
        size=23,
        fill=TEAL,
        spacing=2,
    )
    # The revised manuscript treats lattice security as an assumption rather than a tested
    # claim. Restore the original card's light-gray interior rather than leaving a white patch.
    draw.rectangle((1000, 648, 1365, 724), fill=(244, 244, 244))
    centered_text(
        draw,
        (1005, 649, 1361, 724),
        "TFHE/Lattice Security\nAssumption",
        size=30,
        bold=False,
    )
    image.save(destination, format="PNG", optimize=True)


def edit_architecture(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGB")
    draw = ImageDraw.Draw(image)

    # Reuse the original Result Oracle box, correcting only its output/privacy description.
    draw.rectangle((382, 635, 1024, 752), fill=ORANGE_PALE)
    centered_text(draw, (390, 636, 1016, 681), "Result Oracle", size=34, bold=False)
    centered_text(
        draw,
        (397, 680, 1009, 749),
        "Randomized risk category (not differential privacy),\n"
        "or requester-only raw score under the model release rule",
        size=23,
        bold=False,
        spacing=3,
    )
    image.save(destination, format="PNG", optimize=True)


def edit_protocol(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGB")
    draw = ImageDraw.Draw(image)

    # Streaming consumes each encrypted group in one transaction; it does not use EIP-1153/TSTORE.
    draw.rectangle((1043, 354, 1317, 420), fill=WHITE)
    centered_text(
        draw,
        (1047, 356, 1313, 383),
        "NO PERSISTENT STORAGE",
        size=18,
        fill=GREEN,
        bold=True,
    )
    centered_text(
        draw,
        (1047, 384, 1313, 417),
        "encrypted inputs used once",
        size=17,
        bold=False,
    )
    image.save(destination, format="PNG", optimize=True)


def edit_security(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGB")
    draw = ImageDraw.Draw(image)

    # Keep the original threat-model artwork and correct the two release/privacy claims.
    draw.rectangle((1127, 389, 1408, 478), fill=WHITE)
    draw.text(
        (1138, 400),
        "Raw score or category",
        font=font(25),
        fill=BLACK,
        anchor="lm",
    )
    draw.multiline_text(
        (1138, 447),
        "Randomized category\n(not differential privacy)",
        font=font(25),
        fill=BLACK,
        anchor="lm",
        align="left",
        spacing=0,
    )
    image.save(destination, format="PNG", optimize=True)


def final_tex() -> str:
    text = SOURCE.read_text(encoding="utf-8")
    text = text.replace("\\usepackage[switch]{lineno}\n", "")
    text = text.replace("\\linenumbers\n", "")

    for name in (
        "graphical_abstract",
        "fig_architecture",
        "fig_quantization",
        "fig_protocol",
        "fig_security",
        "fig_gas_scaling",
    ):
        text = text.replace(f"figures/{name}.pdf", f"figures/{name}.png")

    # Keep the legacy graphical abstract intact while scaling it slightly so the
    # complete abstract stays on page 1 instead of leaving a three-line spill page.
    text = text.replace(
        r"\includegraphics[width=\textwidth,keepaspectratio]{figures/graphical_abstract.png}",
        r"\includegraphics[width=0.70\textwidth,keepaspectratio]{figures/graphical_abstract.png}",
        1,
    )
    text = text.replace(
        "\\thispagestyle{fancy}\n",
        "\\thispagestyle{fancy}\n\\vspace{-0.8em}\n",
        1,
    )
    text = text.replace(
        "\\end{center}\n\n%% ============================================================\n\\begin{abstract}",
        "\\end{center}\n\\vspace{-0.8em}\n\n%% ============================================================\n\\begin{abstract}",
        1,
    )

    workflow_block = r"""Figure~\ref{fig:scoring_workflow} summarizes the order of these steps for one scored
individual.

\begin{figure}[t]
\centering
\includegraphics[width=\columnwidth,keepaspectratio]{figures/fig_scoring_workflow.pdf}
\caption{Six steps in the PRS computation. Public identifiers and allele labels support
local QC and effect-allele orientation before dosage values and, for private weights,
weight magnitudes are encrypted. The contracts record who receives the result,
but they do not prove that the encrypted values came from the registered sample.}
\label{fig:scoring_workflow}
\end{figure}
"""
    workflow_text = r"""At the system level, the data preparer first checks variant identifiers, genome build,
dosage validity, missing values, and effect-allele orientation. Only then are dosage values
and, for private models, weight magnitudes encrypted. The requester selects an authorized
sample and model, submits the encrypted groups for computation, and receives either the
model-configured raw score or randomized category. The contracts record permissions and the
result recipient, but they do not establish that the encrypted values came from the stated
biological sample.
"""
    if workflow_block not in text:
        raise RuntimeError("workflow figure block not found in manuscript")
    text = text.replace(workflow_block, workflow_text, 1)

    agreement_block = r"""\begin{figure}[t]
  \centering
  \includegraphics[width=\columnwidth, keepaspectratio]{figures/fig_individual_agreement.pdf}
  \caption{Equation~\ref{eq:prs} PRS versus decoded public-weight bioETH-PRS for all 200
  individual--model pairs in the local simulation. Every point lies on the line of
  exact agreement; overplotting is reduced by model-specific markers.}
  \label{fig:individual_agreement}
\end{figure}

"""
    if agreement_block not in text:
        raise RuntimeError("individual-agreement figure block not found in manuscript")
    text = text.replace(agreement_block, "", 1)
    text = text.replace(
        "The independent comparison in Figure~\\ref{fig:individual_agreement} shows agreement",
        "The independent comparison summarized in Table~\\ref{tab:quantization} shows agreement",
        1,
    )

    old_quantization_caption = r"""\caption{Three-step conversion of signed weights to nonnegative integers.
  Half-away-from-zero rounding and $z_w=\max(0,-\min_i q_i)$ are shown explicitly.
  The worked example is converted back to the original additive PRS.}"""
    new_quantization_caption = r"""\caption{Three-stage overview of the fixed-point conversion, ending with the worked
  example converted back to the additive PRS. Equations~\ref{eq:wshift}--\ref{eq:encode}
  are the implementation definition and give the half-away-from-zero rule, the unsigned
  clamp $z_w=\max(0,-\min_i q_i)$, and the intermediate-value order.}"""
    text = text.replace(old_quantization_caption, new_quantization_caption, 1)

    old_gas_caption = r"""\caption{Gas used versus variant count for both calculation methods in the local
  simulation. The Streaming method used 35.4--37.2\% less gas because it did not
  store each encrypted SNP handle permanently.}"""
    new_gas_caption = r"""\caption{Gas used versus variant count for the two local computation methods.
  The plotted values come from an earlier run of the same measurement and differ from
  Table~\ref{tab:gas} in the third significant figure; Table~\ref{tab:gas} reports the
  totals used throughout the text.}"""
    text = text.replace(old_gas_caption, new_gas_caption, 1)
    return text


def build(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    figure_dir = output / "figures"
    figure_dir.mkdir(parents=True, exist_ok=True)

    (output / "bioeth_prs.tex").write_text(final_tex(), encoding="utf-8")
    shutil.copy2(BIBLIOGRAPHY, output / "bioeth_prs.bib")
    if COMPILED_BBL.is_file():
        shutil.copy2(COMPILED_BBL, output / "bioeth_prs.bbl")

    # Two legacy figures are intentionally retained byte-for-byte.
    for name in ("fig_quantization.png", "fig_gas_scaling.png"):
        shutil.copy2(LEGACY_FIGURES / name, figure_dir / name)

    edit_graphical_abstract(
        LEGACY_FIGURES / "graphical_abstract.png",
        figure_dir / "graphical_abstract.png",
    )
    edit_architecture(
        LEGACY_FIGURES / "fig_architecture.png",
        figure_dir / "fig_architecture.png",
    )
    edit_protocol(
        LEGACY_FIGURES / "fig_protocol.png",
        figure_dir / "fig_protocol.png",
    )
    edit_security(
        LEGACY_FIGURES / "fig_security.png",
        figure_dir / "fig_security.png",
    )

    # Remove obsolete post-review panels if rebuilding an existing output directory.
    for name in ("fig_scoring_workflow.pdf", "fig_individual_agreement.pdf"):
        (figure_dir / name).unlink(missing_ok=True)

    # Include the latest rendered deliverables when they are available. The build workflow
    # invokes this source packager again after compiling both documents.
    rendered_files = (
        PAPER_ROOT / "reviewer" / "bioETH-PRS_RTR_response.pdf",
    )
    for rendered in rendered_files:
        if rendered.is_file():
            shutil.copy2(rendered, output / rendered.name)

    readme = """# bioETH-PRS final arXiv source

Main source: `bioeth_prs.tex` (with `bioeth_prs.bbl` included for arXiv's TeX run).

The package preserves the original six-figure visual set. The quantization and gas-scaling
PNGs are byte-for-byte copies of the original upload. Four other legacy PNGs contain only
minimal post-review wording corrections. The scoring-workflow and individual-agreement
figures are intentionally omitted; the workflow and agreement evidence are described in
the manuscript text and agreement table instead.

The manuscript text is the final reviewer-aligned version. Sepolia measurements are identified
separately from local-simulation measurements, and the private-weight calculation is described
only as a local result. No unverified cause is assigned to the absence of Sepolia Streaming
measurements. The repeated-query terms and comparison settings are defined in the manuscript.

Rendered deliverables, when present: `bioeth_prs_final_arxiv.pdf` and
`bioETH-PRS_RTR_response.pdf`.
"""
    (output / "README.md").write_text(readme, encoding="utf-8")

    assets = sorted(p.name for p in figure_dir.iterdir() if p.is_file())
    manifest = ["README.md", "bioeth_prs.tex", "bioeth_prs.bib"]
    if (output / "bioeth_prs.bbl").is_file():
        manifest.append("bioeth_prs.bbl")
    manifest.extend(f"figures/{name}" for name in assets)
    for name in ("bioeth_prs_final_arxiv.pdf", "bioETH-PRS_RTR_response.pdf"):
        if (output / name).is_file():
            manifest.append(name)
    (output / "MANIFEST.txt").write_text("\n".join(manifest) + "\n", encoding="utf-8")
    print(f"wrote final arXiv package sources to {output.relative_to(REPO_ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    build(args.output_dir.resolve())


if __name__ == "__main__":
    main()
