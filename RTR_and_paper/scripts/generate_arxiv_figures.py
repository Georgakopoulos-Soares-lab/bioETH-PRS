#!/usr/bin/env python3
"""Build the revised arXiv figures in the visual language of the original set."""

from __future__ import annotations

import argparse
import csv
import json
import shutil
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import (
    Arc,
    Circle,
    FancyArrowPatch,
    Polygon,
    Rectangle,
    RegularPolygon,
)


PAPER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PAPER_ROOT.parent
FIGSIZE = (14.08, 7.68)

# Colors sampled from the original pre-review figures.
BLACK = "#111111"
GRAY = "#666666"
LIGHT_GRAY = "#F2F2F2"
BLUE = "#0B6393"
CHART_BLUE = "#3A8FD0"
PALE_BLUE = "#CEE2F0"
GREEN = "#3B7B2C"
CHART_GREEN = "#3D8748"
PALE_GREEN = "#D7E9D1"
TEAL = "#0B8D65"
PALE_TEAL = "#D8F0E7"
PURPLE = "#625184"
PALE_PURPLE = "#DAD0E8"
ORANGE = "#C86817"
AMBER = "#D5960F"
PALE_ORANGE = "#FDE3CA"
RED = "#C70602"
NAVY = "#142656"

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans"],
    "mathtext.fontset": "dejavusans",
    "pdf.fonttype": 42,
    "ps.fonttype": 42,
})


def canvas():
    fig = plt.figure(figsize=FIGSIZE, dpi=100, facecolor="white")
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1408)
    ax.set_ylim(0, 768)
    ax.axis("off")
    return fig, ax


def save(fig, output_dir: Path, name: str):
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / name
    fig.savefig(
        path,
        format="pdf",
        dpi=100,
        facecolor="white",
        metadata={"Creator": "bioETH-PRS figure generator"},
    )
    plt.close(fig)
    print(f"wrote {path.relative_to(REPO_ROOT)}")


def heading(ax, title: str, subtitle: str | None = None, *, color=BLACK):
    ax.text(704, 738, title, ha="center", va="top", fontsize=26,
            fontweight="bold", color=color)
    if subtitle:
        ax.text(704, 698, subtitle, ha="center", va="top", fontsize=14,
                color=GRAY)


def box(ax, x, y, w, h, *, face="white", edge=BLACK, lw=2.2):
    patch = Rectangle((x, y), w, h, facecolor=face, edgecolor=edge,
                      linewidth=lw, joinstyle="miter")
    ax.add_patch(patch)
    return patch


def arrow(ax, start, end, *, color=BLACK, lw=2.5, mutation=18,
          style="-|>", connection="arc3"):
    ax.add_patch(FancyArrowPatch(
        start, end, arrowstyle=style, mutation_scale=mutation,
        linewidth=lw, color=color, connectionstyle=connection,
        shrinkA=1, shrinkB=1,
    ))


def labelled_box(ax, x, y, w, h, title, body="", *, face="white",
                 edge=BLACK, title_size=17, body_size=13, lw=2.2):
    box(ax, x, y, w, h, face=face, edge=edge, lw=lw)
    if body:
        ax.text(x + w / 2, y + h * 0.69, title, ha="center", va="center",
                fontsize=title_size, fontweight="bold", color=BLACK)
        ax.text(x + w / 2, y + h * 0.34, body, ha="center", va="center",
                fontsize=body_size, color=BLACK, linespacing=1.18)
    else:
        ax.text(x + w / 2, y + h / 2, title, ha="center", va="center",
                fontsize=title_size, fontweight="bold", color=BLACK)


def draw_lock(ax, x, y, scale=1.0, color=BLACK):
    ax.add_patch(Arc((x, y + 20 * scale), 34 * scale, 35 * scale,
                     theta1=0, theta2=180, linewidth=2.4, color=color))
    ax.add_patch(Rectangle((x - 21 * scale, y - 12 * scale),
                           42 * scale, 32 * scale, facecolor="white",
                           edgecolor=color, linewidth=2.4))
    ax.add_patch(Circle((x, y + 3 * scale), 3.6 * scale,
                        facecolor=color, edgecolor=color))
    ax.plot([x, x], [y + 3 * scale, y - 5 * scale], color=color,
            linewidth=2.0)


