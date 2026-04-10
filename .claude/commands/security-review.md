# Security Review — bioETH PRS

You are performing a security audit of the bioETH PRS smart contracts. This project uses Fully Homomorphic Encryption (fhEVM / TFHE) on Ethereum, so the threat model covers both standard Solidity vulnerabilities **and** FHE-specific attack vectors.

Read **all** contracts before producing findings:

- [`contracts/GenomicRegistry.sol`](../../contracts/GenomicRegistry.sol)
- [`contracts/ModelMarketplace.sol`](../../contracts/ModelMarketplace.sol)
- [`contracts/PRSComputeEngine.sol`](../../contracts/PRSComputeEngine.sol)
- [`contracts/ResultOracle.sol`](../../contracts/ResultOracle.sol)
- [`contracts/legacy/HEPRS.sol`](../../contracts/legacy/HEPRS.sol) — legacy standalone (no marketplace)

Supporting context (read as needed):

- [`docs/design.md`](../../docs/design.md) — threat model, state machine spec, quantization math, known gaps
- [`CLAUDE.md`](../../CLAUDE.md) — security invariants section

---

## Audit Checklist

### 1. FHE Access Control (ACL)

- [ ] Every `euint64` / `euint8` / `ebool` handle returned to or stored for a user must have `FHE.allow(handle, address)` called before the function returns. Missing `allow` calls mean the recipient can never decrypt their result.
- [ ] `FHE.makePubliclyDecryptable()` must only be called on **coarse categorical outputs** (`euint8` risk category). It must **never** be called on raw PRS scores (`euint64 partialSum` or `finalScore`).
- [ ] Check that the `allow` recipient is the correct party — not `address(this)` or a hardcoded address by mistake.
- [ ] Check that ciphertext handles are not leaked in events or public return values when they should be private.

### 2. Quantization Overflow (uint64 ceiling)

- [ ] For each model registered in tests or scripts: verify that `scalingFactor × 2 × N_snps < 2^64` (≈ 1.84×10^19).
- [ ] Check that negative/signed GWAS weights are handled correctly — if the project uses an offset encoding for negative weights, verify the offset is applied consistently on both the weight upload and the accumulation side.
- [ ] Check for silent truncation: in mock mode `euint64` is a plain `uint64`, so overflow wraps silently. Document the safe ceiling for each fixture size.

### 3. State Machine Integrity (PRSComputeEngine)

- [ ] Verify that `computeChunk` cannot be called before `finalizeSnpUpload` sets the job to READY.
- [ ] Verify that `appendSnpChunk` cannot be called after `finalizeSnpUpload` (no double-upload).
- [ ] Verify that `finalize` cannot be called before all compute chunks are processed (`nextComputeIndex == totalChunks`).
- [ ] Verify streaming vs classic path mutual exclusion: `appendAndComputeChunk` rejects if `uploadedSnpCount > 0`; `appendSnpChunk` rejects if streaming has started.
- [ ] Check for integer underflow in chunk index arithmetic — e.g., if `totalChunks` is 0, does the state machine get stuck or allow premature finalization?
- [ ] Check for job ID collision or enumeration attacks: can a user interfere with another user's job by guessing the job ID?

### 4. Access Control & Authorization

- [ ] `GenomicRegistry`: Can anyone call `grantAccess` or `revokeAccess` for a sample they don't own?
- [ ] `ModelMarketplace`: Can anyone append chunks to a model they didn't create? Can anyone call `finalizeModel` on someone else's model?
- [ ] `PRSComputeEngine`: Confirm `createPRSJob` calls `GenomicRegistry.hasAccess(sampleId, msg.sender)` and reverts if the caller lacks registry ACL. This is implemented — verify the guard is actually called.
- [ ] `computeChunk` permissionless relay: Is it documented that any caller can advance a job's computation? If not intentional, this is a griefing vector.
- [ ] `ResultOracle.classify()`: Can this be called by anyone, or only by the PRS engine? Check for missing `onlyEngine` / `onlyOwner` modifiers.

### 5. Differential Privacy — Noise Supply

- [ ] `ResultOracle` must generate noise entirely on-chain via `FHE.randEuint64(noiseUpperBound)`. Confirm there is no path for a caller to supply or influence the noise ciphertext — the old caller-supplied noise parameter was removed in April 2026.
- [ ] `noiseUpperBound` must be immutable. Mutable bounds allow an attacker to set bound=1 (effectively zero noise) before querying.
- [ ] `expectedNoiseBias()` returns `noiseUpperBound/2`. Confirm callers add this to thresholds before calling `classify` or `finalizeAndClassify`.
- [ ] Check that threshold values for categorical classification (Low/Med/High) are caller-supplied — confirm the design rationale (generic oracle) is documented and DP noise mitigates threshold probing.

