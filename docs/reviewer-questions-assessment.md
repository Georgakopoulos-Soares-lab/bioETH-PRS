# Reviewer Questions: Author Response and Implementation Status

**Date:** 28 April 2026

This document answers the reviewer questions directly and records which items
were implemented in the codebase. It is intentionally conservative: where the
prototype depends on Zama fhEVM protocol behavior or lacks live testnet data, we
state that explicitly rather than overclaiming.

## Implementation Summary

| # | Topic | Status in this repo |
|---|---|---|
| 1 | fhEVM/TFHE parameters and live latency | Documented as inherited from Zama; no live Sepolia numbers claimed. |
| 2 | Coprocessor correctness | Documented as a Zama protocol assumption, not app-level verification. |
| 3 | KMS governance and failure model | Documented as threshold-MPC/KMS protocol dependency. |
| 4 | Input proof and sample provenance | Partly implemented: sample manifest hash anchor added. |
| 5 | Sybil attacks against quotas | Partly implemented: limits now apply per wallet and per sample. |
| 6 | Randomness manipulation | Documented; no VRF/commit-reveal added. |
| 7 | Formal `(epsilon, delta)` DP | Wording fixed: current oracle is DP-inspired, not formal DP. |
| 8 | Live fhEVM testnet execution | Tooling present; live deployment not completed because funded Sepolia credentials are unavailable. |
| 9 | Timing/resource side channels | Documented as fixed public execution shape at contract level; coprocessor side channels out of scope. |
| 10 | Private-model keying and revocation | Existing ACL model clarified; revocation is future-only, not retroactive. |

## 1. fhEVM/TFHE parameters, security levels, bootstrapping, latency

**Reviewer question:** What are the concrete fhEVM/TFHE parameter sets, security
levels, and bootstrapping frequencies assumed, and how do they affect latency
and throughput when running with actual ciphertexts, not in the mock?

**Answer:** The application contracts do not choose TFHE parameters,
bootstrapping schedules, or security levels. Those are inherited from the Zama
fhEVM network reached through `@fhevm/solidity` and `ZamaEthereumConfig`. The
application controls model size, upload chunk size, compute chunk size, and
transaction sequencing; it does not tune the cryptographic parameter set.

**Implemented/documented:** The docs now state that mock-mode timings are not
real ciphertext timings and that real measurements require the Sepolia
validation/probe scripts:

```bash
npm run deploy:sepolia
npm run validate:sepolia
npm run probe:hcu
```

**Remaining limitation:** We do not claim live ciphertext latency or throughput.
The current repo has mock measurements and live-measurement tooling, but no
completed funded Sepolia run. The appropriate paper wording is:

> Cryptographic parameters and bootstrapping behavior are inherited from the
> deployed fhEVM network. This prototype reports local mock measurements and
> provides scripts for live Sepolia validation, but does not claim live
> ciphertext throughput unless those scripts are run on a funded deployment.

## 2. Coprocessor correctness

**Reviewer question:** How is coprocessor correctness enforced in practice? Is
there any form of cryptographic attestation or verifiable-computation proof that
nodes can check, beyond trusting replicated off-chain services?

**Answer:** This is enforced by the fhEVM protocol layer, not by these PRS
contracts. The contracts emit symbolic FHE operations through Zama host
contracts. Zama's protocol documentation describes coprocessors that verify
encrypted inputs, execute FHE operations, maintain ACL replicas, sign verified
handles, publish ciphertext commitments, and rely on Gateway consensus and
operator incentives.

**Implemented/documented:** The reviewer response now states that the PRS
contracts do not verify TFHE computation proofs themselves.

**Remaining limitation:** Ethereum validators do not independently verify every
TFHE ciphertext transition inside this application. Adding app-level proofs for
every FHE operation would be a separate research project and would likely
invalidate the current performance model.

Recommended wording:

> Coprocessor correctness is inherited from the Zama Gateway/coprocessor
> protocol. The PRS contracts do not perform on-chain TFHE proof verification;
> they rely on the deployed fhEVM network's attestations, commitments,
> consensus, and operator security assumptions.

## 3. KMS/decryption governance and failure model

**Reviewer question:** How is KMS/decryption infrastructure governed and secured?
Who holds decryption keys, and what is the failure model if the KMS or a
validator misbehaves or is coerced?

**Answer:** The application does not hold FHE private keys. Decryption is
handled by Zama's KMS/Gateway infrastructure. Zama describes the KMS as a
threshold MPC network that generates and secret-shares the global FHE private
key; decryption outputs are signed and routed through the Gateway.

**Implemented/documented:** The docs now make this a protocol dependency rather
than an application guarantee.

**Failure model to state:**

- If the KMS threshold/honest-majority assumptions hold, individual KMS parties
  cannot decrypt alone.
- If enough KMS parties are compromised or coerced, plaintext confidentiality
  may fail.
- If the KMS or Gateway censors or becomes unavailable, authorized users may be
  unable to decrypt outputs.
- Ethereum validators still have ordinary transaction-ordering and censorship
  power, but do not learn plaintext genotypes from contract execution.

