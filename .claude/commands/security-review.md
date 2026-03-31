# Security Review — bioETH PRS

You are performing a security audit of the bioETH PRS smart contracts. This project uses Fully Homomorphic Encryption (fhEVM / TFHE) on Ethereum, so the threat model covers both standard Solidity vulnerabilities **and** FHE-specific attack vectors.

Read the contracts in `contracts/` and check every category below. For each finding, report:

- **Severity**: Critical / High / Medium / Low / Info
- **Location**: file + line number
- **Issue**: what the vulnerability is
- **Impact**: what an attacker can do
- **Mitigation**: concrete fix or next step

---

## Checklist

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
- [ ] Check for integer underflow in chunk index arithmetic — e.g., if `totalChunks` is 0, does the state machine get stuck or allow premature finalization?
- [ ] Check for job ID collision or enumeration attacks: can a user interfere with another user's job by guessing the job ID?

### 4. Access Control & Authorization

- [ ] `GenomicRegistry`: Can anyone call `grantAccess` or `revokeAccess` for a sample they don't own?
- [ ] `ModelMarketplace`: Can anyone append chunks to a model they didn't create? Can anyone call `finalizeModel` on someone else's model?
- [ ] `PRSComputeEngine`: Is `createPRSJob` gated on whether the caller has registry ACL for the sample? (Known gap per architecture-roadmap.md § 7-A — confirm it is documented but flag severity.)
- [ ] `computeChunk` permissionless relay: Is it documented that any caller can advance a job's computation? If not intentional, this is a griefing vector.
- [ ] `ResultOracle.classify()`: Can this be called by anyone, or only by the PRS engine? Check for missing `onlyEngine` / `onlyOwner` modifiers.

### 5. Differential Privacy — Noise Supply

- [ ] `ResultOracle.classify()` accepts `encryptedNoise` from the caller. A malicious caller can pass `TFHE.asEuint64(0)`, defeating all DP guarantees and enabling model weight extraction. Confirm this is either mitigated (on-chain noise, commitment scheme) or documented as a known risk.
- [ ] Check that threshold values for categorical classification (Low/Med/High) are not hardcoded in a way that lets an adversary infer the exact boundaries through repeated queries.

### 6. Standard Solidity Vulnerabilities

- [ ] **Reentrancy**: Any function that makes an external call (`transfer`, `call`, interface call to another contract) before updating state. Apply checks-effects-interactions.
- [ ] **Integer overflow/underflow**: Solidity 0.8.x has built-in revert on overflow for plain integers, but check any `unchecked` blocks.
- [ ] **tx.origin authentication**: Never use `tx.origin` for authorization — must use `msg.sender`.
- [ ] **Block.timestamp / block.number manipulation**: Any time-dependent logic (job expiry, deadline) that an adversarial miner could exploit.
- [ ] **Uninitialized storage pointers**: Check for storage variables that may be read before being written.
- [ ] **Denial of service via gas**: Any loop over an unbounded array (e.g., iterating all jobs, all model chunks). If unbounded, confirm the loop is bounded in practice by the chunked lifecycle.
- [ ] **Event-log data exposure**: Any event that emits plaintext SNP values, raw weights, or intermediate encrypted handles that should remain private.

### 7. Mock vs Production Boundary

- [ ] Confirm `contracts/fhevm/FHE.sol` (the mock) is **not** imported directly by production contracts. Production contracts must import `./TFHE.sol` which routes to the real `@fhevm/solidity` package on Sepolia.
- [ ] In mock mode, `euint64` is `uint64` and all FHE ops are plaintext — this means ACL is not enforced and any test passing in mock does not prove real-FHE security. Note which tests would need Sepolia re-run.

### 8. Model Integrity & Marketplace Trust

- [ ] Can a malicious researcher upload NaN / infinity / extreme-valued weights that cause overflow in downstream computation?
- [ ] Can a model be re-finalized or have chunks appended after it is finalized?
- [ ] Is model metadata (SNP count, chunk size, scaling factor) validated on upload, or can it be spoofed?

---

## Output Format

For each issue found, use:

```
### [SEVERITY] Short title
**Location**: contracts/Foo.sol:42
**Issue**: ...
**Impact**: ...
**Mitigation**: ...
```

Group findings by severity (Critical → High → Medium → Low → Info). At the end, provide a one-paragraph summary of the overall security posture and the top 3 highest-priority fixes.
