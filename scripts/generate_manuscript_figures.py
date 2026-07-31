#!/usr/bin/env python3
"""Regenerate manuscript figures from machine-readable Stage A evidence."""

from __future__ import annotations

import csv
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt


ROOT = Path(__file__).resolve().parents[1]
AGREEMENT_SOURCE = ROOT / "evidence" / "phase5" / "individual_level_comparison.csv"
AGREEMENT_OUTPUT = ROOT / "figures" / "fig_individual_agreement.pdf"
GAS_SOURCE = ROOT / "evidence" / "phase8" / "heprs_profile.json"
GAS_OUTPUT = ROOT / "figures" / "fig_gas_scaling.pdf"


def agreement_figure() -> None:
    rows: list[dict[str, str]] = []
    with AGREEMENT_SOURCE.open(newline="", encoding="utf-8") as handle:
        rows.extend(csv.DictReader(handle))

    fixture_sizes = [100, 500, 1000, 5000]
    markers = ["o", "s", "^", "D"]
    colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#9467bd"]

    fig, axis = plt.subplots(figsize=(4.8, 4.2), constrained_layout=True)
    for fixture_size, marker, color in zip(fixture_sizes, markers, colors):
        selected = [row for row in rows if int(row["nominalSnpCount"]) == fixture_size]
        expected = [float(row["equation1PRS"]) for row in selected]
        decoded = [float(row["decodedBioethPRS"]) for row in selected]
        axis.scatter(
            expected,
            decoded,
            s=20,
            marker=marker,
            facecolors="none",
            edgecolors=color,
            linewidths=1.1,
            zorder=3,
            label=f"{fixture_size:,} variants",
        )

    values = [
        float(row[field])
        for row in rows
        for field in ("equation1PRS", "decodedBioethPRS")
    ]
    lower, upper = min(values), max(values)
    margin = (upper - lower) * 0.04 or 0.01
    lower -= margin
    upper += margin
    axis.plot(
        [lower, upper],
        [lower, upper],
        color="black",
        linewidth=0.7,
        zorder=1,
        label="identity",
    )
    axis.set_xlim(lower, upper)
    axis.set_ylim(lower, upper)
    axis.set_aspect("equal", adjustable="box")
    axis.set_xlabel("Equation 1 PRS")
    axis.set_ylabel("Decoded bioETH-PRS")
    axis.grid(alpha=0.2, linewidth=0.5)
    axis.legend(frameon=False, fontsize=7, loc="upper left")

    AGREEMENT_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(
        AGREEMENT_OUTPUT,
        format="pdf",
        metadata={"Creator": "bioETH-PRS evidence pipeline"},
    )
    plt.close(fig)
    print(
        f"wrote {AGREEMENT_OUTPUT.relative_to(ROOT)} from "
        f"{AGREEMENT_SOURCE.relative_to(ROOT)} ({len(rows)} rows)"
    )


def gas_figure() -> None:
    with GAS_SOURCE.open(encoding="utf-8") as handle:
        rows = json.load(handle)

    sizes = [int(row["fixtureSize"]) for row in rows]
    classic = [int(row["gas"]["total"]) / 1_000_000 for row in rows]
    streaming = [int(row["streamingGas"]["total"]) / 1_000_000 for row in rows]

    fig, axis = plt.subplots(figsize=(4.8, 3.8), constrained_layout=True)
    axis.plot(sizes, classic, marker="o", linewidth=1.1, label="classic")
    axis.plot(sizes, streaming, marker="s", linewidth=1.1, label="streaming")
    axis.set_xlabel("Nominal variants")
    axis.set_ylabel("Hardhat-mock host gas (millions)")
    axis.grid(alpha=0.2, linewidth=0.5)
    axis.legend(frameon=False)
    axis.ticklabel_format(style="plain", axis="x")

    GAS_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(GAS_OUTPUT, format="pdf", metadata={"Creator": "bioETH-PRS evidence pipeline"})
    plt.close(fig)
    print(f"wrote {GAS_OUTPUT.relative_to(ROOT)} from {GAS_SOURCE.relative_to(ROOT)}")


def main() -> None:
    agreement_figure()
    gas_figure()


if __name__ == "__main__":
    main()