def draw_person(ax, x, y, color):
    ax.add_patch(Circle((x, y + 86), 25, facecolor=color, edgecolor=color))
    ax.add_patch(Polygon([
        (x - 49, y + 6), (x - 38, y + 58), (x - 22, y + 78),
        (x + 22, y + 78), (x + 38, y + 58), (x + 49, y + 6),
    ], closed=True, facecolor=color, edgecolor=color))
    ax.plot([x - 31, x - 52], [y + 48, y - 28], color=color, linewidth=13,
            solid_capstyle="round")
    ax.plot([x + 31, x + 52], [y + 48, y - 28], color=color, linewidth=13,
            solid_capstyle="round")
    ax.plot([x - 18, x - 22], [y + 8, y - 80], color=color, linewidth=17,
            solid_capstyle="round")
    ax.plot([x + 18, x + 22], [y + 8, y - 80], color=color, linewidth=17,
            solid_capstyle="round")


def draw_document(ax, x, y, color):
    box(ax, x, y, 104, 130, face="white", edge=color, lw=3)
    ax.add_patch(Polygon([(x + 72, y + 130), (x + 104, y + 98),
                          (x + 72, y + 98)], closed=True,
                         facecolor=PALE_ORANGE, edgecolor=color, linewidth=2))
    for offset, width in [(83, 50), (60, 68), (37, 55)]:
        ax.plot([x + 18, x + 18 + width], [y + offset, y + offset],
                color=color, linewidth=4, solid_capstyle="butt")
    draw_lock(ax, x + 92, y + 12, scale=0.9, color=color)


def draw_server(ax, x, y, color):
    for offset in (74, 35, -4):
        box(ax, x, y + offset, 132, 30, face=PALE_ORANGE, edge=color, lw=2.6)
        ax.add_patch(Circle((x + 16, y + offset + 15), 4.5,
                            facecolor=color, edgecolor=color))
        ax.plot([x + 33, x + 112], [y + offset + 15, y + offset + 15],
                color=color, linewidth=2.2)


def draw_contract_network(ax, x, y):
    center = (x, y)
    for dx, dy in [(-92, 0), (-46, 80), (46, 80), (92, 0),
                   (46, -80), (-46, -80)]:
        ax.plot([x, x + dx], [y, y + dy], color=BLUE, linewidth=3)
        ax.add_patch(RegularPolygon((x + dx, y + dy), 6, radius=27,
                                    orientation=0, facecolor=PALE_TEAL,
                                    edgecolor=BLUE, linewidth=3))
    ax.add_patch(RegularPolygon(center, 6, radius=62, orientation=0,
                                facecolor=PALE_TEAL, edgecolor=BLUE,
                                linewidth=3.5))
    ax.text(x, y, "fhEVM", ha="center", va="center", fontsize=19,
            fontweight="bold", color=BLACK)


def draw_result(ax, x, y, color):
    box(ax, x, y, 135, 132, face="white", edge=color, lw=3)
    ax.text(x + 67.5, y + 103, "RESULT", ha="center", va="center",
            fontsize=13, fontweight="bold", color=color)
    ax.plot([x + 17, x + 118], [y + 84, y + 84], color=color, linewidth=2)
    ax.text(x + 67.5, y + 58, "score", ha="center", va="center",
            fontsize=19, fontweight="bold", color=BLACK)
    ax.text(x + 67.5, y + 28, "or category", ha="center", va="center",
            fontsize=12, color=GRAY)


