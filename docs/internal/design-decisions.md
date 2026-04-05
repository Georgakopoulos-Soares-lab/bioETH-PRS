# bioETH PRS — Internal Design Decisions Reference

> Written for the team. If you read this start-to-finish, you should be able to explain
> every architectural choice in this codebase to a colleague — including why we made it,
> what alternatives we considered, and what the trade-offs are.
>
> Current state: v1 fully implemented, 83 tests passing, mock-validated.
> Sepolia deployment is tooled and ready to run.

---

## 1. The Core Bet: Why FHE on a Blockchain?

### The problem

A Polygenic Risk Score (PRS) is a weighted sum of a person's SNP dosages (genetic variant
counts: 0, 1, or 2) times research-derived beta weights from a GWAS study. The formula is
just a dot product:

```text
PRS = Σ (snp_i × beta_i)
```

The privacy problem: the patient doesn't want their DNA visible to anyone. The researcher
may not want their model weights (betas) visible to the patient. Both parties need to trust
the computation result. You can't achieve all three with a normal server.

### What we rejected

| Approach | Problem |
|---|---|
| Trusted third-party compute server | Requires trusting a specific institution; single point of failure/breach |
| TEE / Intel SGX | Hardware trust — requires trusting Intel's manufacturing and software stack; documented side-channel attacks; not truly trustless |
| ZK proofs | Proves computation was correct but doesn't hide the *inputs* to the prover |
| Homomorphic encryption off-chain | Removes the trustless guarantee — who runs the FHE server? |

### What we chose

**Fully Homomorphic Encryption directly inside the EVM, on a blockchain.**

The EVM (Ethereum Virtual Machine) becomes the evaluator. It operates on ciphertexts.
It never sees DNA or model weights as plaintext. The result is verified by consensus —
no single institution can cheat.

This is the Zama fhEVM approach: the EVM calls FHE precompiles that are serviced by a
coprocessor (on Sepolia: a real TFHE computation network; locally: a mock that validates
the same protocol with plaintext arithmetic behind the scenes).

**The key insight from the HEPRS paper (Knight et al., 2026)**: they used CKKS-based FHE
in a centralized three-party model. We replaced their evaluator party with a smart contract.
The trust model changes completely — instead of trusting an institution, you trust
immutable code running on a public blockchain.

---

## 2. Why TFHE/euint64 Instead of CKKS?

The HEPRS paper uses CKKS, which supports approximate floating-point arithmetic natively.
We use TFHE, which operates on **unsigned integers**.

### Why we can't use CKKS on fhEVM

CKKS runs natively on CPUs/GPUs and works well in off-chain settings. The Zama fhEVM
infrastructure uses **TFHE (Torus Fully Homomorphic Encryption)**, which is the scheme
chosen for Ethereum coprocessors because:

- It supports bitwise and integer operations efficiently
- It integrates with the EVM's gas model (each FHE operation = a precompile call with a
  fixed gas cost)
- It supports the `euintN` type system (`euint8`, `euint16`, `euint32`, `euint64`, etc.)

The price we pay: TFHE integers are **unsigned**. GWAS betas are **signed floats**
(e.g., `-0.31`, `+0.08`). That mismatch is the core technical problem we had to solve.

---

## 3. The Quantization Problem — Our Biggest Design Investment

This is where we spent the most design effort. It's not glamorous, but it's load-bearing.

### Why not just send floats?

The FHE type available is `euint64` — an encrypted 64-bit **unsigned** integer.
You cannot represent `-0.31` in a `uint64`. You'd get a silent integer overflow
(wrapping around to a huge positive number), producing a completely wrong score.

### The three-step solution

**Step 1 — Scale to integers.**

Pick a scaling factor (e.g., `3,000,000`). Multiply each float weight:

```text
-0.31 × 3,000,000 = -930,000    (signed integer)
+0.08 × 3,000,000 = +240,000    (signed integer)
```

Now we have signed integers `q_i`. Still can't fit in `uint64` due to negatives.

**Step 2 — Shift to unsigned (the "zero-point" trick).**

Find the most negative quantized weight. Call its absolute value `weightZeroPoint`.
Add it to every weight to make them all non-negative:

```text
weightZeroPoint = -min(q_i)
u_i = q_i + weightZeroPoint        (all u_i ≥ 0 now)
```

Store `u_i` in the contract. These are what the FHE arithmetic operates on.

