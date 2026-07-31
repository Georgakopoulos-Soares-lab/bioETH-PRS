# New bioETH-PRS arXiv upload

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