def graphical_abstract(output_dir: Path):
    fig, ax = canvas()
    heading(
        ax,
        "Confidential polygenic risk scoring with encrypted calculation",
        "The calculation remains dependent on the evaluator or on the fhEVM and blockchain services used",
    )
    ax.plot([704, 704], [206, 652], color=BLACK, linewidth=2,
            linestyle=(0, (6, 7)))

    ax.text(352, 646, "HE with a designated evaluator", ha="center",
            va="center", fontsize=24, fontweight="bold", color=ORANGE)
    draw_document(ax, 48, 380, ORANGE)
    draw_server(ax, 292, 390, ORANGE)
    draw_result(ax, 535, 382, ORANGE)
    arrow(ax, (166, 447), (282, 447), color=ORANGE, lw=4, mutation=24)
    arrow(ax, (431, 447), (525, 447), color=ORANGE, lw=4, mutation=24)
    ax.text(100, 344, "encrypted\ninputs", ha="center", va="top",
            fontsize=17, color=ORANGE, fontweight="bold")
    ax.text(358, 344, "one evaluator performs\nthe encrypted calculation",
            ha="center", va="top", fontsize=16, color=ORANGE)
    ax.text(602, 344, "result for\nrequester", ha="center", va="top",
            fontsize=16, color=ORANGE)

    ax.text(1056, 646, "bioETH-PRS with fhEVM", ha="center", va="center",
            fontsize=24, fontweight="bold", color=BLUE)
    draw_person(ax, 785, 432, BLACK)
    draw_lock(ax, 830, 445, scale=1.3, color=TEAL)
    draw_contract_network(ax, 1052, 446)
    draw_result(ax, 1234, 382, BLUE)
    arrow(ax, (850, 446), (925, 446), color=BLUE, lw=4, mutation=24)
    arrow(ax, (1160, 446), (1223, 446), color=GREEN, lw=4, mutation=24)
    ax.text(804, 330, "encrypted\ngenotypes", ha="center", va="top",
            fontsize=16, color=BLUE, fontweight="bold")
    ax.text(1052, 336, "contracts coordinate\nthe calculation\nwith fhEVM services",
            ha="center", va="top", fontsize=13, color=BLUE, linespacing=1.15)
    ax.text(1301, 336, "numeric score\nor risk category",
            ha="center", va="top", fontsize=13, color=GREEN,
            linespacing=1.15)

    badges = [
        (40, 38, 418, "SEPOLIA", "Classic, 100 variants | 25 transactions\nscore matched independent calculation", BLUE),
        (495, 38, 418, "LOCAL AGREEMENT", "200 of 200 individual scores matched", PURPLE),
        (950, 38, 418, "LOCAL GAS", "Streaming used 35.4-37.2% less gas", GREEN),
    ]
    for x, y, w, title, body, color in badges:
        box(ax, x, y, w, 112, face="white", edge=BLACK, lw=2.2)
        ax.text(x + 26, y + 73, title, ha="left", va="center", fontsize=17,
                fontweight="bold", color=color)
        ax.text(x + 26, y + 32, body, ha="left", va="center", fontsize=12.8,
                color=BLACK, linespacing=1.15)
    save(fig, output_dir, "graphical_abstract.pdf")


def architecture(output_dir: Path):
    fig, ax = canvas()
    heading(ax, "bioETH-PRS system architecture",
            "Four contracts coordinate the encrypted score calculation with fhEVM services")

    labelled_box(ax, 90, 586, 220, 78, "Requester", face="white", title_size=20)
    labelled_box(ax, 400, 586, 250, 78, "Model provider", face="white", title_size=20)
    labelled_box(ax, 110, 388, 460, 132, "Sample registry",
                 "sample record and preparation details\nwho may request its use",
                 face=PALE_BLUE, edge=BLUE, title_size=22, body_size=16)
    labelled_box(ax, 690, 388, 470, 132, "Model contract",
                 "public or encrypted weights\nfixed result rule",
                 face=PALE_GREEN, edge=GREEN, title_size=22, body_size=16)
    labelled_box(ax, 350, 192, 630, 142, "Calculation contract",
                 "receives encrypted inputs | calculates the weighted sum\nrecords progress and completion",
                 face=PALE_PURPLE, edge=PURPLE, title_size=23, body_size=16)
    labelled_box(ax, 455, 34, 480, 108, "Result contract",
                 "numeric score for the intended requester\nor a risk category",
                 face=PALE_ORANGE, edge=ORANGE, title_size=21, body_size=15)
    labelled_box(ax, 1110, 168, 250, 164, "fhEVM services",
                 "encrypted calculation\ntransaction submission\nencryption keys",
                 face=PALE_TEAL, edge=TEAL, title_size=19, body_size=14)

    arrow(ax, (200, 586), (280, 520), color=BLACK)
    ax.text(92, 548, "register prepared sample", ha="left", va="center",
            fontsize=14, color=BLACK)
    arrow(ax, (525, 586), (880, 520), color=BLACK)
    ax.text(670, 550, "publish model", ha="center", va="center",
            fontsize=14, color=BLACK)
    arrow(ax, (340, 388), (510, 334), color=BLACK)
    arrow(ax, (925, 388), (820, 334), color=BLACK)
    arrow(ax, (665, 192), (690, 142), color=BLACK)
    arrow(ax, (1110, 275), (980, 275), color=TEAL, style="<->")
    ax.text(1060, 305, "encrypted operations", ha="center", va="center",
            fontsize=13, color=TEAL, fontweight="bold")
    box(ax, 1005, 34, 355, 108, face=LIGHT_GRAY, edge=GRAY, lw=1.6)
    ax.text(1182.5, 88,
            "Public weights remain public.\nEncrypted inputs are not decrypted\nduring the contract calculation.",
            ha="center", va="center", fontsize=11.5, color=GRAY,
            linespacing=1.2)
    save(fig, output_dir, "fig_architecture.pdf")


