# Phase 7 — Live fhEVM validation: **PUBLIC LIVE; PRIVATE MOCK-ONLY FALLBACK**

- Status: **`R1.1-E1` live-complete; `R1.1-E2` complete via its documented fallback**
- Live record: `live_2026-07-31/`
- Evidence classes below: **Live fhEVM** and **Hardhat mock**, always labelled separately
- Updated: 31 July 2026

## Live outcome

The configured test-only wallet deployed all four contracts and completed one public 100-SNP
workflow on Sepolia. All **25** workflow receipts have status 1; **11** real compute chunks and
finalization succeeded; Gateway/KMS user decryption returned encoded score **758,685**, exactly
matching the independent reference. Total workflow gas was **20,710,271**, submission-to-result
was **269,320 ms**, and decryption was **8,081 ms**.

The first public attempt is preserved as failed, not overwritten: nine transactions mined before
the Zama relayer closed a TLS socket during the second SNP input proof. It produced no result.
The hardened retry prepared all proofs before spending, encountered and recovered from another
transport failure, then completed. Every receipt, source hash, runtime bytecode hash, actual
test-ETH fee, checkpoint, and transcript is saved under `live_2026-07-31/`.

The wallet now has **0.0127690815 Sepolia ETH**, which does not safely cover the 100-SNP private
workflow (29.8 M mock gas). No underfunded private transaction was submitted. The accepted
`R1.1-E2` fallback requires the manuscript to say private-weight execution is implemented and
mock-validated but not live-validated.

## What Phase 7 did establish

The 31 July readiness follow-up removed the software-side gaps that had preceded funding. The
subsequent public run then verified that path live; only optional future private execution still
requires additional test ETH rather than harness changes.

| Check | Result |
|---|---|
| Sepolia network | chain ID 11155111 |
| All contracts within EIP-170 (24,576 B) | yes — largest is `PRSComputeEngine` at 10,426 B (42.4%) |
| Live harness readiness | **8/8 properties verified** after the 31 July follow-up |
| Live deployment | 4 tx / 5,892,559 gas / 0.0062781714 test ETH |
| Live public 100-SNP | 25 tx / 20,710,271 gas / 0.0252747648 test ETH; exact score |
| Matched public mock (same chunk sizes) | 25 tx / 18,755,864 gas; live is 10.42% higher at this point |
| Private 100-SNP | 22 tx / 29,797,061 mock gas; live not executed |

Harness readiness, each asserted rather than eyeballed: refuses the default mnemonic, emits a
provenance block, labels its evidence class, compares against the independent reference, uses
real manifest hashes, supports both model visibilities, records transaction hashes and block
numbers, and hashes the exact validation-runner source.

### Original Sepolia budget estimate

At 1.048 gwei:

| | Gas | ETH |
|---|---:|---:|
| Deployment, four contracts | 5,892,613 | 0.00617 |
| + public 100-SNP job | 11,690,033 | 0.01842 cumulative |
| + private 100-SNP job | 23,507,892 | 0.04305 cumulative |
| **Recommended with 3× headroom** | | **~0.13** |

The original table used streaming mock geometry and underestimated the classic live workflow.
It is retained as planning history, not as measured live cost. Actual live quantities above are
authoritative.

## Optional future private live extension

```sh
MODEL_VISIBILITY=private npm run validate:sepolia
```

This is not required for Phase 7 completion: `R1.1-E2` explicitly permits the documented
private-mock-only fallback already taken. If extending the evidence later, top up the existing
test address first. Do not redeploy; `deployments/sepolia.json` points to the verified contracts.
A fresh private run should have at least ~0.04 additional test ETH so the 29.8 M-gas mock estimate
has useful headroom. The multi-size live HCU probe remains deferred and would require a separate,
larger budget because it redeploys per candidate.

The run writes a full provenance block — commit, input digests, contract addresses **and
bytecode digests**, transaction hashes, and the digest of the independent reference it was
checked against. It also asserts the decoded score against the known answer, so a live pass is
a validation rather than a new unverified number: for the 100-SNP fixture, individual 0, the
expected encoded score is **758,685**, agreed by both the Python reference and the mock contract
path.

`R1.1-E2` no longer needs a private-weight variant:
`MODEL_VISIBILITY=private npm run validate:sepolia` uses the same report-producing harness.
Both public and private modes pass on the Hardhat mock against encoded score 758,685, with
20/22 classic-workflow transactions and a complete receipt trail. The authoritative readiness
record is `readiness_2026-07-31_final/`.

The previously flagged empty-proof finalization path was exercised successfully by the public
live run. That removes the specific untested-path warning for this deployed version; it is one
validation point, not a proof covering future SDK or network revisions.