The problem: computing `Σ(snp_i × u_i)` is NOT the true PRS. We introduced a
spurious term. Expanding it:

```text
Σ(snp_i × u_i)
= Σ(snp_i × (q_i + weightZeroPoint))
= Σ(snp_i × q_i) + weightZeroPoint × Σ(snp_i)
```

The second term is the spurious contribution. To cancel it we need `genoSum = Σ(snp_i)`.
The engine accumulates this in parallel during every `computeChunk` call:

```solidity
genoAcc = FHE.add(genoAcc, snps[i]);
```

**Step 3 — Shift the final score to non-negative (the "scoreOffset").**

Even after correcting for the zero-point, `raw_score_q = partialSum − weightZeroPoint × genoSum`
can still be negative for a low-risk patient (if their dosages are low and weights are
mostly negative in the original float domain).

We compute the worst-case minimum score (all dosages = 2, all weights negative) and
make it the offset:

```text
raw_min = Σ(2 × min(q_i, 0))
scoreOffset = -raw_min
encodedScore = raw_score_q + scoreOffset    (always ≥ 0)
```

**Why rearrange the final formula?** The contract computes:

```solidity
encodedScore = (partialSum + scoreOffset) − (weightZeroPoint × genoSum)
```

rather than:

```solidity
raw = partialSum − (weightZeroPoint × genoSum);   // ← THIS COULD UNDERFLOW
encodedScore = raw + scoreOffset;
```

`partialSum` is an encrypted `euint64`. If we subtract first, and the intermediate
result is negative, we get **silent unsigned overflow** — the subtraction wraps around
to a massive positive number. By adding `scoreOffset` first, we guarantee the subtraction
never goes below zero. The order matters.

### Why this design is defensible

- All three constants (`scale`, `weightZeroPoint`, `scoreOffset`) are computed off-chain
  by the quantization advisor and stored in the `ModelMarketplace` header
- Off-chain decoding is: `(encodedScore − scoreOffset) / scale`
- The overflow ceiling is checked by the advisor: `scale × 2 × N_snps < 2^64`
- All 50 individuals × 4 fixtures (200 overflow checks) pass in tests

### Why we didn't use a simpler approach

We considered just "clamp negatives to zero" or "add a very large constant." Both break
the PRS math — you'd lose rank correlation between patients. The affine quantization
scheme we use is mathematically exact (assuming no overflow), which is essential for
clinical utility.

---

## 4. Why Four Contracts Instead of One?

We have `GenomicRegistry`, `ModelMarketplace`, `PRSComputeEngine`, and `ResultOracle`.
This is deliberate separation of concerns, not over-engineering.

### `GenomicRegistry` — the identity layer

Stores URI pointers to encrypted genomic data (IPFS/Arweave) and an ACL mapping.
**The data never enters the chain** — only a hash pointer and an access control list.

**Why separate?** Access control policy is orthogonal to computation. The registry
is owned and managed by the patient. It answers one question: "Is this address
authorized to run a PRS job over this sample?" The compute engine calls it as a gate.
If we embedded this in the compute engine, you'd need to redeploy the ACL every time
we update computation logic.

### `ModelMarketplace` — the model storage layer

Stores GWAS model weights in chunked form. Two modes: public (`uint64[]`) and
private (`euint64[]`).

**Why separate from the compute engine?** A model is a reusable artifact. One
researcher publishes it once; thousands of patients could use it across many jobs.
If model storage were inside the compute engine, every model publication would be
coupled to compute logic upgrades. Separation lets models survive contract upgrades.

**Why a full publication lifecycle (shell → chunks → finalize) instead of a single upload?**

A 5000-SNP model is 5000 × 8 bytes of weight data = 40 KB minimum. One Ethereum
transaction's calldata limit is ~128 KB, but gas for that much SSTORE (cold storage
writes) would be catastrophically expensive and likely exceed the block gas limit.
Chunking splits the cost across multiple transactions. This is not optional — it is
required by EVM economics.

**Why is the model's chunk size canonical?** The model chooses the chunk geometry once,
at publication time. The compute engine and SNP ingestion both follow it. This means
there is exactly one source of truth for chunk boundaries. If the job could choose
a different compute chunk size, we'd need alignment logic between two geometries —
more edge cases, more tests, more bugs. For v1, one geometry is the right trade-off.

### `PRSComputeEngine` — the computation layer