def quantization(output_dir: Path):
    fig, ax = canvas()
    heading(ax, "Converting signed decimal weights to nonnegative integers",
            "The inverse calculation restores the polygenic risk score")

    panels = [
        (14, 120, 407, 548, AMBER, "STEP 1", "Round the weights"),
        (500, 120, 407, 548, TEAL, "STEP 2", "Shift the weights"),
        (989, 120, 405, 548, BLUE, "STEP 3", "Shift and decode the score"),
    ]
    for x, y, w, h, color, stage, title in panels:
        box(ax, x, y, w, h, face="white", edge=color, lw=3.2)
        ax.plot([x, x + w], [y + h - 105, y + h - 105], color=color,
                linewidth=3.2)
        ax.text(x + w / 2, y + h - 36, stage, ha="center", va="center",
                fontsize=19, color=BLACK)
        ax.text(x + w / 2, y + h - 75, title, ha="center", va="center",
                fontsize=21, fontweight="bold", color=BLACK)
    arrow(ax, (421, 390), (492, 390), color=BLACK, lw=4, mutation=28)
    arrow(ax, (907, 390), (981, 390), color=BLACK, lw=4, mutation=28)

    ax.text(217, 475, r"$q_i=\mathrm{round}(s\,\beta_i)$", ha="center",
            va="center", fontsize=27, color=BLACK)
    ax.text(217, 416, "half values are rounded away from zero",
            ha="center", va="center", fontsize=14, color=AMBER,
            fontweight="bold")
    ax.text(217, 347, r"$s=100$", ha="center", va="center",
            fontsize=19, color=BLACK)
    ax.text(217, 302, r"$\beta=[-0.30,\ 0.10,\ 0.25]$", ha="center",
            va="center", fontsize=18, color=BLACK)
    ax.text(217, 252, r"$q=[-30,\ 10,\ 25]$", ha="center", va="center",
            fontsize=22, color=BLACK)
    ax.text(217, 180, "The scale keeps the required\ndecimal precision.",
            ha="center", va="center", fontsize=13.5, color=GRAY,
            linespacing=1.25)

    ax.text(704, 488, r"$z_w=\max(0,-\min_i q_i)$", ha="center",
            va="center", fontsize=25, color=BLACK)
    ax.text(704, 432, r"$u_i=q_i+z_w\geq 0$", ha="center", va="center",
            fontsize=25, color=TEAL, fontweight="bold")
    ax.text(704, 350, r"$z_w=30,\quad u=[0,\ 40,\ 55]$", ha="center",
            va="center", fontsize=19, color=BLACK)
    box(ax, 527, 176, 354, 116, face="white", edge=BLUE, lw=2.6)
    ax.text(704, 254, "Keep two encrypted totals", ha="center", va="center",
            fontsize=16, fontweight="bold", color=BLUE)
    ax.text(704, 211, r"$\sum_i g_i u_i\qquad G=\sum_i g_i$",
            ha="center", va="center", fontsize=22, color=BLACK)

    ax.text(1191, 507, r"$z_s=-\sum_{q_i<0}2q_i$", ha="center",
            va="center", fontsize=23, color=BLACK)
    ax.text(1191, 455, r"$e=\sum_i g_i u_i+z_s-z_wG$", ha="center",
            va="center", fontsize=20, color=TEAL, fontweight="bold")
    box(ax, 1008, 326, 367, 92, face="white", edge=BLUE, lw=2.6)
    ax.text(1191, 371, r"$\mathrm{PRS}=(e-z_s)/s$", ha="center",
            va="center", fontsize=25, color=BLUE, fontweight="bold")
    ax.text(1191, 278,
            r"$g=[0,2,1],\ z_s=60,\ e=105$" "\n" r"$\mathrm{PRS}=0.45$",
            ha="center", va="center", fontsize=18, color=BLACK,
            linespacing=1.5)
    ax.text(1191, 175, r"Safety condition:  $4sMN\leq 2^{64}-1$",
            ha="center", va="center", fontsize=15, color=RED,
            fontweight="bold")
    save(fig, output_dir, "fig_quantization.pdf")