## Findings

Phase 7 turned up four things, three of them unrelated to the blocker.

### `CD-021` — the HCU ceiling is 21, not 20, and does not depend on model visibility

The probe's candidate list was coarse (10, 15, 20, 25, 32), so 20 was merely the largest
candidate that passed. Bracketing finely:

| Model visibility | Max passing | Min failing | gas/chunk at 20 |
|---|---:|---:|---:|
| public | **21** | 22 | 1,150,414 |
| private | **21** | 22 | 1,604,024 |

Worth checking because the mock's own HCU table prices non-scalar `Uint64` multiplication at
596,000 against 365,000 scalar, and private models multiply ciphertext by ciphertext. A 63%
difference should have moved the ceiling. It did not — which led directly to the next finding.

### `CD-022` — the documented C×P optimisation does not actually happen

`CLAUDE.md` claimed the coprocessor "optimizes C×P internally", and `docs/design.md` claimed
this made public models "~60% cheaper". **Both are false.**

`FHE.asEuint64(w)` returns a real `euint64` handle, so the following `FHE.mul` resolves to the
`euint64 × euint64` overload, which passes `false` as the scalar flag. The mock prices from that
flag, so the public path pays the full non-scalar 596,000 HCU — identical to the private path.
The scalar discount exists and is unused: `FHE.mul(euint64, uint64)` passes `true`.

| Path | HCU per `Uint64` mul |
|---|---:|
| current | 596,000 |
| scalar overload | **365,000** |
| saving | 231,000 (**38.8%**) |

Projected from the measured ceiling of 21: adopting the scalar overload would raise the public
ceiling to about **34** SNPs per chunk, cutting compute transactions for a 5,000-SNP job from
**239 to about 148**. Transaction count is the binding cost and latency constraint in this
design, so that is a material improvement to the scalability story — available with no change to
the protocol or its security properties.

The "~60% cheaper" figure is wrong on its own terms too: measured at chunk size 20, public
compute is 1,150,414 gas against private 1,604,024, so **28%**, and the saving comes from packed
`uint64[]` storage reads rather than from FHE work.

**Documentation corrected in four places; the optimisation itself deliberately deferred.**
Changing `computeChunk` would invalidate the gas, HCU, and adversarial measurements from Phases
4–6, and Stage A exists to freeze evidence, not churn it.

### `CD-023` — private-weight jobs cost ~2× public ones, and the paper prices the wrong one

| | Transactions | Total gas | Ratio |
|---|---:|---:|---:|
| Public weights | 15 | 11,690,033 | 1.00× |
| Private weights | 17 | 23,507,892 | **2.01×** |

The manuscript's cost discussion rests on public-model measurements, but its anti-probing
discussion is explicitly about private models, and Phase 6 established that extraction is *only*
a threat for private models. So the configuration that needs the protection costs roughly double
the one that was priced.

### `CD-024` — the blocker itself, and what the manuscript must do meanwhile

Until a live run exists, the paper must state that all results are Hardhat-mock validated, must
not claim live-network deployment, and must leave the Sepolia HCU ceiling unmeasured for both
visibilities. `MS-05` now carries both branches so Stage B can proceed either way.

## Verification

| Check | Result |
|---|---|
| Contract edits are comment-only | confirmed — zero non-comment diff lines in both contracts |
| `npm run build` | exit 0 |
| `npm run test` | original Phase 7: 156 passing; 31 July readiness follow-up: **167 passing**, 0 failing |
| HCU probe reproducible | `MODEL_VISIBILITY` and `HCU_CHUNK_SIZES` env-controlled |
| Public/private validator modes | PASS on mock; 20/22 transactions; exact score 758,685 |
| Public live validation | **PASS**; 25/25 status-1 receipts; score 758,685 exact |
| On-chain re-verification | 25 receipts, 3 runtime bytecodes, runner source, gas total, and score all match |
| Private live validation | not executed; insufficient test-ETH balance recorded explicitly |
| No result fabricated | failed attempt has null score; mock, live, and projected evidence remain separated |

## Layout

| Path | Contents |
|---|---|
| `live_preflight.json` | Deployment gas, both job variants, budget, harness readiness |
| `hcu_public.txt`, `hcu_private.txt` | Fine-bracketed ceiling measurements |
| `tests_after.txt` | Full suite |
| `readiness_2026-07-31_final/` | authoritative deployment + public/private validator readiness reports |
| `readiness_2026-07-31/` | preserved superseded capture, missing exact runner-source hash |
| `live_2026-07-31/` | live deployment, failed attempt, successful public run, matched mock, receipt verification, and transcripts |
