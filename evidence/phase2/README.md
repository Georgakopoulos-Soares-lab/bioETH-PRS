# Phase 2 — Release-policy hardening

- Evidence class: **Hardhat mock**
- Runtime: node v22.23.1, npm 10.9.8 (matches `.nvmrc`)
- Actions: `R1.4-C1` (contract change), `R1.4-T1` (tests)
- Reviewer comment addressed: R1 C4 (model extraction / adaptive querying)
- Baseline compared against: `evidence/baseline/wide/`, commit `b0c86a4`
- Date: 28 July 2026

## The problem this closes

`PRSComputeEngine.finalizeAndClassify(jobId, oracle, lowThreshold, highThreshold)`
let the **requester** choose both classification thresholds on every call. A requester
could therefore hold the genotype fixed and sweep the thresholds across successive
jobs, performing a **binary search on the encrypted score**. That recovers far more
information per query than the ternary Low/Medium/High output suggests, and it largely
defeats the bounded randomized release, whose protection assumes the attacker observes
a coarse categorical answer rather than a chosen-precision comparison.

Mitigating this with a wider minimum threshold gap only bounds the resolution of a
single query. It does not remove the adaptive channel. Removing the parameter does.

## What changed

### `R1.4-C1` — release policy in ModelMarketplace

New `ReleasePolicy` struct, one per model:

| Field | Meaning |
|---|---|
| `oracle` | the approved oracle contract |
| `lowThreshold` | scores below this (after noise) map to Low |
| `highThreshold` | scores at or above this (after noise) map to High |
| `oracleRequired` | when true, only the oracle path may release output |
| `configured` | true once `setReleasePolicy` has been accepted |

`setReleasePolicy(modelId, oracle, lowThreshold, highThreshold, requireOracle)` is
guarded by `_requireOwnedDraftModel`, so it is callable **only by the model owner and
only while the model is a draft**. There is deliberately no update and no clear
function. Once `finalizeModel` runs, the policy is frozen for the life of the model.

It validates at configuration time:

- `oracle != address(0)`
- `lowThreshold < highThreshold`
- `highThreshold - lowThreshold >= INoiseBoundedOracle(oracle).noiseUpperBound()`

The last check previously fired only when a job was classified. Moving it forward means
a model cannot be published carrying a policy that would revert on first use.

**Removed:** `setOracleRequired` and `setApprovedOracle`, along with the
`oracleRequired` and `approvedOracles` mappings. Both were mutable after model
finalization, which was itself a bypass — an owner could publish under a strict policy
and then swap the oracle or relax the requirement once requesters had committed.
`isOracleRequired` and `getApprovedOracle` survive as **read-only views** over the
policy, so a single source of truth remains.

### `R1.4-C1` — engine

```solidity
function finalizeAndClassify(uint256 jobId) external returns (euint8)
```

One argument. The oracle and both thresholds are read from
`marketplace.getReleasePolicy(job.modelId)`. A model without a policy reverts with
`Model has no release policy`.

### `R1.4-T1` — tests

Suite went 137 → **140 passing, 0 failing**. Nineteen tests failed against the new
interface before migration, which is the criterion the plan asked for: the old
caller-selected interface no longer type-checks or exists.

New coverage in `test/job_lifecycle_test.ts`, under
`describe("Release policy — model-defined thresholds and oracle")`:

| Test | Asserts |
|---|---|
| `R1.4-T1: no protected classification entry point accepts requester thresholds` | `finalizeAndClassify` has exactly one overload taking exactly one arg named `jobId`; **no** engine function anywhere has a parameter matching `/threshold/i`; `setOracleRequired` and `setApprovedOracle` are absent from the ABI |
| `the policy is immutable once the model is finalized` | `setReleasePolicy` reverts `Model already finalized` |
| `setReleasePolicy validates the oracle and the thresholds at configuration time` | zero oracle, inverted pair, equal pair, sub-noise-bound gap all rejected; gap exactly equal to the bound accepted |
| `finalizeAndClassify reverts when the model has no release policy` | unconfigured models have no protected path |
| `getReleasePolicy` / empty-policy / `ReleasePolicySet` | policy round-trips; views agree; event fires |

In `test/registry_marketplace_oracle_test.ts`, the two former threshold-guard tests
drove an inverted and an equal pair through `finalizeAndClassify`. Those cases are now
unreachable from the engine, so they were replaced by a stronger behavioural test —
`classification reflects the model's policy thresholds, not any caller-supplied value`
— which runs a job whose noisy score provably lands below the policy's `lowThreshold`
and asserts the returned category is `Low`. That proves the policy is the value
actually applied, rather than a stored field nothing reads.

The ABI-level assertion is the important one. Requester-supplied thresholds are not
rejected at runtime; they are **absent from the interface**, so the attack cannot be
expressed against this contract at all.

## Verification

| Check | Result |
|---|---|
| `npm run build` | exit 0 — 11 contracts, evm `cancun` |
| `npm run test` | exit 0 — **140 passing, 0 failing** (`tests_after.txt`) |
| `npm run validate:mock` | exit 0 — 1 passing (`validate_mock_after.txt`) |
| `npm run probe:hcu:mock` | exit 0 — ceiling unchanged, `20 < ceiling <= 25` (`hcu_ceiling_after.txt`) |
| Stale API references in `scripts/` | none |

## Gas impact

Full table in `gas_delta.md`. Summary: **negligible and not attributable to the new
logic.**

| Metric | Delta | % |
|---|---:|---:|
| Total gas (100 SNPs) | +60 | +0.0003% |
| Total gas (600 SNPs) | +916 | +0.0009% |
| Finalize gas | +34 | +0.0182% |
| Job create gas | +22 | +0.0073% |
| Model publish gas | 0 | 0% |

`createPRSJob` moved by +22 gas despite not being touched. The cause is Solidity's
selector-dispatch ordering in `ModelMarketplace`: removing two external functions and
adding two others changes the comparison sequence, so reaching `getModelConfig`'s
selector costs a few more comparisons. This is dispatch overhead, not a logic change.

The HCU ceiling is unchanged, which matters more than gas: the release policy is read
with plain `SLOAD`s and adds no FHE operations to the classification path.

### One-time per-model cost

`scripts/release_policy_gas.ts` (`npm run profile:policy-gas`), recorded in
`release_policy_gas.txt`:

| Transaction | Gas |
|---|---:|
| `setReleasePolicy` | **77,314** |
| `finalizeAndClassify` | 432,230 |

`setReleasePolicy` is a fixed one-time cost per published model, **independent of
variant count**. `scripts/gas_profile.ts` publishes models without a policy, so its
`Model publish gas` figure excludes it; Phase 8's cost synthesis must add it once per
model rather than per SNP.

## Consequences for later phases

- **Phase 6 (`R1.4-E1`)** needs the old caller-selected design as an attack baseline.
  It is **not** retained in the shipped contracts — keeping a legacy threshold-taking
  entry point would violate `R1.4-C1`'s completion criterion. The baseline arm must
  deploy the pre-Phase-2 contracts from the frozen snapshot `2d6f21d`, which is the
  genuine submitted design rather than an approximation of it.
- **Phase 10 (`R1.3-M2`)** must state that thresholds are model-defined and fixed
  before querying.
- **Phase 11 (`R1.4-M1`)** replaces the 2,800-hour claim with Phase 6 numbers measured
  against this hardened interface.
- **Phase 9/10** must update both paper algorithms: `Classic chunked PRS computation`
  and `Streaming PRS computation` currently show the requester passing
  \(\tau_L, \tau_H\). They no longer do.