The core contract. Runs the FHE dot product state machine.

**Why a state machine?** A single transaction can only do so many FHE operations.
The mock coprocessor enforces an HCU (Homomorphic Compute Unit) budget of ~60-74 ops
per transaction. Each SNP requires 3 FHE ops (`asEuint64` + `mul` + `add`). At chunkSize=20
that's 60 ops — right at the ceiling. For 5000 SNPs, the computation spans ~500 transactions.
A state machine is the only viable architecture.

**Why is `computeChunk` permissionless?** Anyone can call it. The requester controls
everything sensitive (SNP payload, result access), but they don't have to pay all the
compute gas themselves. A relayer or gas sponsor can drive the computation forward.
This is a deliberate design choice: the EVM serializes transactions, so concurrent
compute calls on the same job are safe (each one atomically advances `nextChunkIndex`).

**Why not a map-reduce / parallel approach?** Map-reduce would require storing one
encrypted partial sum per chunk, then running a reduction pass. That's more storage,
more complexity, more edge cases. The sequential accumulator is simpler, correct by
inspection, and easy to test. Parallelism is a v2 optimization, not a v1 requirement.

### `ResultOracle` — the output layer

Adds noise and classifies the score into Low/Medium/High.

**Why separate from the compute engine?** Classification policy (thresholds, noise
calibration) changes independently of how the dot product is computed. A researcher
might want to publish a model and let different oracles classify results at different
noise levels. Keeping them separate allows that.

**Why output a category (`euint8`) rather than the raw score?**

The raw score is an encrypted `euint64` handle — only the requester can decrypt it.
The category is `makePubliclyDecryptable`, meaning it goes through the fhEVM gateway
to become readable by anyone. The reason: even with DP noise, releasing a precise
quantized score gives an adversary a much stronger signal than releasing a 3-bucket
category. The category is the appropriate privacy-preserving output for population use.
The raw score is still available to the requester for their own use (e.g., a clinician
seeing a precise value in a private portal).

---

## 5. The fhEVM Plumbing — What You Must Understand

### `ZamaEthereumConfig`

All three FHE contracts inherit this base. It auto-detects `chainId` at runtime:

- `31337` (Hardhat local) → configures mock coprocessor addresses
- `11155111` (Sepolia) → configures real Zama coprocessor, KMS gateway, input verifier

**Why inherit instead of set addresses in a constructor?** Zero configuration needed.
The same compiled bytecode deploys to both environments. No manual address management.
No "oops I used the wrong gateway address" bugs.

### The ACL system: `allowThis` vs `allow`

The fhEVM coprocessor maintains an Access Control List for every encrypted handle.
A handle without an ACL entry is unusable — any subsequent FHE operation on it reverts.

- `FHE.allowThis(handle)` — grants the **current contract** permission to use the handle
  in future transactions. Call this on every new handle you store or intend to use.
- `FHE.allow(handle, userAddress)` — grants an **external address** permission to use
  the handle (e.g., decrypt it). Call this before returning a handle to a user.

**Why is this required?** It's fhEVM's security model. Ciphertexts are not free to copy —
ownership must be explicitly tracked. Without these calls, the coprocessor rejects operations
as unauthorized. Missing a `FHE.allowThis` is a common bug and causes subtle reverts in
subsequent transactions, not in the transaction that created the handle.

### The `externalEuint64` + `inputProof` pattern

When a user wants to submit an encrypted value to the chain, they use `fhevmjs` off-chain
to create an `externalEuint64` handle plus an `inputProof`. The proof cryptographically
binds the ciphertext to:

- the specific contract address it's intended for
- the specific user address submitting it

On-chain, the contract calls `FHE.fromExternal(handle, proof)` which validates the proof
and returns a `euint64` the contract owns. Without this, anyone could replay someone else's
ciphertext.

**The proof has a 2048-bit budget**: each `euint64` costs 64 bits, so a single proof
can carry at most `2048 / 64 = 32` encrypted values. This is a hard protocol limit and
is why `appendSnpChunk` can take at most 32 SNPs at a time.

---

## 6. The Chunking Architecture — Why It Works the Way It Does

### Why sequential, not random-access?

Both model publication and SNP upload are sequential — you must submit chunks in order
(0, 1, 2, ..., N). The contract derives the next expected index itself; the caller
cannot specify an arbitrary chunk position.

