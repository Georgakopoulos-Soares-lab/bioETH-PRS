# Validation Strategy for the bioETH PRS Paper

> Last updated: 3 April 2026  
> Authors: bioETH PRS team  
> Purpose: Internal reference for deciding how far to push experimental validation before paper submission

---

## Background

The bioETH PRS system runs encrypted Polygenic Risk Scoring (PRS) on-chain using Fully Homomorphic Encryption (fhEVM / Zama). The core claim is that a PRS dot product can be computed over encrypted genomic data without any plaintext DNA ever touching validators or the chain.

To support this claim in a paper, we need to measure:

- **Correctness** — does the on-chain computation produce the right score?
- **Gas cost** — how expensive is it per SNP, per phase, and in total?
- **Latency** — how long does a full job take end-to-end?
- **Protocol fidelity** — do real FHE handles, ACL, and input proofs behave as designed?

The question is: how do we obtain these measurements?

---

## The Three Validation Tiers

### Tier 1 — Mock Coprocessor (Local Hardhat)

**What it is:**  
`@fhevm/hardhat-plugin` replaces Zama's real coprocessor with a local process that performs all protocol validation (handles, ACL enforcement, input proof verification, event emission) but uses **plaintext arithmetic** instead of real TFHE ciphertexts.

**Status: Done.** All measurements in this tier are complete.

**What it validates:**
- Protocol correctness end-to-end (create job → upload SNPs → compute → finalize)
- Gas consumption for non-FHE overhead (storage writes, state machine transitions, calldata)
- HCU ceiling (mock: max chunkSize = 20)
- V1 quantization formula is bit-exact across all fixtures (100 / 500 / 1000 / 5000 SNPs)
- Registry ACL enforcement at job creation
- `JobFinalized` event emission and decryption path

**Key numbers measured:**

| Fixture | Total gas | Transactions | Mock wall-clock |
|---:|---:|---:|---:|
| 100 SNPs | 18.7M | 25 tx | ~373 ms |
| 500 SNPs | 88.5M | 105 tx | ~1,593 ms |
| 1000 SNPs | 175.8M | 205 tx | ~3,063 ms |
| 5000 SNPs | 873.9M | 1,005 tx | ~15,341 ms |

Gas scales linearly at ~175K gas per SNP. Upload dominates (56%), compute is second (36%).

**What it cannot tell us:**
- Real TFHE ciphertext latency (bootstrapping, KMS re-encryption) — mock latencies are developer feedback only, orders of magnitude faster than real FHE
- Actual Sepolia precompile gas costs (FHE precompiles have different gas schedules)
- Real HCU budget on Sepolia (mock ceiling may not match production ceiling)
- Whether the user decryption flow (EIP-712 → Zama relayer → KMS) works end-to-end

**Paper claim level:** Correctness and architecture feasibility only.  
> _"We validate the protocol on the `@fhevm/hardhat-plugin` mock coprocessor, which performs full protocol validation with plaintext arithmetic. Gas and correctness results hold; latencies reflect local mock overhead only."_

---

### Tier 2 — Sepolia Testnet (Real FHE, Zama-hosted coprocessor)

**What it is:**  
Deploy the same contracts (no code changes needed) to the Ethereum Sepolia testnet, where Zama runs a production-grade coprocessor with real TFHE ciphertext operations. All FHE multiplications and additions are computed with actual fully homomorphic encryption.

**Status: Not yet run.** All tooling is built and ready.

**What it adds over Tier 1:**
- Real TFHE ciphertext flow (ciphertexts are actual FHE-encrypted values, not mock handles)
- Real end-to-end latency (includes TFHE bootstrapping time, Zama coprocessor queue, KMS re-encryption round-trip)
- Real fhEVM precompile gas costs (may differ significantly from mock)
- Real HCU budget (Sepolia HCU limit may allow chunkSize >> 20, which would reduce transaction count substantially)
- User decryption via `userDecryptEuint` (EIP-712 signing + KMS gateway round-trip)
- Evidence that the contracts deploy and run on a real EVM-compatible chain

**What is needed to run it:**

| Requirement | Notes |
|---|---|
| Sepolia ETH | ~0.1–0.2 ETH covers deploy + 100-SNP validation + HCU probe |
| `MNEMONIC` | 12- or 24-word wallet seed phrase, set via `npx hardhat vars set MNEMONIC` |
| `INFURA_API_KEY` | Free-tier Infura project ID for Sepolia RPC, or omit to use public Ankr endpoint |

**Steps (all tooling already written):**

```sh
# 1. Deploy all 4 contracts
npm run deploy:sepolia          # → deployments/sepolia.json

# 2. Run 100-SNP end-to-end validation with real TFHE
npm run validate:sepolia        # → deployments/sepolia-validation-100snp.json

# 3. Find the real HCU ceiling
npm run probe:hcu               # → deployments/sepolia-hcu-probe.json
```

Expected runtime: **15–90 minutes** (depending on Sepolia congestion and Zama coprocessor queue depth). This is a one-time run.

**What we get from it:**
- Real per-phase gas costs (publishModel, uploadSnps, computeChunk, finalize)
- Real end-to-end latency (wall-clock from job creation to decrypted score)
- Real HCU ceiling → optimal chunkSize for production
- Confirmation that ciphertext correctness holds (decrypted Sepolia score = expected plaintext)
- Proof that the system is deployable on a real public chain

**Paper claim level:** Full feasibility including performance and cost.  
> _"We deploy bioETH PRS to the Ethereum Sepolia testnet and validate end-to-end with real TFHE ciphertexts. A 100-SNP PRS completes in X minutes, consuming Y gas at a cost of Z ETH at current Sepolia prices."_

---