def scoring_workflow(output_dir: Path):
    fig, ax = canvas()
    heading(ax, "Polygenic risk score calculation workflow",
            "Variant identifiers and effect alleles are aligned before encrypted calculation")

    ax.text(28, 532, "BEFORE\nSUBMISSION", ha="center", va="center",
            fontsize=16, fontweight="bold", color=BLUE, rotation=90)
    ax.text(28, 257, "ON THE\nBLOCKCHAIN", ha="center", va="center",
            fontsize=16, fontweight="bold", color=GREEN, rotation=90)
    ax.plot([68, 1380], [378, 378], color=GRAY, linewidth=1.8,
            linestyle=(0, (6, 6)))

    top = [
        (90, "1  Check data", "genome build | variant identity and order\nmissing values\ngenotype values 0, 1, or 2"),
        (510, "2  Align effect alleles", "keep dosage g or use 2-g\nreject unresolved\npalindromic variants"),
        (930, "3  Convert and encrypt", "convert decimal weights to integers\nencrypt genotype dosages"),
    ]
    bottom = [
        (90, "4  Create calculation", "requester selects a registered sample\nand a model"),
        (510, "5  Submit and calculate groups", "Classic stores encrypted groups\nStreaming uses each group once"),
        (930, "6  Return the result", "numeric score for the intended requester\nor a randomized risk category"),
    ]
    for x, title, body in top:
        labelled_box(ax, x, 440, 360, 170, title, body, face="white",
                     edge=BLUE, title_size=18, body_size=13, lw=2.5)
    for x, title, body in bottom:
        labelled_box(ax, x, 165, 360, 170, title, body, face="white",
                     edge=GREEN, title_size=17, body_size=13, lw=2.5)
    arrow(ax, (450, 525), (500, 525), color=BLACK)
    arrow(ax, (870, 525), (920, 525), color=BLACK)
    arrow(ax, (1110, 440), (270, 345), color=ORANGE, lw=3.2,
          mutation=22, connection="arc3,rad=0.15")
    arrow(ax, (450, 250), (500, 250), color=BLACK)
    arrow(ax, (870, 250), (920, 250), color=BLACK)

    box(ax, 248, 38, 912, 78, face=LIGHT_GRAY, edge=BLACK, lw=2)
    ax.text(704, 77,
            "The sample record describes preparation and permitted use; it does not prove biological origin.",
            ha="center", va="center", fontsize=15, color=BLACK)
    save(fig, output_dir, "fig_scoring_workflow.pdf")


def protocol(output_dir: Path):
    fig, ax = canvas()
    ax.text(352, 738, "CLASSIC METHOD", ha="center", va="top", fontsize=25,
            fontweight="bold", color=BLUE)
    ax.text(1056, 738, "STREAMING METHOD", ha="center", va="top", fontsize=25,
            fontweight="bold", color=GREEN)
    ax.text(352, 700, "Stored encrypted inputs", ha="center", va="top",
            fontsize=16, color=BLACK)
    ax.text(1056, 700, "Each encrypted group is used once", ha="center",
            va="top", fontsize=16, color=BLACK)
    ax.plot([704, 704], [142, 688], color=GRAY, linewidth=1.8,
            linestyle=(0, (6, 6)))

    ax.text(224, 650, "Requester", ha="center", fontsize=16,
            fontweight="bold")
    ax.text(542, 650, "Requester or another account", ha="center", fontsize=16,
            fontweight="bold")
    ax.plot([405, 405], [126, 628], color=GRAY, linewidth=1.4,
            linestyle=(0, (5, 6)))

    classic_steps = [
        (90, 565, 270, "Create calculation"),
        (90, 475, 270, "Upload encrypted groups"),
        (90, 337, 270, "Confirm input complete"),
        (445, 300, 220, "Calculate each group"),
        (230, 176, 350, "Return score or category"),
    ]
    for x, y, w, text in classic_steps:
        box(ax, x, y, w, 54, face="white", edge=BLUE, lw=2.2)
        ax.text(x + w / 2, y + 27, text, ha="center", va="center",
                fontsize=15, fontweight="bold" if "group" in text else "normal")
    arrow(ax, (225, 565), (225, 522), color=BLUE)
    arrow(ax, (225, 475), (225, 458), color=BLUE)
    box(ax, 83, 420, 284, 38, face="white", edge=ORANGE, lw=3)
    ax.text(225, 439, "encrypted groups remain in storage", ha="center",
            va="center", fontsize=11.5, color=ORANGE, fontweight="bold")
    arrow(ax, (225, 420), (225, 391), color=BLUE)
    arrow(ax, (360, 364), (445, 327), color=BLUE,
          connection="arc3,rad=-0.08")
    ax.text(410, 370, "continue", ha="center", va="center", fontsize=11.5,
            color=BLUE)
    arrow(ax, (555, 300), (555, 239), color=BLUE)
    arrow(ax, (665, 327), (555, 355), color=BLUE,
          connection="arc3,rad=0.28")
    ax.text(638, 370, "repeat for groups", ha="center", fontsize=11.5,
            color=BLUE)

    ax.text(1056, 650, "Requester", ha="center", fontsize=16,
            fontweight="bold")
    stream_steps = [
        (870, 565, 372, "Create calculation"),
        (870, 438, 372, "Upload and calculate one group"),
        (870, 311, 372, "Use the group once; do not store it"),
        (870, 184, 372, "Return score or category"),
    ]
    for x, y, w, text in stream_steps:
        box(ax, x, y, w, 62, face="white", edge=GREEN, lw=2.2)
        ax.text(x + w / 2, y + 31, text, ha="center", va="center",
                fontsize=15, fontweight="bold" if "calculate" in text else "normal")
    arrow(ax, (1056, 565), (1056, 505), color=GREEN)
    arrow(ax, (1056, 438), (1056, 378), color=GREEN)
    arrow(ax, (870, 469), (820, 342), color=GREEN,
          connection="arc3,rad=0.25")
    arrow(ax, (820, 342), (870, 342), color=GREEN)
    ax.text(786, 407, "repeat for\nall groups", ha="center", va="center",
            fontsize=13, color=GREEN)
    arrow(ax, (1056, 311), (1056, 251), color=GREEN)

    box(ax, 150, 52, 1108, 78, face=LIGHT_GRAY, edge=BLACK, lw=2)
    ax.text(704, 91,
            "Local simulation: Streaming used 35.4-37.2% less gas for 100-5,000 variants.",
            ha="center", va="center", fontsize=17, fontweight="bold",
            color=RED)
    save(fig, output_dir, "fig_protocol.pdf")