**Why?** No gaps, no sparse sets, no out-of-order repair logic, no overwrite path.
The invariant "chunk k is present iff k < uploadedChunkCount" is trivially maintained.
An arbitrary-order scheme would require tracking a bitmask of which chunks have arrived,
with repair/resubmit logic if one is missing. For v1, the sequential constraint is the
right trade-off.

### Why finalization is a hard gate

`computeChunk` requires `snpsFinalized == true`. `createPRSJob` requires the model
to be finalized.

**Why?** If compute could start while uploads are still in progress, you'd have a race:
a relayer might start computing chunk 3 before chunk 3 has been uploaded, or before the
requester has finished appending chunks 4-10. Finalization creates a clear "this artifact
is immutable and complete" signal. It's the same pattern used in content-addressed systems
like IPFS pinning or database commits.

### The HCU ceiling — what we measured and why it matters

HCU (Homomorphic Compute Unit) is the fhEVM's per-transaction FHE operation budget.
Each SNP in `computeChunk` costs 3 FHE ops:

1. `FHE.asEuint64(weight)` — trivially encrypt the public weight constant
2. `FHE.mul(snp, encWeight)` — multiply two ciphertexts (C×P path for public models)
3. `FHE.add(partialSum, product)` — add into the running accumulator

We measured the mock HCU ceiling systematically (probe across chunkSizes 10, 15, 20, 25, 32):

| chunkSize | ops (3×) | Result |
|---:|---:|---|
| 10 | 30 | PASS |
| 15 | 45 | PASS |
| 20 | 60 | PASS |
| 25 | 75 | FAIL — `HCUTransactionLimitExceeded` |
| 32 | 96 | FAIL |

**Earlier documentation claimed the ceiling was 10.** That was wrong — inferred by
testing only chunkSize=32 against an assumed 30-HCU/tx budget, without testing the
intermediate values. The systematic probe corrected it to 20.

**The local mock default is now 20** because the systematic probe confirmed it is safe.
The first Sepolia validation run still starts at 10 because the real HCU ceiling is
unknown. `chunkSize=20` is optimal for mock but may or may not work on Sepolia —
that's what `npm run probe:hcu` on Sepolia will tell us.

The Sepolia HCU ceiling could be 300 or more. If it's 300, chunkSize becomes 100,
dropping a 5000-SNP job from ~1000 transactions to ~100. This is the most impactful
unknown for production feasibility.

---

## 7. Public vs Private Models — The Cost/Privacy Trade-off

### Public model path (C×P)

Weights stored as `uint64[]` (plain integers). During compute:

```solidity
FHE.mul(snp, FHE.asEuint64(weight))
```

`FHE.asEuint64(weight)` wraps the plaintext weight in a trivial encryption before
the multiply. The coprocessor internally optimizes this as a cheaper C×P operation —
multiplying a ciphertext by a known plaintext is less expensive than multiplying two
real ciphertexts.

**Trade-off:** The researcher's weights are visible to anyone. This is "open science"
mode — the beta values are public GWAS results anyway for most research models.
Gas cost is lower.

### Private model path (C×C)

Weights stored as `euint64[]` (encrypted). During compute:

```solidity
FHE.mul(encryptedWeight, snp)
```

Both operands are ciphertexts. Neither the patient's DNA nor the researcher's proprietary
weights are ever visible. This is the maximum IP protection scenario.

**Trade-off:** C×C is more expensive in gas and HCU. The private-model path also requires
the researcher to grant the compute engine FHE read access via `setPrivateModelReader`.
This extra authorization step exists because the coprocessor needs to know that the engine
is allowed to use the encrypted weight handles.

Additionally, `PRSComputeEngine.createPRSJob` now enforces **per-requester** authorization
for private models: it checks `marketplace.canReadPrivateModel(modelId, msg.sender)` in
addition to the engine-level check.  The model owner is auto-authorized at
`createModelShell` time; all other requesters must be explicitly added via
`setPrivateModelReader(modelId, requesterAddr, true)`.

**Why support both in v1?** The paper needs both cases — "open science" (public weights,
common in polygenic score databases) and "proprietary model" (private weights, relevant
for commercial clinical tools). Symmetric publication lifecycle, different arithmetic path.

---

## 8. The DP Noise Decision — Why We Changed It

### The old design (caller-supplied noise) was broken

