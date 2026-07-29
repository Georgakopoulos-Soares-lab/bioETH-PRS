# Phase 7 — Live fhEVM validation: **BLOCKED**, with everything else established

- Status: **`R1.1-E1` and `R1.1-E2` cannot be completed in this environment**
- Blocker: no funded Sepolia wallet. `MNEMONIC` is unset and `sepolia_validation.ts` correctly
  refuses the public Hardhat test mnemonic.
- Evidence class of everything below: **Hardhat mock**. No network transaction was made and no
  live number has been fabricated.
- Date: 29 July 2026

## What is blocked, and why that is the right outcome

`R1.1-E1` (live public-weight run) and `R1.1-E2` (live private-weight run) both require
transactions on a live fhEVM network. `npx hardhat vars list` is empty, so the config would fall
back to the public Hardhat test mnemonic — and the validation script refuses that by design,
since signing with a publicly known key on a real network is unsafe.

I did not work around the guard, and I did not synthesise a live result. The plan anticipates
this: `R1.1-E2` says "either a successful private-weight transaction record exists, or the
manuscript explicitly says private-weight execution is mock-validated only." Absent credentials
that fallback applies to **both** runs. See `CD-024`.

## What Phase 7 did establish

The remaining gap is now exactly "fund a wallet and run one command", not an open question.

| Check | Result |
|---|---|
| Sepolia RPC reachable | yes — chain ID 11155111, block 11374028 |
| Sepolia gas price (read from network) | 1.048 gwei |
| All contracts within EIP-170 (24,576 B) | yes — largest is `PRSComputeEngine` at 10,426 B (42.4%) |
| Live harness readiness | 5/5 properties verified |
| Deployment gas measured | 5,892,613 |
| 100-SNP job measured, public and private | 15 tx / 11.69 M gas and 17 tx / 23.51 M gas |

Harness readiness, each asserted rather than eyeballed: refuses the default mnemonic, emits a
provenance block, labels its evidence class, compares against the independent reference, and
uses real manifest hashes.

### Sepolia budget

At 1.048 gwei:

| | Gas | ETH |
|---|---:|---:|
| Deployment, four contracts | 5,892,613 | 0.00617 |
| + public 100-SNP job | 11,690,033 | 0.01842 cumulative |
| + private 100-SNP job | 23,507,892 | 0.04305 cumulative |
| **Recommended with 3× headroom** | | **~0.13** |

## To complete Phase 7

```sh
npx hardhat vars set MNEMONIC          # a funded Sepolia wallet, NOT the test mnemonic
npx hardhat vars set INFURA_API_KEY    # optional; a public RPC is the default

npm run deploy:sepolia                 # writes deployments/sepolia.json
npm run validate:sepolia               # R1.1-E1: public 100-SNP live run
npm run probe:hcu                      # the live HCU ceiling, still unmeasured
```

The run writes a full provenance block — commit, input digests, contract addresses **and
bytecode digests**, transaction hashes, and the digest of the independent reference it was
checked against. It also asserts the decoded score against the known answer, so a live pass is
a validation rather than a new unverified number: for the 100-SNP fixture, individual 0, the
expected encoded score is **758,685**, agreed by both the Python reference and the mock contract
path.

`R1.1-E2` needs a private-weight variant of `sepolia_validation.ts`. The pre-flight confirms the
private path works end to end on the mock, so the work is parameterisation rather than
discovery. One live-specific risk to watch, already flagged in the contract comments:
`classifyPreauthorized` imports the score with an empty-proof `FHE.fromExternal`, which depends
on the sender owning the handle — that holds within a single transaction but has not been
exercised against a real coprocessor.

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
| `npm run test` | **156 passing**, 0 failing |
| HCU probe reproducible | `MODEL_VISIBILITY` and `HCU_CHUNK_SIZES` env-controlled |
| No live number fabricated | no network transaction was made |

## Layout

| Path | Contents |
|---|---|
| `live_preflight.json` | Deployment gas, both job variants, budget, harness readiness |
| `hcu_public.txt`, `hcu_private.txt` | Fine-bracketed ceiling measurements |
| `tests_after.txt` | Full suite |
