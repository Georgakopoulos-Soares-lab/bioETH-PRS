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
| `test/rate_limit_dp_test.ts` | 6 | Yes — anti-probing behaviour |
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