The original `ResultOracle.classify()` accepted two ciphertexts: the score and the noise.
The problem: the noise is encrypted, so **the contract cannot read its value**.
A malicious caller could pass `encrypt(0)` as noise. The addition `score + 0 = score`
is indistinguishable from a properly noised score. The DP guarantee was completely
illusory.

This mattered for the paper. If we claim DP protection against model-extraction attacks,
and the implementation allows zero-noise calls, that claim is false.

### Why not a minimum floor constant?

We considered: always add `FHE.asEuint64(MIN_NOISE_FLOOR)` to the score, regardless
of caller input. The problem: a deterministic constant is not DP noise. It's just a shift.
DP requires **random** perturbation from a known distribution — the randomness is what
prevents an adversary from learning the true score from repeated queries.

### Why not a commitment scheme or VRF?

Both approaches require off-chain coordination:

- Commitment: caller commits to a noise value, then reveals it later. Two transactions
  per classify call, complex state management, still caller-controlled.
- VRF: requires an off-chain oracle request and a callback. Even more round-trips,
  external dependency.

Neither provides a meaningful security benefit over on-chain randomness, and both add
significant complexity.

### What we chose: `FHE.randEuint64(noiseUpperBound)`

The Zama library exposes `FHE.randEuint64(upperBound)` — a single precompile call that
returns a uniformly random `euint64` in `[0, upperBound)`, generated by the coprocessor.
The caller has **zero influence** over its value before the transaction is mined.

```solidity
euint64 noise = FHE.randEuint64(noiseUpperBound);
FHE.allowThis(noise);
euint64 noisy = FHE.add(score, noise);
```

**The `noiseUpperBound` constraint — must be a power of two.** This is a precompile
requirement (`randBounded` internally requires a power-of-two range). We enforce this
in the constructor with a bit-trick check: `(n & (n-1)) == 0`. The constructor rejects
both zero and non-power-of-two values with a clear error message, rather than letting
the coprocessor emit an opaque `NotPowerOfTwo()` revert.

**Why uniform noise instead of Laplacian?** Formal differential privacy (ε-DP) requires
noise drawn from a Laplacian distribution calibrated to the sensitivity of the query.
Generating Laplacian noise inside FHE requires computing an inverse-CDF approximation,
which is a significant circuit (many FHE gates, high HCU cost). This is an active
research problem. Uniform noise from `FHE.randEuint64` is:

- A single precompile call (trivial HCU cost)
- Truly unpredictable by the caller
- Provably non-zero with probability `(bound-1)/bound`

It closes the zero-noise attack. It does not provide formal ε-DP. We are honest about
this: the architecture-roadmap documents it as "uniform noise is a weaker approximation;
Laplacian calibration is deferred to the research phase."

The deployer controls the **scale** of noise via `noiseUpperBound` in the constructor —
a power-of-two like `2^20 = 1,048,576`. This is meaningful: at `scale=3,000,000` (our
100-SNP model), that's ≈0.35 on the decoded float scale, which is a real perturbation.

---

## 9. The Registry ACL — Why We Wired It

`createPRSJob(modelId, sampleId)` calls:

```solidity
require(registry.hasAccess(sampleId, msg.sender), "No registry access");
```

**Why?** Without this, anyone could initiate a PRS job using any patient's sampleId.
They couldn't read the result (FHE ACL prevents that), but they could:

- Repeatedly probe a model using someone else's registered sampleId
- Create garbage compute jobs tied to a patient's identity

The ACL check means only the sample owner or a granted delegate can start a job.
The registry itself is a separate contract (`GenomicRegistry`) so the patient controls
their own access list without depending on compute contract upgrades.

**The remaining limitation:** The contract cannot verify that the SNP ciphertexts the
requester actually submits correspond to the registered sample's off-chain data. That
linkage is the requester's responsibility. The registry proves *authorization*, not
*data authenticity*. Closing that gap (zero-knowledge proof of correct data commitment)
is a significant research problem deferred to future work.

---

## 10. The Mock vs Real FHE Distinction

This is important to understand before any Sepolia discussion.

### What the mock does

`@fhevm/hardhat-plugin` deploys a mock coprocessor locally. It validates:

- FHE handle formats and types
- ACL entries (`allowThis`, `allow`, `makePubliclyDecryptable`)
- Input proofs (`fromExternal` with `externalEuint64`)
- State machine transitions

But behind the scenes, it performs **plaintext arithmetic**. `FHE.mul(a, b)` is just
a regular integer multiply. This means:

