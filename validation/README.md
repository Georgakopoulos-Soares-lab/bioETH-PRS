# `validation/` — independent reference implementation

Double programming for bioETH-PRS. RTR actions `R2.6-C1`, `R2.6-T1`, `R2.2-C1`,
`R2.3-C1`, and the executable half of `R2.2-T1` / `R2.3-T1`. Answers Reviewer 2
comments 2, 3, and 6.

## One command

```sh
npm run validate:cross-language
```

Runs both implementations over the same immutable inputs and returns a single
pass/fail. Also gates `npm run validate:local`.

## Why this exists

Reviewer 2 asked whether bioETH-PRS could support double programming or independent
validation of the final score. This directory is the answer: a second, independent
implementation of the whole scoring pipeline, plus a command that fails loudly if the
two disagree.

Two arms:

| Arm | Implementation | Arithmetic |
|---|---|---|
| **A** | [`independent_prs_reference.py`](independent_prs_reference.py) — Python, standard library only | exact decimal |
| **B** | [`contract_case_run.ts`](contract_case_run.ts) — the repo's existing TypeScript helpers plus real FHE arithmetic through the deployed contracts | binary float off-chain, integer on-chain |

## The independence claim, stated precisely

The Python was written **from the manuscript**: `bioeth_prs (4).tex` sections
"Polygenic Risk Scores" (Equation 1) and "Quantisation Scheme" (the three-step
encoding), plus `docs/design.md`. It does not import, translate, or transcribe
`test/utils/heprs.ts`, and its author had not read that file when it was written.

Ordering matters for that claim to mean anything, so it is recorded: the Python was
written and its 56 known-answer self-checks were passing — including the manuscript's
worked example reproduced exactly — **before** `test/utils/heprs.ts` was opened to
build Arm B. Reading the TypeScript afterwards cannot retroactively influence a file
that was already finished and verified.

This matters because agreement between two implementations is only evidence if they
were derived separately. Two transliterations of each other agree by construction and
demonstrate nothing.

Consequence: where the specification is ambiguous, the Python follows the
specification and **records the ambiguity** rather than quietly matching the
TypeScript. Three such findings came out of this and are logged as `CD-006`, `CD-007`,
and `CD-008` in the revision record.

## What it implements

**Equation 1.** `PRS = sum_i g_i * beta_i`, where `g_i` is the dosage of the
*model-specified effect allele* — not the minor allele. That distinction is Reviewer 2
comment 3 and is handled by the harmonisation step below.

**The three-step unsigned encoding**, from the Quantisation Scheme:

```
Step 1  scale         q_i = round(s * beta_i)
Step 2  weight shift  z_w = max(0, -min_i q_i)     u_i = q_i + z_w >= 0
Step 3  score shift   z_s = sum over q_i<0 of 2|q_i|
                      partialSum = sum_i g_i u_i
                      G          = sum_i g_i
                      e          = (partialSum + z_s) - z_w * G
        decode        PRS = (e - z_s) / s
```

`max(0, ...)` in Step 2 is a deliberate departure from the manuscript, which writes
`z_w = -min_i q_i` unconditionally. See `CD-007`.

**Genotype preprocessing and QC** (`R2.2-C1`), all at scoring time:

| Rule | Behaviour |
|---|---|
| Hard calls | dosage must be an integer in `{0,1,2}`; `0.7` and `9` are **rejected**, never clamped |
| Missing data | policy is **required** in the manifest — `reject`, `zero_dosage`, or `mean_dosage`. There is no default, because an implicit zero is a silent imputation that changes the score |
| Genome build | must be declared alongside the genotypes and must match the manifest; a mismatch is fatal, not a warning |
| Variant order | verified element-by-element against the manifest, not merely by length — the dot product is positional |
| Duplicates | duplicate variant ids rejected at manifest load |
| Multiallelic / indel | rejected; this paper evaluates biallelic SNP hard calls only |
| Intercept column | declared explicitly and handled separately (see below) |

Every run emits counts of matched, intercept, missing, imputed, invalid, and rejected
variants, so a caller can never mistake a partially-scored sample for a complete one.

**Effect-allele harmonisation** (`R2.3-C1`). Reviewer 2's point is that a genotype may
count risk alleles while the weights were derived counting minor alleles. Decision
rules:

