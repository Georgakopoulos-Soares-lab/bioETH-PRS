# Phase 4 — Evidence provenance

- Evidence class: **Hardhat mock**
- Runtime: node v22.23.1, Python 3.9.6
- Action: `R2.4-E1`
- Reviewer comment addressed: R2 C4 (who guarantees the number is correct)
- Date: 28 July 2026

## What changed

Every evaluation script previously passed `ethers.ZeroHash` for both `manifestHash` and
`sourceModelHash`, so a figure printed in the manuscript could not be tied back to the
fixture that produced it. All six evidence-producing files now commit to their real
inputs through a shared helper, `scripts/utils/provenance.ts`.

| File | Provenance kind | Committed to |
|---|---|---|
| `scripts/sepolia_validation.ts` | fixture | manifest, weight, and genotype file bytes; reference output |
| `scripts/heprs_fixture_profile.ts` | fixture | as above, per fixture size |
| `test/heprs_fixture_test.ts` | fixture | as above, incl. the 5,000-SNP overflow run |
| `scripts/gas_profile.ts` | synthetic | canonical digest of the generation spec |
| `scripts/probe_hcu_ceiling.ts` | synthetic | canonical digest of the generation spec |
| `scripts/release_policy_gas.ts` | synthetic | canonical digest of the generation spec (added late — see `CD-013`) |

Each run now records: repository commit and dirty flag, branch, node version, network and
chain id, per-input file digests with byte counts, the three model hashes, deployed
contract addresses **and bytecode digests**, and — where one exists — the digest of the
independent reference output the run was checked against.

Fixture runs deliberately hash the **same model manifest the independent Python reference
consumes**, so a reader can confirm both arms used one description of genome build, variant
order, effect alleles, and missing-data policy. Sample registration moved from
`registerSample` to `registerSampleWithManifest`, which the contract already refuses to
accept with a zero hash.

Synthetic runs have no file to hash, so they commit to the **generation spec**. That is the
only reproducibility available for programmatically generated inputs, and recording it also
stops those figures being mistaken for fixture-backed results.

The provenance block contains **no timestamp**, deliberately. Two runs at the same commit
over the same inputs must produce a byte-identical block, so a reader can verify it rather
than merely read it.

## Verification

| Check | Result |
|---|---|
| `ZeroHash` in evidence-producing files | **0** — was 26 occurrences across 6 files |
| `npm run test` | exit 0 — **149 passing**, 0 failing (was 140; +9 guard tests) |
| `npm run validate:cross-language` | **PASSED**, tolerance 0 |
| `npm run validate:mock` | exit 0 — decrypted score matches expected |
| `npm run probe:hcu:mock` | exit 0 — ceiling unchanged, `20 < ceiling <= 25` |
| `npm run profile:gas` / `profile:heprs` / `profile:policy-gas` | exit 0 |

### The guard is what makes the fix stick

`test/provenance_guard_test.ts` (9 tests, 6 guarded files) fails in CI if a guarded file reintroduces
`ZeroHash`, if a guarded file stops importing the helper, or if the behavioural-exemption
list goes stale. A one-off cleanup would not have held: the next person adding an evaluation
script reaches for `ZeroHash` because it compiles and the contracts accept it.

It also asserts the properties the digests must have: `assertProvenanceHash` rejects zero and
malformed values; canonical JSON hashing is key-order independent, so a digest depends on
content rather than key insertion order; the three role digests are distinct, so genotype and
weight provenance cannot be conflated; synthetic provenance is deterministic for a given spec;
fixture digests equal `keccak256` over the exact file bytes, so a reader can recompute them
without this tool; and the registry itself rejects a zero sample manifest hash.

## The defect this phase caught

Wiring the manifest hash and the reference-output hash into one provenance block forced the
Python reference and the on-chain run to be compared directly for the first time on real
fixture data. They disagreed: 758,685 on-chain against 252,895 from the reference — a ratio of
exactly 3.

Neither implementation was wrong. The advisor's balanced scale is **3 × 10⁶** for the 100- and
500-SNP fixtures, not 10⁶, and Phase 3's manifest generator had defaulted to a flat 10⁶. It was
a model *parameter* mismatch, and it sharpens the independence claim: independence concerns the
derivation of the *algorithm*, not the choice of *inputs and parameters* — both arms must use
the same scale or the comparison means nothing.

Had it survived, Phase 5 would have compared 200 individuals at mismatched scales and reported
a uniform 3× disagreement, which looks exactly like a correctness failure in the encoding.