### 6. Standard Solidity Vulnerabilities

- [ ] **Reentrancy**: Any function that makes an external call (`transfer`, `call`, interface call to another contract) before updating state. Apply checks-effects-interactions.
- [ ] **Integer overflow/underflow**: Solidity 0.8.x has built-in revert on overflow for plain integers, but check any `unchecked` blocks.
- [ ] **tx.origin authentication**: Never use `tx.origin` for authorization — must use `msg.sender`.
- [ ] **Block.timestamp / block.number manipulation**: Any time-dependent logic (job expiry, deadline) that an adversarial miner could exploit.
- [ ] **Uninitialized storage pointers**: Check for storage variables that may be read before being written.
- [ ] **Denial of service via gas**: Any loop over an unbounded array (e.g., iterating all jobs, all model chunks). If unbounded, confirm the loop is bounded in practice by the chunked lifecycle.
- [ ] **Event-log data exposure**: Any event that emits plaintext SNP values, raw weights, or intermediate encrypted handles that should remain private.

### 7. Mock vs Production Boundary

- [ ] Confirm all production contracts import from `@fhevm/solidity/lib/FHE.sol` and inherit `ZamaEthereumConfig` from `@fhevm/solidity/config/ZamaConfig.sol`. Old transparent mock files are archived in `mock-archive/` and must not be imported.
- [ ] In mock mode (`@fhevm/hardhat-plugin`), FHE ops perform plaintext arithmetic — ACL grants are tracked but ciphertext confidentiality is not enforced. Tests passing in mock do not prove real-FHE security. Note which behaviors require Sepolia re-validation (see `docs/reference.md § Validation Tiers`).

### 8. Model Integrity & Marketplace Trust

- [ ] Can a malicious researcher upload NaN / infinity / extreme-valued weights that cause overflow in downstream computation?
- [ ] Can a model be re-finalized or have chunks appended after it is finalized?
- [ ] Is model metadata (SNP count, chunk size, scaling factor) validated on upload, or can it be spoofed?

---

## Severity Definitions

| Severity | Definition |
|---|---|
| Critical | Direct loss of funds, complete bypass of access control, or plaintext genomic data exposure |
| High | Decryption of another user's score or weight without authorization; DP noise fully bypassable |
| Medium | Access control bypass that grants elevated read/write permissions; state machine skippable |
| Low | Missing guard that has no current exploit path but creates risk under certain conditions |
| Info | Design notes, documentation gaps, or recommendations that do not constitute vulnerabilities |

---

## Output Format

For each finding:

```
[SEVERITY] Contract.function (file:line)
Description: what the vulnerability is and why it matters in the FHE/genomic context.
Exploit path: how an attacker would trigger it.
Recommendation: specific code or design change to fix it.
```

After all findings, provide:

1. **Summary table** — one row per finding with severity and contract
2. **Key security properties confirmed** — list each invariant from `CLAUDE.md § Security Invariants` and state whether it holds
3. **Comparison to current standards** — reference relevant audit standards:
   - [Trail of Bits FHE Security](https://github.com/trailofbits/publications)
   - [Zama fhEVM Security Model](https://docs.zama.ai/fhevm)
   - [OpenZeppelin Contracts audit best practices](https://docs.openzeppelin.com/contracts)
   - [SWC Registry](https://swcregistry.io/) for standard Solidity issues
   - NIST SP 800-188 (De-identification of genomic data) for genomic privacy context

---

## Context: Known Accepted Risks

These are documented design decisions that should be noted but not re-flagged as new findings unless the implementation deviates from the documented intent:

- **Permissionless `computeChunk`**: Any address may relay computation. Documented in `docs/design.md`. Griefing impact is limited (no state corruption possible; only wasted compute gas for the relayer).
- **Caller-supplied thresholds in `ResultOracle.classify()`**: `lowThreshold` and `highThreshold` are caller-supplied. Threshold probing is mitigated by the minimum threshold gap check (`highThreshold - lowThreshold >= noiseUpperBound`) and DP noise.
- **Uniform noise (not Laplacian)**: `FHE.randEuint64(noiseUpperBound)` produces uniform noise. Formal DP calibration is future work. Documented in `docs/design.md §7`.
- **No job expiry**: Abandoned jobs are a known storage griefing vector. Documented in `docs/design.md §7`.
- **Sybil attacks bypass per-wallet rate limiting**: Rate limiting is enforced per wallet per model. Multiple wallets circumvent it. The trust boundary is the authorization layer (private model reader approval). Documented in `docs/design.md §7`.