- Gas measurements are not the real fhEVM gas schedule
- Timing measurements are milliseconds, not minutes
- HCU budget is a local development constant (~60-74 ops/tx on mock; unknown on Sepolia)
- No privacy guarantee exists in mock mode

### Why we use mock at all

Real TFHE operations have seconds-to-minutes of latency per operation. Testing a 5000-SNP
job on Sepolia would take hours and cost real ETH. The mock lets us verify protocol
correctness, state machine logic, and mathematical accuracy in ~20 seconds per full test run.

The contracts are identical on both networks. `ZamaEthereumConfig` selects the right
coprocessor addresses at runtime via chainId. The switch is automatic — no code changes
needed to go from mock to Sepolia.

### The decryption path split

```typescript
if (fhevm.isMock) {
  // mock: read plaintext directly from coprocessor state
  score = await fhevm.debugger.decryptEuint(FhevmType.euint64, handle);
} else {
  // Sepolia: EIP-712 signing → Zama relayer → KMS re-encryption → plaintext
  score = await fhevm.userDecryptEuint(FhevmType.euint64, handle, contract, signer);
}
```

On Sepolia, decryption is not instant. The user signs a re-encryption request, the Zama
relayer forwards it to the KMS, the KMS re-encrypts the ciphertext under the user's public
key, and returns the result. This round-trip has not been tested yet — it only runs on Sepolia.

---

## 11. The Provenance Design in ModelMarketplace

Every model header stores three provenance fields:

- `manifestURI` — pointer to off-chain metadata (IPFS/Arweave URI)
- `manifestHash` — cryptographic hash of the manifest content
- `sourceModelHash` — hash of the upstream source artifact (the original beta file or GWAS weight table)

**Why all three?**

`manifestURI` alone is fragile — content at an IPFS URI can change (if the CID changes,
the link breaks; if the same CID is pinned with different content... that's a hash collision,
which is different). `manifestHash` solves integrity: fetch the manifest, hash it, compare
to what's on-chain. If they match, you have the exact version anchored at model creation time.

`sourceModelHash` is different from `manifestHash`. The manifest is the *description*
(what trait, what GWAS study, what quantization choices). The source model hash is the
*scientific artifact itself* — the upstream beta file from PGS Catalog or a research
pipeline. This lets you trace "this on-chain model came from this exact source" without
storing the source file on-chain.

Together they answer: "What is this model?" (manifest) and "Where did it come from?"
(source hash). This matters for scientific reproducibility — a key requirement when
writing a paper and when clinical tools depend on your scores.

These are not an ERC standard. They're a project-specific schema aligned with good
provenance practice from ML model registries and data lake systems.

---

## 12. The Gas Profile and What It Tells Us

From the current mock validation baseline (100 SNPs, uploadChunkSize=32, computeChunkSize=20):

| Phase | Gas | % | What it means |
|---|---:|---:|---|
| Upload SNPs | 10.3M | 58% | 4 upload chunks at 32 encrypted values each. Cold SSTORE is expensive. |
| Compute | 5.8M | 33% | 6 compute chunks, 5 full × ~1.12M plus 1 partial chunk. |
| Publish model | 1.1M | 6% | One-time cost, amortized across all users of the model. |
| Create job | 315K | 2% | Fixed overhead. |
| Finalize | 155K | <1% | Fixed overhead. |

**Key insight:** Upload is the dominant cost, not compute. This surprises people — they
expect FHE operations to dominate. But on the mock, FHE is cheap (plaintext arithmetic).
Even on real fhEVM, the SSTORE cost for writing 110 ciphertext handles to storage is
structural and unavoidable.

**What changes on Sepolia:** Compute gas will increase significantly (real TFHE precompiles
have a different, higher gas schedule). Upload gas may stay similar (SSTOREs are SSTOREs).
So the ~35%/54% split will likely flip — compute will dominate on real fhEVM.

**Linear scaling confirmed:** Total gas scales at ~165K per SNP (827.6M for 5000 SNPs /
5001 ≈ 165K per SNP). The per-SNP cost is consistent, which means the architecture has
no hidden quadratic behavior.

---

## 13. What We Still Don't Know (Honest Assessment)

