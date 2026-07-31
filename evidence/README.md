# `evidence/` — Stage A artifact store

Every number, table, and figure in the revised manuscript must originate from a file in this
directory. Nothing in the manuscript may cite a number that does not exist here first.

See [`../bioETH-PRS_RTR_acceptance_plan.md`](../bioETH-PRS_RTR_acceptance_plan.md) for the
35-action plan. Stage A (phases 1–8) fills this directory; Stage B (phases 9–13) writes the
manuscript from it and touches nothing else.

## Rules

1. **Every artifact declares its evidence class.** One of exactly three values:
   - `Live fhEVM` — produced by a transaction on a real fhEVM network.
   - `Hardhat mock` — produced by the `@fhevm/hardhat-plugin` mock coprocessor. Validates
     protocol and contract logic; does **not** measure real FHE latency, HCU availability,
     or production fees.
   - `Analytic projection` — derived by calculation, not executed. Must be labelled
     unexecuted wherever it appears.
2. **Every artifact carries provenance** (action `R2.4-E1`): repository commit, model and
   fixture hashes, manifest hash, contract bytecode/address for live runs, transaction IDs,
   and the independent reference output hash. No `ethers.ZeroHash` manifests.
3. **Machine-readable first.** JSON or CSV is the artifact; any Markdown report is a
   rendering of it, never the sole record.
4. **Append-only in spirit.** Do not overwrite a run to "fix" it. Write a new file and note
   the supersession in `claim_deltas.md`.

## Layout

| Path | Produced by | Contents |
|---|---|---|
| `baseline/` | Phase 0 | Pre-revision compile, test, and environment capture |
| `phase1/`–`phase6/` | Phases 1–6 | Code conformity, provenance, correctness, and adversarial evidence |
| `phase7/` | Phase 7 | Live readiness, one verified public Sepolia run, a preserved failed attempt, private mock-only fallback, and receipt-level provenance |
| `phase8/` | Phase 8 | Three-class scale table, live and mock transaction use, and separate fee sensitivity |
| `claim_deltas.md` | Phases 1–8 | Every submitted claim the new evidence contradicts or fails to support |

Stage A is complete. Its live boundary is deliberately asymmetric: the public 100-SNP path is
verified on Sepolia, while private-weight execution is implemented and Hardhat-mock validated
but was not executed live. Larger rows remain mock observations or unexecuted projections as
labelled in `phase8/scale_evidence.json`.

## Stage A → Stage B gate

Do not edit `bioeth_prs (4).tex` until:

- all 16 Stage A actions are complete;
- `npm run build` and the full test suite pass;
- every number destined for the manuscript exists here with a declared evidence class;
- `claim_deltas.md` is complete.