## 4. Input-proof binding and sample provenance

**Reviewer question:** Can you elaborate on the "input-proof" that binds uploaded
SNP handles to a registered sample and prevents arbitrary fabricated
ciphertexts? Is there any provenance or integrity check beyond ACL?

**Answer:** The fhEVM input proof validates ciphertext well-formedness and binds
encrypted handles to the caller and target contract. In this codebase, calls
such as `appendSnpChunk`, `appendAndComputeChunk`, and
`appendEncryptedModelChunk` import encrypted values with `FHE.fromExternal`.
That does not prove that SNP ciphertexts came from a particular VCF, lab,
registered sample URI, or genotype range.

**Implemented:** `GenomicRegistry` now supports sample provenance anchoring:

- `registerSampleWithManifest(uri, manifestHash)`
- `getSampleManifestHash(sampleId)`
- `SampleManifestHashSet(sampleId, manifestHash)`

The manifest hash can commit to source file hash, lab signature metadata,
genome build, SNP order, and genotype encoding rules.

**Remaining limitation:** The manifest hash is an anchor, not a proof. The
contract still cannot verify that uploaded encrypted SNP handles match the
manifest. Stronger provenance would require a lab signature/verifiable
credential gate or a ZK proof tying encrypted inputs to a committed sample
manifest. In-FHE genotype range checks are possible but add per-SNP comparisons
and HCU cost.

## 5. Sybil attacks against per-wallet quotas

**Reviewer question:** How do you mitigate Sybil attacks against the per-wallet
quota? Would per-sample or per-identity rate limits with verifiable credentials
be feasible within your architecture?

**Answer:** Per-wallet limits alone are not Sybil-resistant. They slow naive
probing but can be bypassed by rotating wallets.

**Implemented:** Rate limiting now applies to both:

- `(modelId, requester wallet)`
- `(modelId, sampleId)`

This closes the simple same-sample/new-wallet bypass. `cancelJob` refunds both
the wallet and sample slots when cancellation occurs inside the active window.

**Remaining limitation:** This is still not full Sybil resistance. A determined
attacker can use many registered samples, compromised sample access, or many
identity credentials. Stronger deployment options are feasible but not
implemented here:

- per-identity limits via verifiable credentials,
- issuer/lab attestations,
- staking or per-query deposits,
- stricter private-model allowlists.

Recommended wording:

> The prototype enforces per-wallet and per-sample quotas. These controls
> mitigate low-effort probing but are not a complete Sybil defense; clinical or
> private-model deployments should add identity, credential, or economic
> controls.

## 6. Randomness manipulation in the noise oracle

**Reviewer question:** Given miner/proposer influence over on-chain randomness,
how robust is the uniform noise oracle to manipulation, for example withholding
or reordering to bias noise? Would a VRF or commit-reveal be more appropriate?

**Answer:** The current oracle uses `FHE.randEuint64(noiseUpperBound)`, which
generates encrypted bounded random noise inside the fhEVM execution path. The
caller cannot provide zero noise or choose the sampled value. The sampled noise
is not publicly revealed before classification.

**Implemented/documented:** We kept the existing fhEVM encrypted randomness path
and documented residual ordering/withholding risk. We did not add VRF or
commit-reveal.

**Why not VRF/commit-reveal now:** Public VRF output could reveal the noise if
used directly, making the categorical output more informative. Commit-reveal
adds latency and liveness failure modes. A VRF can be useful if it feeds an
encrypted sampler without revealing the final noise, but that is a protocol
design change rather than a small contract patch.

**Remaining limitation:** Proposers can still censor, reorder, or withhold
transactions under normal blockchain threat models. We should not claim stronger
unbiasability than the deployed fhEVM random-generation protocol provides.

## 7. Formal `(epsilon, delta)` DP and PRS sensitivity

**Reviewer question:** Why not provide formal `(epsilon, delta)`-DP guarantees,
for example via symmetric noise and calibrated thresholds, and a sensitivity
analysis for PRS? Are there fhEVM limitations preventing signed/Laplace-like
noise?

**Answer:** We should not claim formal `(epsilon, delta)`-DP for the current
oracle. The implemented mechanism is one-sided bounded uniform noise followed
by categorical thresholding. It is useful as a noisy release and anti-probing
control, but it is not a calibrated formal DP mechanism.

