#!/usr/bin/env python3
"""Generate the complete revised arXiv figure set as portable vector PDFs."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch


ROOT = Path(__file__).resolve().parents[1]
BLUE = "#1F5A7A"
TEAL = "#168B84"
GREEN = "#4E8A49"
ORANGE = "#C9682A"
PURPLE = "#66558F"
RED = "#A63D40"
INK = "#1D2730"
MUTED = "#5D6872"
PALE_BLUE = "#EAF3F8"
PALE_TEAL = "#E9F6F3"
PALE_GREEN = "#EEF6E9"
PALE_ORANGE = "#FBF0E8"
PALE_PURPLE = "#F1EEF8"
PALE_RED = "#FAECEC"


def canvas(width: float, height: float):
    fig, ax = plt.subplots(figsize=(width, height), constrained_layout=True)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    return fig, ax


def box(ax, x, y, w, h, title, body="", *, face=PALE_BLUE, edge=BLUE,
        title_size=11, body_size=9, radius=0.018, linewidth=1.4):
    patch = FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0.008,rounding_size={radius}",
        facecolor=face,
        edgecolor=edge,
        linewidth=linewidth,
    )
    ax.add_patch(patch)
    if body:
        ax.text(x + w / 2, y + h * 0.69, title, ha="center", va="center",
                fontsize=title_size, fontweight="bold", color=INK)
        ax.text(x + w / 2, y + h * 0.34, body, ha="center", va="center",
                fontsize=body_size, color=INK, linespacing=1.25)
    else:
        ax.text(x + w / 2, y + h / 2, title, ha="center", va="center",
                fontsize=title_size, fontweight="bold", color=INK, linespacing=1.2)
    return patch


def arrow(ax, start, end, *, color=INK, width=1.3, style="-|>", connection="arc3"):
    ax.add_patch(FancyArrowPatch(
        start, end, arrowstyle=style, mutation_scale=12, linewidth=width,
        color=color, connectionstyle=connection, shrinkA=2, shrinkB=2,
    ))


def heading(ax, text, *, subtitle=None):
    ax.text(0.5, 0.965, text, ha="center", va="top", fontsize=15,
            fontweight="bold", color=INK)
    if subtitle:
        ax.text(0.5, 0.91, subtitle, ha="center", va="top", fontsize=9.5, color=MUTED)


def save(fig, output_dir: Path, name: str):
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / name
    fig.savefig(path, format="pdf", bbox_inches="tight",
                metadata={"Creator": "bioETH-PRS figure generator"})
    plt.close(fig)
    print(f"wrote {path.relative_to(ROOT)}")


def graphical_abstract(output_dir: Path):
    fig, ax = canvas(12.5, 5.8)
    heading(ax, "Confidential PRS calculation with fhEVM",
            subtitle="Smart contracts coordinate the calculation; fhEVM services and the blockchain remain trusted dependencies")

    ax.text(0.25, 0.83, "HE system with a designated evaluator", ha="center", va="center",
            fontsize=12.5, fontweight="bold", color=ORANGE)
    box(ax, 0.03, 0.52, 0.14, 0.18, "Encrypted inputs", "genotype +\nmodel", face=PALE_ORANGE, edge=ORANGE)
    box(ax, 0.21, 0.52, 0.17, 0.18, "Evaluator", "performs the encrypted\ncalculation", face=PALE_ORANGE, edge=ORANGE)
    box(ax, 0.42, 0.52, 0.11, 0.18, "Requester", "receives\nscore", face=PALE_ORANGE, edge=ORANGE)
    arrow(ax, (0.17, 0.61), (0.21, 0.61), color=ORANGE)
    arrow(ax, (0.38, 0.61), (0.42, 0.61), color=ORANGE)
    ax.text(0.28, 0.43, "The application relies on this evaluator",
            ha="center", fontsize=9.5, color=ORANGE, fontweight="bold")

    ax.plot([0.56, 0.56], [0.35, 0.86], color="#B8C0C7", linewidth=1.0, linestyle="--")
    ax.text(0.78, 0.83, "bioETH-PRS", ha="center", va="center",
            fontsize=12.5, fontweight="bold", color=TEAL)
    box(ax, 0.59, 0.52, 0.13, 0.18, "Prepared inputs", "QC + effect-allele\nalignment", face=PALE_TEAL, edge=TEAL)
    box(ax, 0.75, 0.52, 0.13, 0.18, "Contracts", "calculation rules +\nprogress", face=PALE_TEAL, edge=TEAL)
    box(ax, 0.89, 0.52, 0.10, 0.18, "Output", "score for\nrequester\nor category", face=PALE_TEAL, edge=TEAL,
        title_size=10, body_size=7.2)
    arrow(ax, (0.72, 0.61), (0.75, 0.61), color=TEAL)
    arrow(ax, (0.88, 0.61), (0.89, 0.61), color=TEAL)
    ax.text(0.795, 0.43, "fhEVM services + blockchain",
            ha="center", fontsize=9.2, color=TEAL, fontweight="bold")

    badges = [
        (0.03, "Sepolia", "Public-weight 100-SNP calculation\n25 transactions; exact score", PALE_BLUE, BLUE),
        (0.35, "Local agreement", "200 of 200 scores matched\nindependent calculations", PALE_PURPLE, PURPLE),
        (0.68, "Local gas comparison", "Streaming used 35.4-37.2% less gas\nfor 100-5,000 variants", PALE_GREEN, GREEN),
    ]
    for x, title, body, face, edge in badges:
        box(ax, x, 0.08, 0.29, 0.21, title, body, face=face, edge=edge,
            title_size=10.5, body_size=8.6)
    save(fig, output_dir, "graphical_abstract.pdf")


def architecture(output_dir: Path):
    fig, ax = canvas(7.0, 6.1)
    heading(ax, "bioETH-PRS system architecture",
            subtitle="Four contracts coordinate the encrypted PRS calculation with fhEVM services")
    box(ax, 0.05, 0.68, 0.38, 0.15, "Sample registry",
        "sample location + who may use it\nrecord of input preparation", face=PALE_BLUE, edge=BLUE,
        body_size=8.4)
    box(ax, 0.57, 0.68, 0.38, 0.15, "Model contract",
        "public or encrypted weights\nfixed output rules", face=PALE_GREEN, edge=GREEN,
        body_size=8.4)
    box(ax, 0.18, 0.43, 0.52, 0.17, "Calculation contract",
        "receive encrypted inputs\ncalculate the weighted sum\nrecord completion",
        face=PALE_PURPLE, edge=PURPLE, body_size=7.8)
    box(ax, 0.29, 0.18, 0.42, 0.14, "Result contract",
        "randomized risk category\nusing thresholds fixed by model provider", face=PALE_ORANGE, edge=ORANGE)
    arrow(ax, (0.24, 0.68), (0.34, 0.60), color=BLUE)
    arrow(ax, (0.76, 0.68), (0.58, 0.60), color=GREEN)
    arrow(ax, (0.44, 0.43), (0.48, 0.32), color=PURPLE)
    box(ax, 0.75, 0.34, 0.22, 0.23, "fhEVM services",
        "encrypted calculation\nsubmit transactions\nmanage encryption keys", face=PALE_TEAL, edge=TEAL, title_size=10)
    arrow(ax, (0.75, 0.50), (0.70, 0.50), color=TEAL, style="<->")
    ax.text(0.5, 0.075,
            "Public weights and model details can be read on the blockchain.\nGenotypes and encrypted model weights are not decrypted during calculation.\nOnly the intended requester can receive the numeric score.",
            ha="center", va="center", fontsize=8.1, color=MUTED,
            bbox=dict(boxstyle="round,pad=0.45", facecolor="#F6F7F8", edgecolor="#AAB2B9"))
    save(fig, output_dir, "fig_architecture.pdf")


def quantization(output_dir: Path):
    fig, ax = canvas(7.1, 6.0)
    heading(ax, "Converting signed decimal weights to nonnegative integers",
            subtitle="Weights are rounded and shifted; decoding restores the score after calculation")
    box(ax, 0.04, 0.57, 0.27, 0.25, "1  Round weights",
        "$q_i = \\mathrm{round}_{HAZ}(s\\beta_i)$\n$\\beta=[-0.30,0.10,0.25]$\n$s=100$; $q=[-30,10,25]$",
        face=PALE_ORANGE, edge=ORANGE, body_size=8.1)
    box(ax, 0.365, 0.57, 0.27, 0.25, "2  Shift weights",
        "$z_w=\\max(0,-\\min_i q_i)$\n$u_i=q_i+z_w\\geq0$\n$z_w=30;\\ u=[0,40,55]$",
        face=PALE_TEAL, edge=TEAL, body_size=8.2)
    box(ax, 0.69, 0.57, 0.27, 0.25, "3  Shift score",
        "$z_s=-\\sum_{q_i<0}2q_i$\n$e=\\sum_i g_i u_i+z_s-z_wG$\n$\\mathrm{PRS}=(e-z_s)/s$",
        face=PALE_GREEN, edge=GREEN, body_size=8.2)
    arrow(ax, (0.31, 0.695), (0.365, 0.695), color=INK)
    arrow(ax, (0.635, 0.695), (0.69, 0.695), color=INK)

    box(ax, 0.12, 0.24, 0.76, 0.20, "Worked example begins with Equation 1",
        "$g=[0,2,1]$; PRS from Equation 1 $=0.45$\nshifted weighted sum $=135$; $G=3$; $z_s=60$\nencoded $e=105$; decoded PRS $=0.45$",
        face=PALE_BLUE, edge=BLUE, title_size=10.5, body_size=8.5)
    ax.text(0.5, 0.11,
            "Safety condition for all values used in the calculation:  $4sMN \\leq 2^{64}-1$",
            ha="center", va="center", fontsize=10.5, color=PURPLE, fontweight="bold")
    save(fig, output_dir, "fig_quantization.pdf")


def scoring_workflow(output_dir: Path):
    fig, ax = canvas(7.0, 6.6)
    heading(ax, "Six steps in PRS calculation",
            subtitle="Variant identifiers are aligned before genotypes and model weights are encrypted")
    stages = [
        ("1", "Check data and metadata", "genome build, variant identity and order,\nmissing values, genotype values", PALE_BLUE, BLUE),
        ("2", "Orient effect-allele dosage", "retain $g$ or apply $2-g$; reject\nunresolved palindromes", PALE_BLUE, BLUE),
        ("3", "Convert weights and encrypt", "convert weights to nonnegative integers;\nencrypt genotype dosages", PALE_TEAL, TEAL),
        ("4", "Submit encrypted genotypes", "only an intended requester can start\nthe calculation for a registered sample", PALE_PURPLE, PURPLE),
        ("5", "Calculate the score", "process variant groups and add\ntheir weighted contributions", PALE_PURPLE, PURPLE),
        ("6", "Return the result", "numeric score to the intended requester\nor a randomized risk category", PALE_GREEN, GREEN),
    ]
    y_positions = [0.76, 0.635, 0.51, 0.385, 0.26, 0.135]
    for (num, title, body, face, edge), y in zip(stages, y_positions):
        ax.text(0.08, y + 0.048, num, ha="center", va="center", fontsize=12,
                fontweight="bold", color="white",
                bbox=dict(boxstyle="circle,pad=0.32", facecolor=edge, edgecolor=edge))
        box(ax, 0.15, y, 0.78, 0.095, title, body, face=face, edge=edge,
            title_size=10.1, body_size=7.6, radius=0.014)
        if y != y_positions[-1]:
            arrow(ax, (0.54, y), (0.54, y - 0.027), color="#7A858E", width=1.0)
    ax.text(0.5, 0.055,
            "The registry records who may use a sample and how it was prepared,\nbut it cannot prove that submitted genotypes came from that sample.",
            ha="center", va="center", fontsize=7.8, color=RED,
            bbox=dict(boxstyle="round,pad=0.4", facecolor=PALE_RED, edgecolor=RED))
    save(fig, output_dir, "fig_scoring_workflow.pdf")


def protocol(output_dir: Path):
    fig, ax = canvas(9.3, 6.4)
    heading(ax, "Classic and streaming calculation methods",
            subtitle="The Classic method stores encrypted genotypes; the Streaming method uses each group once")
    ax.text(0.25, 0.84, "Classic method (stored inputs)", ha="center", fontsize=12.5,
            fontweight="bold", color=BLUE)
    ax.text(0.75, 0.84, "Streaming method", ha="center", fontsize=12.5,
            fontweight="bold", color=GREEN)
    classic = [
        ("Create calculation", "requester"),
        ("Upload variant groups", "store encrypted genotype values"),
        ("Finish input upload", "requester confirms all inputs"),
        ("Calculate each group", "any account may submit this step"),
        ("Return score or category", "result follows the model output rule"),
    ]
    stream = [
        ("Create calculation", "requester"),
        ("Upload and calculate each group", "one transaction per group"),
        ("Use each group once", "encrypted genotypes are not stored"),
        ("Return score or category", "result follows the model output rule"),
    ]
    for i, (title, body) in enumerate(classic):
        y = 0.69 - i * 0.125
        box(ax, 0.055, y, 0.39, 0.085, title, body, face=PALE_BLUE, edge=BLUE,
            title_size=9.4, body_size=7.8, radius=0.012)
        if i < len(classic) - 1:
            arrow(ax, (0.25, y), (0.25, y - 0.035), color=BLUE, width=1.0)
    for i, (title, body) in enumerate(stream):
        y = 0.69 - i * 0.15
        box(ax, 0.555, y, 0.39, 0.085, title, body, face=PALE_GREEN, edge=GREEN,
            title_size=9.4, body_size=7.8, radius=0.012)
        if i < len(stream) - 1:
            arrow(ax, (0.75, y), (0.75, y - 0.06), color=GREEN, width=1.0)
    ax.text(0.25, 0.085, "Several accounts can submit calculation steps\nStoring genotypes increases local gas use",
            ha="center", fontsize=8.8, color=BLUE, fontweight="bold")
    ax.text(0.75, 0.085, "One requester submits all inputs\n35.4-37.2% less gas in local simulation",
            ha="center", fontsize=8.8, color=GREEN, fontweight="bold")
    save(fig, output_dir, "fig_protocol.pdf")


def security(output_dir: Path):
    fig, ax = canvas(8.4, 6.5)
    heading(ax, "What the system protects and what it assumes",
            subtitle="The contracts control calculation and result release, but do not prove biological origin or clinical validity")
    box(ax, 0.28, 0.53, 0.44, 0.25, "What the contracts enforce",
        "result rules fixed by model provider\nvalid calculation order\nnumeric score only to intended requester\nno public numeric-score release\none result per calculation + query limits",
        face=PALE_BLUE, edge=BLUE, title_size=11.2, body_size=9.0)
    box(ax, 0.04, 0.30, 0.30, 0.15, "Possible attacker actions",
        "read public blockchain data;\noperate a blockchain node; submit transactions;\nmake repeated requests with chosen inputs",
        face=PALE_RED, edge=RED, title_size=10.0, body_size=7.3)
    box(ax, 0.66, 0.30, 0.30, 0.15, "Not established by the system",
        "whether genotypes came from the sample;\nmodel validity and calibration;\nperformance across ancestry groups;\nformal privacy guarantee",
        face=PALE_ORANGE, edge=ORANGE, title_size=10.0, body_size=7.3)
    arrow(ax, (0.34, 0.38), (0.40, 0.53), color=RED)
    arrow(ax, (0.66, 0.38), (0.60, 0.53), color=ORANGE)
    box(ax, 0.10, 0.08, 0.80, 0.14, "Assumptions and services the system depends on",
        "security of TFHE encryption; deployed contract code; blockchain consensus;\nfhEVM services that calculate encrypted values, submit transactions, and manage keys",
        face=PALE_TEAL, edge=TEAL, title_size=10.5, body_size=8.0)
    arrow(ax, (0.50, 0.22), (0.50, 0.53), color=TEAL, width=1.2)
    save(fig, output_dir, "fig_security.pdf")


def individual_agreement(output_dir: Path):
    source = ROOT / "evidence" / "phase5" / "individual_level_comparison.csv"
    with source.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    fixture_sizes = [100, 500, 1000, 5000]
    markers = ["o", "s", "^", "D"]
    colors = [BLUE, ORANGE, GREEN, PURPLE]
    fig, axis = plt.subplots(figsize=(4.8, 4.2), constrained_layout=True)
    for fixture_size, marker, color in zip(fixture_sizes, markers, colors):
        selected = [row for row in rows if int(row["nominalSnpCount"]) == fixture_size]
        expected = [float(row["equation1PRS"]) for row in selected]
        decoded = [float(row["decodedBioethPRS"]) for row in selected]
        axis.scatter(expected, decoded, s=20, marker=marker, facecolors="none",
                     edgecolors=color, linewidths=1.1, zorder=3,
                     label=f"{fixture_size:,} variants")
    values = [float(row[field]) for row in rows for field in ("equation1PRS", "decodedBioethPRS")]
    lower, upper = min(values), max(values)
    margin = (upper - lower) * 0.04 or 0.01
    lower, upper = lower - margin, upper + margin
    axis.plot([lower, upper], [lower, upper], color="black", linewidth=0.7, label="line of exact agreement")
    axis.set(xlim=(lower, upper), ylim=(lower, upper), xlabel="PRS from Equation 1",
             ylabel="bioETH-PRS after decoding")
    axis.set_aspect("equal", adjustable="box")
    axis.grid(alpha=0.2, linewidth=0.5)
    axis.legend(frameon=False, fontsize=7, loc="upper left")
    save(fig, output_dir, "fig_individual_agreement.pdf")


def gas_scaling(output_dir: Path):
    source = ROOT / "evidence" / "phase8" / "heprs_profile.json"
    rows = [
        row for row in json.loads(source.read_text(encoding="utf-8"))
        if int(row["fixtureSize"]) <= 5000
    ]
    sizes = [int(row["fixtureSize"]) for row in rows]
    classic = [int(row["gas"]["total"]) / 1_000_000 for row in rows]
    streaming = [int(row["streamingGas"]["total"]) / 1_000_000 for row in rows]
    fig, axis = plt.subplots(figsize=(4.8, 3.8), constrained_layout=True)
    axis.plot(sizes, classic, marker="o", linewidth=1.2, color=BLUE, label="Classic method (stored inputs)")
    axis.plot(sizes, streaming, marker="s", linewidth=1.2, color=ORANGE, label="Streaming method")
    axis.set_xlabel("Number of variants")
    axis.set_ylabel("Gas used in local simulation (millions)")
    axis.grid(alpha=0.2, linewidth=0.5)
    axis.legend(frameon=False)
    axis.ticklabel_format(style="plain", axis="x")
    save(fig, output_dir, "fig_gas_scaling.pdf")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path,
                        default=ROOT / "new arxiv upload" / "figures")
    args = parser.parse_args()
    output_dir = args.output_dir.resolve()
    graphical_abstract(output_dir)
    architecture(output_dir)
    quantization(output_dir)
    scoring_workflow(output_dir)
    protocol(output_dir)
    security(output_dir)
    individual_agreement(output_dir)
    gas_scaling(output_dir)


if __name__ == "__main__":
    main()