Fixed by making the advisor scale an explicit recorded table that raises on an unknown fixture
size rather than guessing, asserted in the self test. All four reference files regenerated. See
`CD-010`.

**The 100-SNP validation now cross-validates:** the independent Python reference and the
contract path agree exactly on individual 0 at `encodedScore = 758,685`, `PRS = 0.003843`,
round-trip error 0. That is the first agreement between the reference and real contract
execution on fixture data, as opposed to on the constructed known-answer cases.

## Gas impact, attributed by phase

Full table in `gas_delta.md`. Attribution matters here: Phase 2 shifted several figures by tens
of gas through selector-dispatch reordering, and Phase 4 shifts model publication materially.
Reporting one combined delta would conflate them.

| Metric | Baseline | After P2 | After P4 | P4 delta |
|---|---:|---:|---:|---:|
| Model publish gas (100 SNPs) | 1,084,966 | 1,084,966 | 1,125,534 | **+40,568** |
| Job create gas | 301,248 | 301,270 | 301,270 | 0 |
| Compute gas | 5,626,216 | 5,626,326 | 5,626,326 | 0 |
| Finalize gas | 186,964 | 186,998 | 186,998 | 0 |
| HCU ceiling | 20 < c ≤ 25 | 20 < c ≤ 25 | 20 < c ≤ 25 | unchanged |

`+40,568 gas` is **flat per model, independent of variant count** — two `SSTORE`s from zero to
nonzero. As a share of model publication it is +3.74% at 100 SNPs, +0.81% at 600. Compute and
the HCU ceiling are untouched, because provenance uses ordinary storage operations and adds no
homomorphic work.

This is a claim delta, not merely a cost increase — see `CD-012`. The submitted manuscript
describes `manifestHash` as anchoring provenance, and `R1.5-M2` commits us to that description.
A deployment that actually records provenance pays this cost, so the published
model-publication figures correspond to a configuration in which provenance was *not* recorded.
The increment being fixed per model means it is proportionally largest for exactly the small
curated panels the paper identifies as its intended use.

## A measurement-precision finding

Three consecutive runs at identical commit and inputs:

| Run | Model publish | Compute | SNP upload | Total |
|---:|---:|---:|---:|---:|
| 1 | 1,125,534 | 5,626,326 | 10,287,985 | 17,528,113 |
| 2 | 1,125,534 | 5,626,326 | 10,287,997 | 17,528,125 |
| 3 | 1,125,534 | 5,626,326 | 10,287,721 | 17,527,849 |

Model publish and compute are exactly reproducible. **`SNP upload gas` is not** — a spread of
~276 gas (~0.003%), inherited by `Total gas`. Most likely the mock's input-proof bytes depend on
generated handle values, and calldata is charged per byte at different rates for zero and
non-zero bytes.

The magnitude is negligible; the reporting convention is not. The submitted manuscript quotes
gas to the individual unit, implying a determinism the upload path lacks. See `CD-011`.

## Findings

| ID | Summary |
|---|---|
| `CD-009` | Scope narrowed to 5 files: the rate-limit test is behavioural, not evidence-producing. Enforced by the guard, including staleness of the exemption list |
| `CD-010` | Phase 3 used the wrong advisor scale for the 100/500-SNP fixtures. Caught here, fixed, references regenerated |
| `CD-011` | `SNP upload gas` is not reproducible to the gas; the paper over-reports precision |
| `CD-012` | Model publication gas was measured with zero hashes and is understated by a flat +40,568 per model |
| `CD-013` | The guard list was built from CD-001's Phase-0 inventory and missed `scripts/release_policy_gas.ts`, added in Phase 2. A `grep` sweep caught it, not the guard — the guard cannot detect its own incompleteness |

## Consequences for later phases

- **Phase 5 (`R2.7-E1`)** — unblocked, and the reference files are now at the correct scale.
  The 200-individual comparison would have been meaningless before `CD-010` was fixed.
- **Phase 7 (`R1.1-E1`/`E2`)** — `sepolia_validation.ts` now emits a full provenance block, so
  a live run automatically records commit, input digests, contract bytecode digests, and the
  reference output it was checked against. That is what makes the live claim verifiable.
- **Phase 8 (`R1.8-E1`)** — must report model publication with real hashes (`CD-012`) and state
  gas to a defensible precision (`CD-011`).
- **Phase 11 (`R2.4-M1`)** — the correctness-guarantee table can now name what the end user
  verifies: manifest hashes, contract addresses and bytecode digests, and the transaction record.