**Implemented:** Contract and documentation wording now says "DP-inspired noisy
categorical release" and explicitly says it is not a formal `(epsilon,
delta)`-DP guarantee.

**Sensitivity basis for future work:** For `S(g) = sum_i g_i beta_i`,
sensitivity depends on the adjacency model:

- one allele-copy change at one SNP: `Delta = max_i |beta_i|`,
- full dosage change at one SNP with `g_i in {0,1,2}`:
  `Delta = 2 max_i |beta_i|`,
- whole genotype vector change:
  `Delta = 2 sum_i |beta_i|`.

In this repo, sensitivity must be mapped through fixed-point quantization. The
`scoreOffset` is deterministic. The `weightZeroPoint * genoSum` correction must
either be included in encoded-domain sensitivity or avoided by doing the proof
in decoded PRS units and mapping thresholds afterward.

**fhEVM limitation:** FHEVM Solidity currently exposes encrypted unsigned types
such as `euint64`, not a native signed encrypted integer API. A symmetric
discrete Laplace/geometric mechanism is still possible with offset encoding or
sign/magnitude handling, but it adds fixed-iteration sampling, encrypted
comparisons, selects, overflow guards, and HCU cost.

Recommended wording:

> Formal DP calibration is future work. The current release mechanism is
> DP-inspired but not a formal `(epsilon, delta)` guarantee.

## 8. Live fhEVM-compatible testnet/rollup execution

**Reviewer question:** Have you executed any part of the system on a live
fhEVM-compatible testnet/rollup to validate HCU ceilings, gas charges for
precompiles, or multi-validator behavior? If so, report measurements; if not,
what are the blockers?

**Answer:** We have not completed a funded live Sepolia/fhEVM run and therefore
should not report live ciphertext measurements. The repository includes scripts
for deployment, 100-SNP validation, and HCU probing, and the mock versions pass.

**Implemented:** Sepolia tooling was improved:

- `SEPOLIA_RPC_URL` support was added.
- PublicNode is now the no-key fallback RPC endpoint.
- Sepolia scripts refuse to run with the public Hardhat test mnemonic.
- The blocked attempt is documented in `reports/sepolia-validation.md`.

**Current blocker:** A funded non-default Sepolia mnemonic is required. The
default public Hardhat mnemonic was detected and refused. Before that guard was
added, the same account had only `0.00000010451450605` Sepolia ETH and failed
with insufficient funds.

Recommended wording:

> No live fhEVM testnet measurements are claimed. Mock-mode validation passes,
> and live validation scripts are included for reproducibility, but running them
> requires funded Sepolia credentials.

## 9. Timing/resource side channels

**Reviewer question:** How do you envision defending against timing- or
resource-variance side channels in the coprocessor when operating on encrypted
comparisons and selections?

**Answer:** At the contract level, the execution shape is determined by public
model geometry: `weightCount`, `uploadChunkSize`, and `computeChunkSize`.
Computation loops do not branch on encrypted genotype values. Classification
uses `FHE.select` over encrypted booleans instead of Solidity `if`.

**Implemented/documented:** The design document now frames this as a
contract-level fixed-shape property and leaves coprocessor-level timing to the
fhEVM implementation.

**Remaining limitation:** Coprocessor microarchitectural timing, worker
scheduling, and resource-variance leakage are outside this repo's control.
Padding every model to a common size could reduce metadata leakage, but model
size is already public and padding would sharply increase cost.

Recommended wording:

> The prototype avoids data-dependent public control flow in Solidity. It does
> not claim protection against coprocessor-level microarchitectural side
> channels.

## 10. Private-model encryption keying and revocation

**Reviewer question:** In private-model mode, under whose key are the model
weights encrypted, and can the model owner later revoke access without revealing
weights to the compute engine or other parties?

**Answer:** Private model weights are encrypted under the fhEVM network public
key, not under a model-owner-specific key. The marketplace stores encrypted
handles. The compute engine receives handles and performs FHE operations; it
does not decrypt weights.

**Implemented/existing behavior:**

- `ModelMarketplace.setPrivateModelReader(modelId, reader, allowed)` controls
  future private-model reads.
- `PRSComputeEngine.createPRSJob` requires the engine and requester to be
  authorized for private models.
- The model owner can revoke future marketplace reads with
  `setPrivateModelReader(modelId, reader, false)`.

**Remaining limitation:** Revocation is not retroactive. It cannot erase handles
already granted in previous transactions, completed jobs, or plaintext already
decrypted by authorized parties. Per-model keys would require separate KMS
domains or re-encryption flows that this design does not implement.

## Source Notes

Official fhEVM/Zama documentation used for this response:

- FHEVM Solidity overview and encrypted types:
  <https://docs.zama.org/protocol/solidity-guides/getting-started/overview>
- Supported encrypted types:
  <https://docs.zama.org/protocol/solidity-guides/smart-contract/types>
- Encrypted inputs and `FHE.fromExternal`:
  <https://docs.zama.org/protocol/solidity-guides/smart-contract/inputs>
- Quick-start note on encrypted input binding to caller and contract:
  <https://docs.zama.org/protocol/solidity-guides/getting-started/quick-start-tutorial/test_the_fhevm_contract>
- HCU limits and operation costs:
  <https://docs.zama.org/protocol/solidity-guides/development-guide/hcu>
- Random encrypted numbers:
  <https://docs.zama.org/protocol/solidity-guides/smart-contract/operations/random>
- Coprocessor protocol:
  <https://docs.zama.org/protocol/protocol/overview/coprocessor>
- Gateway protocol:
  <https://docs.zama.org/protocol/protocol/overview/gateway>
- KMS protocol:
  <https://docs.zama.org/protocol/protocol/overview/kms>