### Tier 3 — Local Docker Devnet (Real FHE, Self-hosted)

**What it is:**  
Running the full Zama coprocessor stack locally in Docker (Ethereum node + coprocessor service + KMS gateway). This would give real FHE measurements without requiring testnet ETH or network access.

**Status: Not available.**

Zama's current coprocessor architecture (v0.11.x, which this project uses) does not expose a supported local Docker image for self-hosting the coprocessor. The older Docker image (`ghcr.io/zama-ai/ethermint-dev-node:v0.4.2`) was for an earlier Ethermint-based fhEVM architecture that is incompatible with the current `@fhevm/solidity` library. Zama's documentation page for "local dev node" is either removed or in progress.

**Conclusion: This tier is not currently achievable.** Sepolia is the only path to real FHE measurements with the current library version.

---

## Side-by-Side Comparison

| Capability | Tier 1 (Mock) | Tier 2 (Sepolia) | Tier 3 (Local Docker) |
|---|:---:|:---:|:---:|
| Protocol correctness | ✓ | ✓ | ✓ |
| Gas scaling trends | ✓ | ✓ | ✓ |
| Real FHE ciphertexts | ✗ | ✓ | ✓ |
| Accurate gas costs (precompiles) | ✗ | ✓ | ✓ |
| Real latency (bootstrapping) | ✗ | ✓ | ✓ |
| Real HCU ceiling | ✗ | ✓ | ✓ |
| KMS decryption round-trip | ✗ | ✓ | ✓ |
| Requires ETH / credentials | ✗ | ✓ | ✗ |
| Currently available | ✓ | ✓ | ✗ |
| Hardware requirements | Any laptop | Any laptop | Powerful server (FHE is CPU-intensive) |
| Estimated time to run | Done | 1–2 hours | Not available |

---

## Recommendation for the Paper

### Option A — Mock only (conservative, immediately available)

Frame all results as mock-coprocessor baseline. Be explicit in the paper that latencies are developer-feedback and gas costs are non-FHE overhead only. Defer real-chain measurements to future work.

**Strengths:** No additional work required.  
**Weaknesses:** Reviewers may push back on missing real-FHE performance evidence. Cannot claim the system "works on a real blockchain."

---

### Option B — Mock + Sepolia (recommended)

Run the Sepolia validation once. This is a ~1–2 hour operation using tooling that is already written and tested. It produces:
- Real gas cost tables for the paper
- Real latency numbers (at least for the 100-SNP fixture)
- Confirmation that real TFHE ciphertexts flow correctly through the full pipeline
- Real HCU ceiling, which also enables Priority 2 (decoupling upload/compute chunk sizes)

**Strengths:** Closes all major empirical gaps in the paper. Strong evidence for feasibility.  
**Weaknesses:** Requires ~0.1–0.2 Sepolia ETH and a wallet mnemonic. Sepolia ETH is free from faucets.

---

## What Changes After Sepolia

Once the Sepolia run completes, these paper claims become available:

1. **Real cost estimate** — "A 100-SNP PRS costs X ETH / Y USD on Sepolia at [date] gas prices"
2. **Real latency** — "End-to-end job completion (including TFHE bootstrapping and KMS re-encryption) takes X–Y minutes for 100 SNPs"
3. **HCU ceiling** — "The real Sepolia HCU budget allows chunkSize = Z, requiring N transactions for a 5000-SNP PRS"
4. **Ciphertext correctness** — "The on-chain result, decrypted via the Zama KMS, matches the expected plaintext PRS value"
5. **Deployment evidence** — "Contracts are deployed at addresses [A, B, C, D] on Sepolia (chainId 11155111)"

These results also feed back into:
- `docs/architecture-roadmap.md §7-I` — "Sepolia observed" column
- `reports/sepolia-validation-findings.md` — timing and gas report
- `docs/design/snp-ingestion.md` — real HCU ceiling
- `todo.md` Priority 2 — decouple upload/compute chunk sizes now that the real compute ceiling is known

---

## What Sepolia Does NOT Validate

Even with Sepolia results, the following remain as future work or explicit limitations:

- **Differential privacy calibration** — `noiseUpperBound` is a deployer parameter. Formal DP analysis (ε-value, noise calibration against real score distributions, query budget) is not yet done.
- **Clinical utility comparison** — de-quantized on-chain scores have not been compared against reference tools (PLINK / PRSice) for MSE, rank correlation, or AUC.
- **Production scale** — Sepolia is a testnet. Mainnet gas prices and congestion differ. The system is not cost-optimized for mainnet.
- **Key management** — the current design relies on the Zama KMS for re-encryption. Production deployments require a trust analysis of the KMS operator.

---

## Files to Create After Sepolia Run

| File | Contents |
|---|---|
| `deployments/sepolia.json` | Contract addresses (auto-generated by deploy script) |
| `deployments/sepolia-validation-100snp.json` | Per-phase timing and gas (auto-generated) |
| `deployments/sepolia-hcu-probe.json` | HCU probe results per chunkSize (auto-generated) |
| `reports/sepolia-validation-findings.md` | Human-readable report (manual, template in `docs/reference/sepolia-deployment.md`) |

---

## Appendix — Current Test Coverage

As of 3 April 2026:

- **69 tests pass** under the mock coprocessor (~20 s)
- All 50 individuals × 4 GWAS fixtures (200 overflow checks) verified safe within `uint64` bounds
- 100-SNP end-to-end validated with score 758,685 matching expected plaintext dot product
- HCU ceiling empirically confirmed: mock ceiling is 20 < C ≤ 25 (corrected from prior claim of 10)
- DP noise generation: on-chain via `FHE.randEuint64(noiseUpperBound)`, zero-noise loophole closed
