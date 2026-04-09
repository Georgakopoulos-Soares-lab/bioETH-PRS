# Deployment Cost & Viability

**Date:** 9 April 2026
**Gas data from:** `npm run profile:heprs` — mock coprocessor, all four HEPRS fixture sizes
**Paths compared:** Classic (`appendSnpChunk` → `computeChunk`) and Streaming (`appendAndComputeChunk`)

---

## Actual Deployment Target

This project runs on Zama's fhEVM stack (`ZamaEthereumConfig`, `@fhevm/solidity`). The coprocessor contracts are deployed on Ethereum mainnet (chainId 1) and Sepolia (chainId 11155111). There is no other network target in the codebase today.

**The deployment path is:**

| Stage | Network | Purpose | Status |
|-------|---------|---------|--------|
| Development | Hardhat mock | Full-protocol simulation, no real gas | Active |
| Validation | Zama Sepolia | Real FHE operations, testnet ETH | Ready (blocked on credentials) |
| Production research | Zama fhEVM production chain | Real FHE, real gas, real users | Not yet launched (April 2026) |
| Long-term alternative | Fhenix / Inco Network / Polygon CDK appchain | If Zama pricing is unfavourable | Under evaluation |

**Bottom line on Ethereum L1:** Not a deployment target. Gas costs are prohibitive at any realistic gas price (see tables below). The fhEVM contracts are _compatible_ with L1 but nobody should pay L1 gas for per-patient genomic analysis.

---

## Gas-to-ETH Reference

All numbers below are from mock profiling. Sepolia expected within 10–20%.

### Classic path ETH costs

| SNPs | 1 gwei | 5 gwei | 30 gwei | 100 gwei |
|------|--------|--------|---------|---------|
| 100 | 0.0178 ETH | 0.0889 ETH | 0.5333 ETH | 1.778 ETH |
| 500 | 0.0838 ETH | 0.4191 ETH | 2.515 ETH | 8.383 ETH |
| 1,000 | 0.1666 ETH | 0.8331 ETH | 4.999 ETH | 16.66 ETH |
| 5,000 | 0.8284 ETH | 4.142 ETH | 24.85 ETH | 82.84 ETH |

### Streaming path ETH costs

| SNPs | 1 gwei | 5 gwei | 30 gwei | 100 gwei |
|------|--------|--------|---------|---------|
| 100 | 0.01146 ETH | 0.0573 ETH | 0.3439 ETH | 1.146 ETH |
| 500 | 0.05294 ETH | 0.2647 ETH | 1.588 ETH | 5.295 ETH |
| 1,000 | 0.10484 ETH | 0.5242 ETH | 3.145 ETH | 10.48 ETH |
| 5,000 | 0.51985 ETH | 2.599 ETH | 15.60 ETH | 51.99 ETH |

---

## What Gas Price to Expect on Each Network

| Network | Typical gas price | Notes |
|---------|-----------------|-------|
| Ethereum L1 (mainnet) | 5–80 gwei | Wide variance; often 10–30 gwei |
| Zama Sepolia (testnet) | Free (testnet ETH) | Gas structure mirrors L1; not a cost benchmark |
| Zama fhEVM production chain | **Unknown** | Not launched. May use custom gas metering for FHE ops. |
| Fhenix testnet | ~0.001–0.01 gwei effective | Purpose-built FHE L2; production pricing TBD |
| Inco Network | ~0.01 gwei effective | Privacy-focused EVM chain; production pricing TBD |
| Polygon CDK appchain | ~0.001–0.01 gwei | Custom appchain; gas price operator-controlled |

The critical unknown is Zama's production chain pricing. If they price FHE operations at Ethereum L1 equivalence, costs are unacceptable. If they price at L2 equivalence (~0.01–0.1 gwei), the system becomes commercially viable.

---

## Financial Viability by Network Scenario

Using streaming path (lower cost, preferred for solo-requester flows):

### Scenario A — Zama production at L1 pricing (30 gwei)

| SNPs | ETH cost | USD @ $1,500 | USD @ $3,000 |
|------|----------|-------------|-------------|
| 100 | 0.34 ETH | $515 | $1,030 |
| 500 | 1.59 ETH | $2,380 | $4,760 |
| 1,000 | 3.15 ETH | $4,718 | $9,435 |

**Verdict: Not viable for clinical or commercial use at any scale.**

### Scenario B — Zama production at L2-equivalent pricing (0.05 gwei)