def security(output_dir: Path):
    fig, ax = canvas()
    heading(ax, "What the system protects and what it assumes",
            "Contract rules limit calculation and result release, but do not establish clinical validity")

    center = (704, 400)
    layers = [
        (272, "#EFF2F8", NAVY, 4),
        (213, "#DDECF6", "#337EB3", 4),
        (153, "#DDF2ED", "#2A9B9A", 4),
        (90, "#E3F0D9", "#4F9644", 4),
    ]
    for radius, face, edge, lw in layers:
        ax.add_patch(Circle(center, radius, facecolor=face, edgecolor=edge,
                            linewidth=lw))
    ax.text(704, 652, "BLOCKCHAIN NETWORK", ha="center", va="center",
            fontsize=16, fontweight="bold", color=NAVY)
    ax.text(704, 593, "CONTRACTS", ha="center", va="center",
            fontsize=16, fontweight="bold", color="#286E9D")
    ax.text(704, 531, "fhEVM SERVICES", ha="center", va="center",
            fontsize=16, fontweight="bold", color="#238B87")
    ax.text(704, 464, "ENCRYPTED INPUTS", ha="center", va="center",
            fontsize=15, fontweight="bold", color="#3E7F38")
    draw_lock(ax, 704, 370, scale=1.25, color=BLACK)
    ax.text(704, 307, "genotypes\nand encrypted weights when used",
            ha="center", va="center", fontsize=13.5, color=BLACK)
    ax.text(704, 205, "consensus", ha="center", va="center", fontsize=12,
            color=NAVY)
    ax.text(704, 257, "contract code", ha="center", va="center",
            fontsize=12, color="#286E9D")
    ax.text(704, 512, "encrypted calculation | transaction submission | keys",
            ha="center", va="center", fontsize=10.5, color="#1F7674")

    ax.text(20, 596, "Attacker can", ha="left", va="center", fontsize=20,
            fontweight="bold", color=BLACK)
    ax.plot([20, 230], [578, 578], color=BLACK, linewidth=1.8)
    attacker = [
        "read public blockchain data",
        "operate a blockchain node",
        "submit chosen encrypted inputs",
        "make repeated permitted requests",
    ]
    for index, line in enumerate(attacker):
        y = 530 - index * 68
        ax.text(20, y, "x", ha="left", va="center", fontsize=25,
                color=RED, fontweight="bold")
        ax.text(56, y, line, ha="left", va="center", fontsize=14.5,
                color=BLACK)

    ax.text(1080, 596, "What contracts enforce", ha="left", va="center",
            fontsize=20, fontweight="bold", color=BLACK)
    ax.plot([1080, 1384], [578, 578], color=BLACK, linewidth=1.8)
    controls = [
        "calculation and result rules",
        "numeric score only to requester",
        "configured query limits",
        "one result for each calculation",
    ]
    for index, line in enumerate(controls):
        y = 530 - index * 68
        ax.text(1080, y, "+", ha="left", va="center", fontsize=25,
                color=CHART_GREEN, fontweight="bold")
        ax.text(1115, y, line, ha="left", va="center", fontsize=14.5,
                color=BLACK)

    box(ax, 252, 22, 904, 92, face=PALE_ORANGE, edge=ORANGE, lw=2.5)
    ax.text(276, 86, "Not established", ha="left", va="center", fontsize=17,
            fontweight="bold", color=ORANGE)
    ax.text(704, 48,
            "biological origin of genotypes | clinical validity and calibration\naccuracy across ancestry groups | formal privacy guarantee",
            ha="center", va="center", fontsize=12.5, color=BLACK,
            linespacing=1.25)
    save(fig, output_dir, "fig_security.pdf")


