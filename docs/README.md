# Documentation Map

This directory is organized by purpose so collaborators can find the right level of detail quickly.

## Start here

- [`../README.md`](../README.md): repo overview, setup, and current status
- [`architecture-roadmap.md`](architecture-roadmap.md): architecture, roadmap, and known risks
- [`onboarding/contributor-onboarding.md`](onboarding/contributor-onboarding.md): full educational onboarding guide

## Onboarding

- [`onboarding/contributor-onboarding.md`](onboarding/contributor-onboarding.md): biological, cryptographic, and system background
- [`onboarding/codebase-reading-guide.md`](onboarding/codebase-reading-guide.md): suggested reading order through the repo
- [`onboarding/concepts-cheatsheet.md`](onboarding/concepts-cheatsheet.md): quick concept reference
- [`onboarding/e2e-walkthrough-short.md`](onboarding/e2e-walkthrough-short.md): short end-to-end scenario
- [`onboarding/e2e-walkthrough-contract-grounded.md`](onboarding/e2e-walkthrough-contract-grounded.md): full contract-grounded end-to-end example with real `v1` state, permissions, quantization, and oracle handoff
- [`onboarding/colleague-briefing-pack.md`](onboarding/colleague-briefing-pack.md): speaker-oriented briefing guide — 30s / 2min / 5-10min formats, common Q&A

## Design

- [`design/overview.md`](design/overview.md): system design overview — publication, SNP upload, and compute
- [`design/model-marketplace.md`](design/model-marketplace.md): model publication lifecycle and marketplace controls
- [`design/snp-ingestion.md`](design/snp-ingestion.md): PRS job shell, SNP chunk upload, and compute lifecycle
- [`design/quantization.md`](design/quantization.md): signed-weight quantization and encoding

## Internal

- [`internal/design-decisions.md`](internal/design-decisions.md): rationale for every architectural choice — why FHE on a blockchain, why TFHE, why four contracts, why chunking works the way it does

## Reference

- [`reference/development-workflows.md`](reference/development-workflows.md): practical command guide for tests, advisor runs, and profiling
- [`reference/quantization-advisor.md`](reference/quantization-advisor.md): advisor workflow and interpretation
- [`reference/scaling-ceilings.md`](reference/scaling-ceilings.md): scale-vs-SNP quick-screen reference
- [`reference/sepolia-deployment.md`](reference/sepolia-deployment.md): Sepolia deployment pre-flight and execution guide
- [`reference/validation-strategy.md`](reference/validation-strategy.md): mock vs. Sepolia validation coverage comparison
- [`PIIS2667237525003078.pdf`](PIIS2667237525003078.pdf): HEPRS reference paper

## Reports

- [`../reports/mock-validation-findings.md`](../reports/mock-validation-findings.md): 100-SNP end-to-end mock baseline — gas, timing, and HCU probe results
- [`../reports/heprs-fixture-findings.md`](../reports/heprs-fixture-findings.md): HEPRS fixture profiling across all four sizes (100/500/1000/5000 SNPs)
- [`../reports/scaling-ceiling-findings.md`](../reports/scaling-ceiling-findings.md): generated scale ceiling findings
- [`../reports/advisor-findings.md`](../reports/advisor-findings.md): advisor findings across HEPRS fixtures
