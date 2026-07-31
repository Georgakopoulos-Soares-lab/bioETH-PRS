#!/usr/bin/env python3
"""Build a clean arXiv source package from the evidence-bounded revised manuscript."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "bioeth_prs (4).tex"
BIBLIOGRAPHY = ROOT / "bioeth_prs.bib"
DEFAULT_OUTPUT = ROOT / "new arxiv upload"


FIGURES = {
    "graphical_abstract": r"""\begin{figure*}[t]
  \centering
  \includegraphics[width=\textwidth,keepaspectratio]{figures/graphical_abstract.pdf}
  \caption{\textbf{Graphical Abstract.} bioETH-PRS replaces the designated
  application-level evaluator in homomorphic PRS pipelines with publicly auditable
  contract orchestration. The architecture minimizes one evaluator role but retains
  explicit trust in the fhEVM coprocessor, relayer, ACL/Gateway/KMS infrastructure,
  contract bytecode, and chain. The evidence boundary is shown directly: one public
  100-SNP Live-fhEVM workflow, exact independent agreement for 200 Hardhat-mock jobs
  on losslessly quantised fixtures, and 35.4--37.2\% lower Hardhat-mock host gas for
  streaming execution.}
  \label{fig:graphical_abstract}
\end{figure*}""",
    "arch": r"""\begin{figure}[t]
  \centering
  \includegraphics[width=\columnwidth,keepaspectratio]{figures/fig_architecture.pdf}
  \caption{System architecture. Four on-chain contracts orchestrate sample access,
  model and release policy, encrypted accumulation, and bounded categorical release.
  Public weights and metadata are observable by design; genotype dosages and private
  weights remain encrypted during computation, and authorized outputs are decrypted
  under ACL policy. Shared dependencies are the fhEVM coprocessor, relayer,
  ACL/Gateway/KMS infrastructure, contract bytecode, and chain.}
  \label{fig:arch}
\end{figure}""",
    "quantization": r"""\begin{figure}[t]
  \centering
  \includegraphics[width=\columnwidth,keepaspectratio]{figures/fig_quantization.pdf}
  \caption{Three-step fixed-point quantisation scheme. Half-away-from-zero rounding
  and the clamp $z_w=\max(0,-\min_i q_i)$ are explicit. Signed weights become
  non-negative shifted integers; a score offset protects every materialized
  intermediate; decoding returns the original additive PRS for the worked example.}
  \label{fig:quantization}
\end{figure}""",
    "scoring_workflow": r"""\begin{figure}[t]
  \centering
  \includegraphics[width=\columnwidth,keepaspectratio]{figures/fig_scoring_workflow.pdf}
  \caption{Six-stage scoring workflow. Public identifiers and allele labels support
  local QC and effect-allele orientation before dosage values and, for private models,
  weight magnitudes enter the encrypted path. ACL and handle mechanics govern release
  but do not prove that submitted ciphertexts derive from the registered sample.}
  \label{fig:scoring_workflow}
\end{figure}""",
    "protocol": r"""\begin{figure}[t]
  \centering
  \includegraphics[width=\columnwidth,keepaspectratio]{figures/fig_protocol.pdf}
  \caption{Execution protocol comparison. The classic path persists SNP handles and
  supports a permissionless compute relayer; the streaming path fuses upload and
  compute with transient grants for a single signer. Across the measured Hardhat-mock
  100--5,000-variant range, streaming uses 35.4--37.2\% less host gas.}
  \label{fig:protocol}
\end{figure}""",
    "security": r"""\begin{figure}[t]
  \centering
  \includegraphics[width=\columnwidth,keepaspectratio]{figures/fig_security.pdf}
  \caption{Security boundary and retained trust. Contract invariants cover the fixed
  release policy, state machine, ACL grants, raw-score non-publication, finalization,
  and rate limits under explicit infrastructure assumptions. Biological sample
  authenticity, ciphertext/sample binding, model validity, calibration, ancestry
  portability, and formal model confidentiality remain outside the boundary.}
  \label{fig:security}
\end{figure}""",
}


def replace_labeled_figure(text: str, label: str, replacement: str) -> str:
    marker = f"\\label{{fig:{label}}}"
    marker_pos = text.index(marker)
    start = text.rfind("\\begin{figure", 0, marker_pos)
    if start < 0:
        raise ValueError(f"missing figure start for {label}")
    starred = text.startswith("\\begin{figure*}", start)
    end_token = "\\end{figure*}" if starred else "\\end{figure}"
    end = text.index(end_token, marker_pos) + len(end_token)
    return text[:start] + replacement + text[end:]


def build(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    figure_dir = output / "figures"
    figure_dir.mkdir(parents=True, exist_ok=True)

    text = SOURCE.read_text(encoding="utf-8")
    for label, replacement in FIGURES.items():
        text = replace_labeled_figure(text, label, replacement)

    # The arXiv public preprint is clean; the separately delivered reviewer PDF retains
    # line numbers for the point-by-point page/line references.
    text = text.replace("\\usepackage[switch]{lineno}\n", "")
    text = text.replace("\\linenumbers\n", "")
    (output / "bioeth_prs.tex").write_text(text, encoding="utf-8")
    shutil.copy2(BIBLIOGRAPHY, output / "bioeth_prs.bib")

    readme = """# New bioETH-PRS arXiv upload

Main source: `bioeth_prs.tex` (with `bioeth_prs.bbl` included for arXiv's TeX run)

This folder is a clean-source rebuild from the evidence-bounded RTR revision. The previous
`../arxiv_upload/` directory is preserved unchanged.

## Figure audit

All six raster figures in the previous upload were recreated because their labels or claims
were superseded by the revision:

| Previous asset | Reason for recreation | Revised asset |
|---|---|---|
| `graphical_abstract.png` | contained `trustless`, `zero trust`, and machine-epsilon claims | `graphical_abstract.pdf` |
| `fig_architecture.png` | described the release as DP and omitted retained trust | `fig_architecture.pdf` |
| `fig_quantization.png` | omitted the zero-point clamp and explicit rounding rule | `fig_quantization.pdf` |
| `fig_protocol.png` | used rounded pre-provenance gas values and one fixed output path | `fig_protocol.pdf` |
| `fig_security.png` | claimed consensus-enforced guarantees and DP noise | `fig_security.pdf` |
| `fig_gas_scaling.png` | used superseded gas totals | `fig_gas_scaling.pdf` |

Two new revision figures are also included: `fig_scoring_workflow.pdf` and
`fig_individual_agreement.pdf`. Every asset is vector PDF 1.4 with embedded text and no
external data dependency at TeX compile time.

## Compile

The package was verified from this directory with:

```sh
tectonic -X compile --keep-intermediates --keep-logs --outdir build bioeth_prs.tex
```

The manuscript labels Live fhEVM, Hardhat mock, and Analytic projection evidence separately.
The public 100-SNP workflow is the only live job; private weights remain mock-only.
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