def individual_agreement(output_dir: Path):
    source = REPO_ROOT / "evidence" / "phase5" / "individual_level_comparison.csv"
    with source.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    fig = plt.figure(figsize=FIGSIZE, dpi=100, facecolor="white")
    axis = fig.add_axes([0.085, 0.14, 0.60, 0.73])
    sizes = [100, 500, 1000, 5000]
    markers = ["o", "s", "^", "D"]
    colors = [CHART_BLUE, ORANGE, CHART_GREEN, PURPLE]
    for size, marker, color in zip(sizes, markers, colors):
        selected = [row for row in rows if int(row["nominalSnpCount"]) == size]
        expected = [float(row["equation1PRS"]) for row in selected]
        observed = [float(row["decodedBioethPRS"]) for row in selected]
        axis.scatter(expected, observed, s=42, marker=marker, facecolors="none",
                     edgecolors=color, linewidths=1.8, zorder=3,
                     label=f"{size:,} variants")
    values = [float(row[field]) for row in rows
              for field in ("equation1PRS", "decodedBioethPRS")]
    lower, upper = min(values), max(values)
    margin = (upper - lower) * 0.05
    lower, upper = lower - margin, upper + margin
    axis.plot([lower, upper], [lower, upper], color=BLACK, linewidth=1.8,
              label="exact agreement", zorder=2)
    axis.set_xlim(lower, upper)
    axis.set_ylim(lower, upper)
    axis.set_aspect("equal", adjustable="box")
    axis.set_xlabel("PRS from Equation 1", fontsize=17)
    axis.set_ylabel("bioETH-PRS after decoding", fontsize=17)
    axis.tick_params(axis="both", labelsize=13, width=1.5, length=6)
    for spine in axis.spines.values():
        spine.set_linewidth(1.8)
        spine.set_color(BLACK)
    axis.grid(True, linestyle="--", linewidth=1.0, color="#B7B7B7", alpha=0.9)
    axis.legend(loc="upper left", frameon=True, framealpha=1, edgecolor="#B0B0B0",
                fontsize=12)
    fig.text(0.5, 0.952, "Individual score agreement in local simulation",
             ha="center", va="top", fontsize=27, fontweight="bold")
    fig.text(0.79, 0.73, "200 of 200", ha="center", va="center", fontsize=34,
             fontweight="bold", color=CHART_GREEN)
    fig.text(0.79, 0.67, "individual scores matched", ha="center", va="center",
             fontsize=18, color=BLACK)
    fig.text(0.79, 0.54, "Maximum absolute difference", ha="center", va="center",
             fontsize=16, color=GRAY)
    fig.text(0.79, 0.49, "0", ha="center", va="center", fontsize=31,
             fontweight="bold", color=BLUE)
    fig.text(0.79, 0.34, "Four tested sizes", ha="center", va="center",
             fontsize=16, color=GRAY)
    fig.text(0.79, 0.29, "100 | 500 | 1,000 | 5,000 variants", ha="center",
             va="center", fontsize=17, fontweight="bold", color=BLACK)
    fig.text(0.79, 0.18, "50 people at each size", ha="center", va="center",
             fontsize=16, color=GRAY)
    save(fig, output_dir, "fig_individual_agreement.pdf")


