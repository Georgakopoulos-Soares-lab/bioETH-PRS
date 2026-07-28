# Claim deltas

Every submitted-manuscript claim, or plan assumption, that Stage A evidence contradicts,
weakens, or fails to support. Stage A **records** deltas here and does not edit the
manuscript. Stage B works through this file and resolves each entry.

Columns: `ID` · what the submitted text or plan says · what the evidence shows · which action
resolves it.

Status: `open` · `resolved-in-tex` · `withdrawn`

---

## CD-001 — `R2.4-E1` file scope is understated

- **Opened:** Phase 0, 28 July 2026
- **Status:** open
- **Resolves via:** `R2.4-E1` (Phase 4)

The plan lists three files for zero-manifest-hash remediation: `scripts/sepolia_validation.ts`,
`scripts/heprs_fixture_profile.ts`, and `test/heprs_fixture_test.ts`. A repository-wide search
finds `ethers.ZeroHash` in **ten** files:

| File | Occurrences | Produces reported evidence? |
|---|---:|---|
| `scripts/sepolia_validation.ts` | 4 | Yes — live and mock validation runs |
| `scripts/heprs_fixture_profile.ts` | 4 | Yes — HEPRS fixture timing and gas |
| `scripts/gas_profile.ts` | 4 | Yes — gas vs SNP-count curve |
| `scripts/probe_hcu_ceiling.ts` | 4 | Yes — HCU ceiling figures |
| `test/heprs_fixture_test.ts` | 8 | Yes — fixture correctness |
| `test/rate_limit_randomized_release_test.ts` | 6 | Yes — anti-probing behaviour |
| `test/registry_marketplace_oracle_test.ts` | 18 | No — unit fixtures |
| `test/model_marketplace_chunked_test.ts` | 19 | No — unit fixtures |
| `test/prs_compute_engine_chunked_snp_test.ts` | 13 | No — unit fixtures |
| `test/job_lifecycle_test.ts` | 2 | No — unit fixtures |

`scripts/gas_profile.ts` and `scripts/probe_hcu_ceiling.ts` both feed numbers that appear in
the submitted manuscript (gas scaling curve, HCU ceiling) yet were not in the plan's
remediation list. **Action:** extend `R2.4-E1` to all six evidence-producing files. Unit-test
fixtures may keep `ZeroHash`, since they assert contract logic rather than report measurements.

---

## CD-002 — Baseline artifacts were produced on an unsupported node runtime

- **Opened:** Phase 0, 28 July 2026
- **Status:** **resolved** (Phase 0, 28 July 2026)
- **Resolved by:** installing nvm 0.40.6 and pinning node v22.23.1, then re-capturing the
  entire baseline from a fresh `npm ci`

`.nvmrc` pins node 22; the first Phase 0 capture ran on the system node v25.5.0 and Hardhat
2.22 warned `You are currently using Node.js v25.5.0, which is not supported by Hardhat`.
Compile and all 137 tests passed regardless, but a measurement taken on an unsupported runtime
is not defensible in a manuscript under review for evidence quality.

Resolution: nvm 0.40.6 installed at `~/.nvm` with the loader added to `~/.zshrc`; node
v22.23.1 (npm 10.9.8) installed and set as the default alias. `node_modules` was rebuilt from
scratch with `npm ci` so no native module retained the node 25 ABI, then `npx hardhat clean`
forced a full recompile. Re-captured results are identical — 11 contracts compiled, **137
passing**, 100-SNP mock validation passing — and the unsupported-runtime warning is absent
from `baseline/compile.txt`.

**Standing rule for the rest of Stage A:** run `nvm use` (which reads `.nvmrc`) before any
command that produces a reportable number. Every artifact in `evidence/` must record its
runtime in the same way `baseline/environment.txt` does.

---

## CD-003 — `R1.3-M2`'s code scope was 10 files, not the 2 the plan named

