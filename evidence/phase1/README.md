# Phase 1 — Code terminology conformity

- Evidence class: **Hardhat mock**
- Runtime: node v22.23.1, npm 10.9.8 (matches `.nvmrc`)
- Actions: `R1.3-M2` (code half), `R1.5-T1`
- Reviewer comments addressed: R1 C3 (differential privacy), R1 C5 (SNP authenticity)
- Date: 28 July 2026

## What changed

Terminology and documentation only. **No executable logic, no function signature, no storage
layout, and no gas cost changed.**

### `R1.3-M2` (code half) — "DP" removed from the codebase

`DP` / `DP-inspired` is gone, replaced by **bounded randomized categorical release**. The
implemented distribution is untouched: still `FHE.randEuint64(noiseUpperBound)`, one-sided
uniform on `[0, B)`. Per the plan, the distribution was explicitly *not* changed in order to
retain DP terminology.

| File | Change |
|---|---|
| `contracts/ResultOracle.sol` | Three doc blocks rewritten. The contract-level `@dev` block now carries an explicit `TERMINOLOGY` note stating the mechanism is not DP and naming all three reasons: one-sided support, no sensitivity calibration, no composition accounting |
| `test/rate_limit_dp_test.ts` | **Renamed** to `test/rate_limit_randomized_release_test.ts` and given a header explaining the rename and what the file does and does not cover |
| `CLAUDE.md` | Contract map row, invariant 8, invariant 9 |
| `README.md` | ResultOracle description, test-tree listing, test-file table |
| `docs/design.md` | §2.4 mechanism description, bias discussion |
| `docs/onboarding.md` | ResultOracle walkthrough |
| `docs/roadmap.md` | Two future-work entries now name what a formal guarantee would require |
| `docs/reference.md` | Test invocation path |
| `.claude/instructions/solidity-fhevm.md` | Oracle-required mode |
| `.claude/commands/security-review.md` | Section 5 heading and four checklist items |
| `docs/reviewer-questions-assessment.md` | **Supersession banner only** — prior-round history preserved, not rewritten |

The test file's `describe` blocks already read `Noisy Release Hardening`, so no test
description needed changing; the plan had assumed otherwise. Only the filename carried `dp`.

### `R1.5-T1` — crafted-input test relabelled as a trust-boundary record

In `test/prs_compute_engine_chunked_snp_test.ts`, the test formerly named
`"accepts arbitrary encrypted SNP values today; hardcall enforcement remains off-chain"` is now:

```
TRUST BOUNDARY: accepts arbitrary encrypted SNP values, including invalid hard calls
— ciphertext/sample binding is not enforced on-chain
```

A 20-line comment block above it records: what the contracts do and do not guarantee; that
the test inputs `[9, 11]` are deliberately invalid diploid dosages; that `manifestHash` is a
provenance commitment rather than a cryptographic binding; that closing the gap needs signed
laboratory attestation or a ZK ciphertext-to-sample proof; and an instruction to update the
manuscript and `CLAUDE.md` if the test ever starts failing, since that would mean the security
model changed.

The assertion is unchanged — `9x1 + 11x2 = 31` still decodes correctly. The test's *purpose*
is now explicit rather than incidental.

## Verification

| Check | Result |
|---|---|
| `grep -rn "DP-inspired" contracts/ test/` | **0 hits** — exit gate met |
| `grep -rnw "DP" contracts/ test/` | **0 hits** |
| Stale `rate_limit_dp_test` references | none, except the deliberate provenance note in the renamed file's header |
| `npx hardhat clean && npm run build` | exit 0 — 11 contracts, evm `cancun`, 56 typings |
| `npm run test` | exit 0 — **137 passing, 0 failing** (`tests_after.txt`) |
| `npm run validate:mock` | exit 0 — 1 passing (`validate_mock_after.txt`) |

### Proof that behavior is unchanged

`ResultOracle` deployed bytecode, with the trailing CBOR metadata stripped (metadata embeds a
hash of the source text, so it necessarily changes when comments change):

```
before : c9d1640a673f5ff7bfe38076892f8fc26d7bb151a93703f04fbeeb5d0b056332
after  : c9d1640a673f5ff7bfe38076892f8fc26d7bb151a93703f04fbeeb5d0b056332
         3541 bytes, IDENTICAL
```

The executable code is byte-for-byte the same. This is the strongest available evidence that
`R1.3-M2`'s code half is a pure renaming and did not alter the noise mechanism — which matters,
because the plan forbids changing the distribution to preserve terminology.

## Consequence for Stage B

Phase 10 (`R1.3-M1`, `R1.3-M2` manuscript half) must adopt **"bounded randomized categorical
release"** verbatim. The codebase is now the source of truth; the paper copies it rather than
inventing parallel wording. Phase 10 (`R1.5-M1`) cites the renamed trust-boundary test as
evidence that the limitation is acknowledged in the implementation, not just in prose.