def gas_scaling(output_dir: Path):
    source = REPO_ROOT / "evidence" / "phase8" / "heprs_profile.json"
    rows = [row for row in json.loads(source.read_text(encoding="utf-8"))
            if int(row["fixtureSize"]) <= 5000]
    sizes = [int(row["fixtureSize"]) for row in rows]
    classic = [int(row["gas"]["total"]) / 1_000_000 for row in rows]
    streaming = [int(row["streamingGas"]["total"]) / 1_000_000 for row in rows]
    reductions = [100 * (1 - stream / stored)
                  for stored, stream in zip(classic, streaming)]

    fig = plt.figure(figsize=FIGSIZE, dpi=100, facecolor="white")
    axis = fig.add_axes([0.09, 0.17, 0.88, 0.72])
    positions = list(range(len(sizes)))
    width = 0.34
    left = axis.bar([x - width / 2 for x in positions], classic, width,
                    color=CHART_BLUE, edgecolor=CHART_BLUE,
                    label="Classic method")
    right = axis.bar([x + width / 2 for x in positions], streaming, width,
                     color=CHART_GREEN, edgecolor=CHART_GREEN,
                     label="Streaming method")
    axis.set_title("Gas use: Classic and Streaming methods", fontsize=27, pad=17)
    axis.set_xlabel("Number of variants", fontsize=18)
    axis.set_ylabel("Gas used in local simulation (millions)", fontsize=18)
    axis.set_xticks(positions, [f"{value:,}" for value in sizes])
    axis.tick_params(axis="both", labelsize=15, width=1.5, length=6)
    axis.grid(axis="y", linestyle="--", linewidth=1.0, color="#B7B7B7")
    axis.set_axisbelow(True)
    axis.spines["top"].set_visible(False)
    axis.spines["right"].set_visible(False)
    axis.spines["left"].set_linewidth(1.7)
    axis.spines["bottom"].set_linewidth(1.7)
    axis.legend(loc="upper left", frameon=True, framealpha=1,
                edgecolor="#B0B0B0", fontsize=15)
    axis.set_ylim(0, max(classic) * 1.12)
    for classic_bar, stream_bar, classic_value, stream_value, reduction in zip(
            left, right, classic, streaming, reductions):
        axis.text(classic_bar.get_x() + classic_bar.get_width() / 2,
                  classic_value + 10, f"{classic_value:.3f}M",
                  ha="center", va="bottom", fontsize=13.5, color=BLACK)
        axis.text(stream_bar.get_x() + stream_bar.get_width() / 2,
                  stream_value + 10, f"{stream_value:.3f}M",
                  ha="center", va="bottom", fontsize=13.5, color=BLACK)
        axis.text(stream_bar.get_x() + stream_bar.get_width() / 2,
                  stream_value + max(classic) * 0.075,
                  f"{reduction:.1f}%\nless gas", ha="center", va="bottom",
                  fontsize=12.5, color=RED, fontweight="bold")
    fig.text(0.09, 0.045,
             "Measured range: gas use increased approximately in proportion to the number of variants.",
             ha="left", va="center", fontsize=16, color=BLACK)
    save(fig, output_dir, "fig_gas_scaling.pdf")


def generate_all(output_dir: Path):
    graphical_abstract(output_dir)
    architecture(output_dir)
    quantization(output_dir)
    scoring_workflow(output_dir)
    protocol(output_dir)
    security(output_dir)
    individual_agreement(output_dir)
    gas_scaling(output_dir)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-dir",
        type=Path,
        action="append",
        help="output directory; repeat to write more than one matching set",
    )
    args = parser.parse_args()
    output_dirs = args.output_dir or [
        PAPER_ROOT / "archive" / "generated_figure_drafts",
        PAPER_ROOT / "archive" / "new_arxiv_upload" / "figures",
    ]
    primary_dir = output_dirs[0].resolve()
    generate_all(primary_dir)
    names = [
        "graphical_abstract.pdf",
        "fig_architecture.pdf",
        "fig_quantization.pdf",
        "fig_scoring_workflow.pdf",
        "fig_protocol.pdf",
        "fig_security.pdf",
        "fig_individual_agreement.pdf",
        "fig_gas_scaling.pdf",
    ]
    for output_dir in output_dirs[1:]:
        target_dir = output_dir.resolve()
        target_dir.mkdir(parents=True, exist_ok=True)
        for name in names:
            shutil.copy2(primary_dir / name, target_dir / name)
            print(f"copied {(target_dir / name).relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