1. Multiallelic or non-SNP → reject.
2. Palindromic `REF`/`ALT` pair (`A/T` or `C/G`) without explicit strand resolution →
   reject as strand-ambiguous. A literal allele match is *not* sufficient here: for an
   `A/T` SNP, effect allele `A` is consistent with both the forward `ALT` and the
   reverse-strand reading of `REF`, so aligning on the label alone would silently flip
   roughly half of such variants.
3. Effect allele is the counted allele → keep the dosage.
4. Effect allele is the other allele → `g_effect = 2 - g`. This is the `[0,1,2]` →
   `[2,1,0]` case.
5. Neither matches but the complement of the effect allele does, on a non-palindromic
   pair → strand flip, then re-apply 3–4.
6. Otherwise → reject as incompatible.

Reports match / flip / strand-flip / strand-ambiguous / incompatible counts.

## The intercept column

The HEPRS fixtures carry a leading constant column: weight `0`, dosage `1` for every
individual. The encoded vector length is therefore `nominal + 1` — 101 positions for
the "100 SNP" fixture.

Its value `1` is coincidentally a legal hard call, so validating it as a dosage would
pass **by luck** and could hide a genuine column-misalignment error. It is therefore
declared in the manifest (`"intercept": true`), counted separately from dosages, and
required to be exactly `1`. It still takes part in the arithmetic, where it is
self-consistent: `u = 0 + z_w`, contributing `z_w` to `partialSum` and `1` to `G`, and
the `z_w * G` correction cancels it.

## Fixture caveat

The HEPRS fixtures ship as bare numeric matrices — no variant identifiers, no genome
build, no allele labels. They are therefore **assumed pre-aligned**, and the generated
manifests say so (`"genome_build": "UNSPECIFIED_ASSUMED_CONSISTENT"`,
`"assumed_pre_aligned": true`). No strand or build validation is possible on them,
because they carry no information with which to do it. The harmonisation logic is
exercised instead by the known-answer cases and the self test, where the alleles are
specified.

## Layout

| Path | Contents |
|---|---|
| `independent_prs_reference.py` | Arm A. Subcommands: `score`, `run-case`, `compare`, `selftest`, `fixture-manifest` |
| `contract_case_run.ts` | Arm B. Hardhat test; writes contract output as JSON |
| `cross_language_check.sh` | The one command; runs both arms and compares |
| `cases/*.json` | Immutable known-answer cases with hand-computed expectations |
| `manifests/*.json` | Generated manifests for the HEPRS fixtures |

## Known-answer cases

| Case | Exercises |
|---|---|
| `positive_weights` | all-positive weights, so `z_w` clamps to 0 and `z_s` is 0 — the branch the manuscript's unconditional formula would make negative |
| `mixed_signed_weights` | mixed signs; individual 0 **is** the manuscript's worked example verbatim; individual 1 yields a negative PRS that must still encode non-negative |
| `allele_reversal` | one variant with `effect_allele == REF`, confirming `[0,1,2]` → `[2,1,0]` on that variant only, and that the flip happens off-chain before encryption |

Each case file carries a `hand_checked` block with values computed by hand. `run-case`
re-derives them and reports any disagreement, so the **fixtures are validated too,
not trusted**. That caught a real defect during construction: two cases originally
used a `G/C` allele pair, which is palindromic, so the harmoniser correctly rejected
those variants. The fixtures were wrong, not the code.

## Tolerance

The default comparison tolerance is **zero**. Encoded scores are integers produced by
the same deterministic integer arithmetic on both sides, so any difference is a real
disagreement rather than a precision artifact. Decoded scores are compared as exact
decimal strings; Arm B decodes in integer arithmetic specifically to avoid introducing
float error into the value being compared.

## What this does and does not establish

**Does:** two implementations derived independently from the specification agree
exactly on encoding parameters, encoded scores, and decoded scores for every
known-answer case, and the Python reproduces the manuscript's worked example.

**Does not:** prove either implementation correct. This is independent-implementation
agreement, not a formal proof, and it says nothing about sample authenticity, clinical
validity, calibration, or ancestry portability. The manuscript must describe it in
exactly those terms.