| Unknown | Why it matters | How to resolve |
|---|---|---|
| Real Sepolia HCU ceiling | Determines if chunkSize can be 100+ (5000-SNP tx count drops from 1000 to 100) | `npm run probe:hcu` after Sepolia deploy |
| Real compute gas on Sepolia | Mock gas is not real fhEVM gas schedule; cost estimates may be wrong by 10× | `npm run validate:sepolia` gas reports |
| KMS re-encryption round-trip | Patient decryption path never tested; `userDecryptEuint` only runs on Sepolia | Run Sepolia validation end-to-end |
| DP calibration | `noiseUpperBound=2^20` is a reasonable default, not a calibrated choice | Measure score distributions across patients, fit noise-to-range ratio |
| Formal DP analysis | Uniform noise ≠ ε-DP; cannot currently quantify epsilon | Research phase — Laplacian or Gaussian noise circuit needed |
| Clinical score accuracy | De-quantized on-chain scores not yet compared to PLINK/PRSice reference | Scientific validation phase |
| Data authenticity | Registry proves authorization but not that submitted DNA is genuine | ZK commitment proof — future work |

---

## 14. Summary: Every Design Decision in One Place

| Decision | Choice | Why | What we rejected |
|---|---|---|---|
| Compute location | On-chain FHE | Trustless, no single-point trust | TEE (hardware trust), off-chain FHE (who runs the server?) |
| FHE scheme | TFHE (`euint64`) | EVM precompile compatibility | CKKS (not available in fhEVM) |
| Negative weight handling | Affine unsigned encoding (zero-point shift) | Exact, overflow-safe, auditable | Clamp to zero (breaks PRS math), signed type tricks (not in EVM FHE) |
| Overflow prevention | `scoreOffset` + rearranged formula order | Prevents unsigned underflow mid-computation | Hope (wrong), wider types (unnecessary complexity) |
| Model storage | Chunked lifecycle: shell → chunks → finalize | Required by EVM gas limits; makes artifact explicit and auditable | One-shot upload (hits gas ceiling) |
| Chunk geometry authority | Model's `chunkSize` is canonical | Single source of truth, no alignment logic | Independent upload/compute chunk sizes (more edge cases) |
| Chunk ordering | Sequential only | Simple invariants, no sparse-set logic | Random-access chunk upload (more complex) |
| Compute gate | `finalizeSnpUpload` required before `computeChunk` | Prevents compute on mutable payload | No gate (race condition risk) |
| Compute caller | Permissionless (anyone can relay) | Enables gas sponsoring, relayer model | Requester-only (requester must pay all gas) |
| Compute strategy | Sequential accumulator (`partialSum`) | Simpler state machine, fewer storage writes | Map-reduce partials (more storage, more complexity) |
| DP noise source | On-chain `FHE.randEuint64(bound)` | Caller cannot inject zero noise | Caller-supplied noise (zero-noise bypass), commitment (extra round-trips), VRF (external dependency) |
| DP noise distribution | Uniform `[0, bound)` | Single precompile call, no FHE inverse-CDF circuit | Laplacian (expensive FHE circuit, research problem) |
| DP noise scale | Power-of-two `noiseUpperBound` | Coprocessor `randBounded` requirement | Arbitrary bound (coprocessor rejects with `NotPowerOfTwo`) |
| Output type | `euint8` category (publicly decryptable) + `euint64` raw score (requester-only) | Minimizes information release; category for population, score for clinician | Raw score publicly decryptable (too much information), no output (useless) |
| Registry ACL | Enforced at `createPRSJob` | Only authorized parties can start jobs over a sample | No ACL (anyone could probe any patient's sampleId) |
| Network abstraction | `ZamaEthereumConfig` auto-detects chainId | Same bytecode on mock and Sepolia, zero configuration | Manual address injection (error-prone) |
| Public vs private models | Both supported, symmetric lifecycle | Paper needs both cases; cost/privacy trade-off | Public only (can't protect researcher IP) |

---

## Appendix: The Token of Design Philosophy

One sentence that captures the v1 approach:

> Build the simplest thing that is mathematically correct, safely bounded, and
> fully testable — then measure the real system before optimizing.

We did not pre-optimize chunk sizes (we measured them). We did not assume the HCU ceiling
(we probed it). We did not keep broken DP (we fixed it). We did not do map-reduce
parallelism (we don't need it yet). We did not implement Laplacian noise (we don't have
empirical calibration data yet).

Every item in the Active Priorities and Research sections exists because we consciously
chose not to implement it in v1 — and documented exactly why.