| SNPs | ETH cost | USD @ $1,500 | USD @ $3,000 |
|------|----------|-------------|-------------|
| 100 | 0.000573 ETH | $0.86 | $1.72 |
| 500 | 0.002647 ETH | $3.97 | $7.94 |
| 1,000 | 0.005242 ETH | $7.86 | $15.73 |
| 5,000 | 0.025993 ETH | $38.99 | $77.98 |

**Verdict: Viable for 100–500 SNP models. Marginal for 1,000 SNPs. Still expensive for 5,000 SNPs.**

### Scenario C — Dedicated appchain (0.001 gwei)

| SNPs | ETH cost | USD @ $3,000 |
|------|----------|-------------|
| 100 | 0.0000115 ETH | $0.034 |
| 500 | 0.0000529 ETH | $0.159 |
| 1,000 | 0.0001048 ETH | $0.314 |
| 5,000 | 0.0005199 ETH | $1.560 |

**Verdict: Fully viable across all SNP counts. Competitive with centralized alternatives.**

---

## Competitive Benchmark

For context, comparable centralized clinical services:

| Service | Cost per analysis | Privacy model |
|---------|-----------------|--------------|
| 23andMe / AncestryDNA (consumer) | $99–$299 (full genotype + many traits) | Centralized; plaintext data shared with operator |
| Clinical PRS panel (commercial lab) | $50–$500 per patient | Centralized; data sent to lab |
| Pharmacogenomics panel (clinical) | $200–$800 | Centralized |
| Research cohort analysis (bulk) | $20–$100 per sample | Centralized |

**The confidentiality premium:** This system provides a cryptographic guarantee that no validator, operator, or infrastructure provider ever sees plaintext genotype data. That's a meaningful differentiator vs all centralized alternatives — worth a price premium if the base cost is reasonable.

At Scenario B pricing (L2-equivalent), a 100-SNP analysis at ~$1–$2 is clearly competitive. At Scenario A pricing (L1), the premium is irrelevant because the cost is indefensible.

---

## Realistic SNP Ceiling by Scenario

PRS models in clinical use span a wide range. The table below shows what's economically viable at each pricing scenario:

| Model type | Typical SNP count | Scenario A viable? | Scenario B viable? | Scenario C viable? |
|------------|-------------------|-------------------|-------------------|-------------------|
| Curated high-impact (simple) | 100–300 | No ($500–$1,500) | Yes ($1–$5) | Yes (<$0.10) |
| Standard polygenic | 500–2,000 | No ($2,400–$9,500) | Marginal ($8–$32) | Yes ($0.16–$0.63) |
| Complex (HEPRS full) | 5,000 | No ($38,500) | No ($78) | Yes ($1.56) |
| Large-scale (LDPred2) | 50,000+ | No | No | Marginal ($15+) |
| Genome-wide | 500,000+ | No | No | No ($150+) |

**This system is designed for curated PRS models (100–5,000 SNPs), not genome-wide analysis.** That is the correct scope for clinical decision support; genome-wide PRS requires fundamentally different infrastructure.

---

## Break-Even Analysis

For a $50 per-analysis target cost (reasonable for clinical genomics), streaming path, 100 SNPs (0.01146 ETH):

```
$50 / 0.01146 ETH = ETH price ceiling of $4,363 at 1 gwei
$50 / 0.01146 ETH = $4,363 / 30 = ETH price ceiling of $145 at 30 gwei
```

At 30 gwei L1 pricing, even a $50 target requires ETH below $145 — not a realistic assumption. The $50 target only works at sub-1 gwei effective gas prices, which requires a dedicated chain.

---

## Recommendation

**Use the streaming path (`appendAndComputeChunk`) as the default for all new deployments.** It saves 37% gas with no functional downside for single-requester flows. The classic path remains available for multi-party architectures.

**Deployment target priority:**

1. **Now**: Zama Sepolia — validate real FHE correctness and measure actual gas vs mock
2. **Production**: Await Zama fhEVM production chain launch. Evaluate gas pricing before committing.
   - If pricing ≈ L2: deploy. Target 100–500 SNP models for clinical pilot.
   - If pricing ≈ L1: do not deploy on Zama mainnet. Proceed to option 3.
3. **Fallback**: Evaluate Fhenix L2 or Inco Network. Both are fhEVM-compatible with lower cost structures. Track their production launches (both in active development as of April 2026).
4. **Long-term**: Custom Polygon CDK appchain with operator-controlled gas gives full pricing control. Viable if the project reaches institutional deployment scale.

**One thing to confirm on Sepolia:** whether the HCU ceiling allows computeChunkSize > 20. If it does (e.g. 32), streaming would accept 32 SNPs per tx instead of 20, reducing transaction count by 37% and total cost by an additional ~5–10%.