- **Opened:** Phase 1, 28 July 2026
- **Status:** **resolved** (Phase 1, 28 July 2026)
- **Resolved by:** extending the rename to every file that carried DP framing

The plan scoped the code half of `R1.3-M2` to `contracts/ResultOracle.sol` and
`test/rate_limit_dp_test.ts`. A repository-wide search found DP framing in ten files. Leaving
any of them would have let Stage B pick up "DP-inspired" from repo documentation and reintroduce
the exact wording Reviewer 1 objected to.

Renamed: `contracts/ResultOracle.sol`, `CLAUDE.md`, `README.md`, `docs/design.md`,
`docs/onboarding.md`, `docs/roadmap.md`, `docs/reference.md`,
`.claude/instructions/solidity-fhevm.md`, `.claude/commands/security-review.md`.

Two findings inside this scope correction:

1. **`test/rate_limit_dp_test.ts` needed no description changes.** Its `describe` blocks
   already read `Noisy Release Hardening`. Only the *filename* carried `dp`, so the file was
   renamed to `test/rate_limit_randomized_release_test.ts`. The plan's assumption that test
   descriptions said "DP" was wrong.
2. **`docs/reviewer-questions-assessment.md` was not rewritten.** It records a *previous*
   review round in which "DP-inspired" was itself the agreed remediation. Rewriting it would
   erase that history and make the document self-contradictory. It received a supersession
   banner instead, explaining that RTR Reviewer 1 Comment 3 rejected the earlier wording and
   pointing at the current terminology. Its "Recommended wording" block is marked do-not-reuse.

**Standing rule for Stage B:** the manuscript adopts **"bounded randomized categorical
release"** verbatim. Do not coin a third variant.

---

## CD-004 — Two submitted-manuscript algorithms show an interface that no longer exists

- **Opened:** Phase 2, 28 July 2026
- **Status:** open
- **Resolves via:** `R1.4-C1` manuscript conformity in Phase 9/10, and `R1.4-M1` in Phase 11

Both paper algorithms — `Classic chunked PRS computation` and `Streaming PRS computation` —
show the requester passing \(\tau_L, \tau_H\) into classification. After Phase 2 the requester
passes only a job id; the thresholds are model-defined and immutable. Both algorithm listings
must be redrawn, and `Noisy Output Release` must state that thresholds are fixed before any
query is possible.

Two further conformity items found while implementing:

1. **`setOracleRequired` / `setApprovedOracle` are gone**, not merely superseded. Any manuscript
   or documentation sentence describing a two-step "enable oracle mode, then register an
   approved oracle" workflow is now wrong. The workflow is a single `setReleasePolicy` call
   before `finalizeModel`.
2. **Multi-wallet coverage already existed.** `R1.4-T1` asked for tests proving a registered
   sample stays rate-limited across wallets. Two such tests were already present and passing
   (`blocks the same sample across requesters when the sample window is exhausted`,
   `rate limits are independent across different samples and requesters`). No new tests were
   needed for that half of the action, but the manuscript must cite the existing tests rather
   than claim new ones, and must state plainly that they document a **remaining Sybil boundary**
   rather than closing it: distinct wallets with distinct registered samples still receive
   independent windows.

## CD-005 — Phase 6's attack baseline cannot come from the shipped contracts

- **Opened:** Phase 2, 28 July 2026
- **Status:** open
- **Resolves via:** `R1.4-E1` (Phase 6)

`R1.4-E1` must compare fixed thresholds against "the old caller-selected threshold design."
Retaining a legacy threshold-taking entry point in the shipped contracts would violate
`R1.4-C1`'s completion criterion ("No protected classification entry point allows the requester
to choose thresholds"), so none was kept.

The baseline arm must therefore deploy the pre-Phase-2 contracts from the frozen snapshot
`2d6f21d`. This is strictly better than a legacy shim: it measures the **genuine submitted
design** rather than an approximation, and it keeps the shipped contracts free of an attack
surface that exists only for benchmarking. Phase 6 must record which commit each arm was
compiled from.
