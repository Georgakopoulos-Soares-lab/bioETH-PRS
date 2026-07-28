#!/usr/bin/env python3
"""Independent reference implementation of the bioETH-PRS scoring pipeline.

RTR actions R2.6-C1 (independent implementation), R2.2-C1 (genotype preprocessing
and QC), R2.3-C1 (effect-allele harmonization).

INDEPENDENCE STATEMENT
======================
This module was written from the definitions published in the manuscript
(`bioeth_prs (4).tex`, sections "Polygenic Risk Scores" and "Quantisation Scheme")
and from `docs/design.md`.  It does not import, translate, transcribe, or consult
`test/utils/heprs.ts` or any other TypeScript helper in this repository.  Its author
did not read those files while writing it.  That is the entire point: agreement
between this file and the contract path is evidence only if the two were derived
independently from the specification.

Consequently, where the specification is ambiguous this file follows the
specification and records the ambiguity rather than silently matching the
TypeScript.  Disagreements found by `compare` are findings, not bugs to paper over.

WHAT THIS IMPLEMENTS
====================
Equation 1 (the PRS itself):

    PRS = sum_i  g_i * beta_i

where g_i is the dosage of the *model-specified effect allele* (not the minor
allele) and beta_i is the signed GWAS effect weight.

The three-step unsigned encoding used on-chain, from the Quantisation Scheme:

    Step 1  scale             q_i = round(s * beta_i)
    Step 2  weight shift      z_w = -min_i q_i           u_i = q_i + z_w >= 0
    Step 3  score shift       z_s = sum_{q_i < 0} 2|q_i|
                              partialSum = sum_i g_i u_i
                              G          = sum_i g_i
                              e          = (partialSum + z_s) - z_w * G
            decode            PRS = (e - z_s) / s

USAGE
=====
    # score a cohort against a manifest
    python3 validation/independent_prs_reference.py score \
        --manifest M.json --genotypes G.csv --weights B.csv --out ref.json

    # compare against contract output
    python3 validation/independent_prs_reference.py compare \
        --reference ref.json --contract contract.json

    # known-answer self test, including the manuscript's worked example
    python3 validation/independent_prs_reference.py selftest

    # emit a manifest for the pre-aligned HEPRS fixtures
    python3 validation/independent_prs_reference.py fixture-manifest \
        --nominal 100 --out manifest_100.json

Standard library only.  No numpy, no third-party dependencies.
"""

import argparse
import csv
import json
import os
import sys
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Optional, Sequence, Tuple

UINT64_MAX = 2 ** 64 - 1

# Nucleotide complement, used for strand resolution.
COMPLEMENT = {"A": "T", "T": "A", "C": "G", "G": "C"}

# Allele pairs that are their own complement. For these, allele identity alone
# cannot distinguish forward from reverse strand, so a literal match between the
# effect allele and REF/ALT is not trustworthy.
PALINDROMIC_PAIRS = frozenset([frozenset(("A", "T")), frozenset(("C", "G"))])

MISSING_TOKENS = frozenset(["", "NA", "na", "N/A", "nan", "NaN", ".", "-", "None", "null"])

VALID_DOSAGES = (0, 1, 2)


class ValidationError(Exception):
    """Raised when an input cannot be processed at all (as opposed to a variant
    being rejected, which is recorded in the QC counts and continues)."""


# ---------------------------------------------------------------------------
# Arithmetic helpers
# ---------------------------------------------------------------------------

def round_half_away_from_zero(value: Decimal) -> int:
    """Round to nearest integer, ties away from zero.

    SPECIFICATION AMBIGUITY (recorded, not resolved silently).  The manuscript
    writes `q_i = round(s * beta_i)` without naming a tie-breaking rule.  Three
    conventions are in common use and they disagree at exact .5 boundaries:

        half away from zero : round(0.5) =  1,  round(-0.5) = -1   <- used here
        half to even        : round(0.5) =  0,  round(-0.5) =  0   (Python builtin)
        half up             : round(0.5) =  1,  round(-0.5) =  0   (JS Math.round)

    We use half-away-from-zero because it is the convention "round" denotes in
    numerical work and because it is sign-symmetric, which matters for signed GWAS
    weights: half-to-even and half-up both treat +0.5 and -0.5 asymmetrically or
    inconsistently, which would bias the quantised weight distribution.

    If `compare` reports disagreement confined to weights whose scaled value lands
    exactly on .5, this is the cause, and the manuscript must state the rule.
    """
    if value >= 0:
        return int((value + Decimal("0.5")).to_integral_value(rounding="ROUND_FLOOR"))
    return -int((-value + Decimal("0.5")).to_integral_value(rounding="ROUND_FLOOR"))


def parse_weight(token: str, index: int) -> Decimal:
    """Parse a GWAS weight exactly.

    Uses Decimal rather than float deliberately.  `s * beta` in binary floating
    point is inexact -- 1e6 * 0.000439 evaluates to 439.00000000000006 -- which can
    flip a rounding decision that exact decimal arithmetic gets right.  Since the
    weights arrive as decimal strings, exact decimal arithmetic is the faithful
    reading of the specification.  `--float-arithmetic` reproduces the lossy
    behaviour for diagnosis.
    """
    token = token.strip()
    try:
        return Decimal(token)
    except InvalidOperation:
        raise ValidationError(
            "weight at index %d is not a number: %r" % (index, token)
        )


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------

class Variant:
    """One row of the model's public variant manifest.

    Per R2.3-M1: this metadata is public even when the weights themselves are
    encrypted.  Encrypting weights does not prevent a requester from aligning their
    genotypes, because alignment needs only variant identity and allele labels.

    `ref` / `alt` describe the reference panel. The input genotype dosage is assumed
    to count ALT (the PLINK dosage convention); `dosage_allele` may override that.
    `effect_allele` is the allele the weight refers to.
    """

    __slots__ = ("index", "vid", "effect_allele", "other_allele", "ref", "alt",
                 "is_intercept", "strand_resolved", "dosage_allele")

    def __init__(self, index, vid, effect_allele, other_allele, ref, alt,
                 is_intercept=False, strand_resolved=False, dosage_allele="alt"):
        self.index = index
        self.vid = vid
        self.effect_allele = (effect_allele or "").upper()
        self.other_allele = (other_allele or "").upper()
        self.ref = (ref or "").upper()
        self.alt = (alt or "").upper()
        self.is_intercept = bool(is_intercept)
        # Set true only when an external source (e.g. strand-unambiguous imputation
        # panel) has established the strand. Without it, palindromic SNPs are
        # rejected rather than guessed.
        self.strand_resolved = bool(strand_resolved)
        self.dosage_allele = dosage_allele  # "alt" or "ref"

    @property
    def is_palindromic(self) -> bool:
        return frozenset((self.ref, self.alt)) in PALINDROMIC_PAIRS

    @property
    def is_multiallelic(self) -> bool:
        # A comma in either field, or a multi-character allele that is not a clean
        # SNP, means this is not a simple biallelic SNP. Indels and multiallelics
        # are out of scope for the hard-call dosage model used in this paper.
        for field in (self.ref, self.alt):
            if "," in field or len(field) != 1:
                return True
        return False


class Manifest:
    """Model manifest: genome build, scale, missing-data policy, variant order."""

    def __init__(self, raw: dict):
        self.raw = raw
        missing = [k for k in ("genome_build", "scale", "missing_policy", "variants")
                   if k not in raw]
        if missing:
            raise ValidationError("manifest is missing required keys: %s"
                                  % ", ".join(missing))

        self.genome_build = str(raw["genome_build"])
        self.scale = int(raw["scale"])
        if self.scale <= 0:
            raise ValidationError("scale must be positive, got %r" % (self.scale,))

        self.missing_policy = str(raw["missing_policy"])
        if self.missing_policy not in ("reject", "zero_dosage", "mean_dosage"):
            raise ValidationError(
                "missing_policy must be one of reject / zero_dosage / mean_dosage, "
                "got %r. There is deliberately no default: an implicit zero is a "
                "silent imputation that changes the score."
                % (self.missing_policy,)
            )

        self.note = raw.get("note", "")
        self.variants: List[Variant] = []
        for i, v in enumerate(raw["variants"]):
            self.variants.append(Variant(
                index=i,
                vid=str(v.get("id", "col%d" % i)),
                effect_allele=v.get("effect_allele"),
                other_allele=v.get("other_allele"),
                ref=v.get("ref"),
                alt=v.get("alt"),
                is_intercept=v.get("intercept", False),
                strand_resolved=v.get("strand_resolved", False),
                dosage_allele=v.get("dosage_allele", "alt"),
            ))

        seen = {}
        for v in self.variants:
            if v.vid in seen:
                raise ValidationError(
                    "duplicate variant id %r at manifest positions %d and %d"
                    % (v.vid, seen[v.vid], v.index)
                )
            seen[v.vid] = v.index

    def __len__(self) -> int:
        return len(self.variants)

    @classmethod
    def load(cls, path: str) -> "Manifest":
        with open(path, "r") as fh:
            return cls(json.load(fh))


# ---------------------------------------------------------------------------
# R2.2-C1 -- genotype preprocessing and QC
# R2.3-C1 -- effect-allele harmonization
# ---------------------------------------------------------------------------

class Counts:
    """QC and harmonization counters. Emitted with every score."""

    FIELDS = (
        # QC (R2.2-C1)
        "matched", "intercept", "missing", "imputed", "invalid", "rejected",
        # harmonization (R2.3-C1)
        "allele_match", "allele_flip", "strand_flip", "strand_ambiguous",
        "allele_incompatible", "multiallelic",
    )

    def __init__(self):
        for f in self.FIELDS:
            setattr(self, f, 0)

    def bump(self, field: str, n: int = 1) -> None:
        setattr(self, field, getattr(self, field) + n)

    def to_dict(self) -> dict:
        return {f: getattr(self, f) for f in self.FIELDS}


def harmonize_dosage(variant: Variant, dosage: int) -> Tuple[Optional[int], str]:
    """Convert an input dosage to effect-allele dosage.

    Returns (effect_dosage, outcome).  effect_dosage is None when the variant is
    rejected.  Outcomes: allele_match, allele_flip, strand_flip, strand_ambiguous,
    allele_incompatible, multiallelic.

    R2.3-M1 / R2.3-C1 decision rules:

      1. Multiallelic or non-SNP  -> reject.
      2. Palindromic REF/ALT pair (A/T or C/G) without an explicit strand
         resolution -> reject as strand_ambiguous.  A literal allele match is not
         sufficient here: for an A/T SNP, effect allele "A" is consistent with both
         the forward ALT and the reverse-strand reading of REF, so aligning on the
         label alone would silently flip roughly half of such variants.
      3. Effect allele equals the allele the dosage counts -> keep dosage.
      4. Effect allele equals the other allele -> g_effect = 2 - g.
      5. Neither matches, but the complement of the effect allele does, and the pair
         is not palindromic -> the effect allele is reported on the opposite strand.
         Complement it and re-apply rules 3-4.
      6. Otherwise -> reject as allele_incompatible.
    """
    if variant.is_multiallelic:
        return None, "multiallelic"

    counted = variant.alt if variant.dosage_allele == "alt" else variant.ref
    other = variant.ref if variant.dosage_allele == "alt" else variant.alt

    if variant.is_palindromic and not variant.strand_resolved:
        return None, "strand_ambiguous"

    effect = variant.effect_allele
    outcome_prefix = ""

    if effect not in (counted, other):
        comp = COMPLEMENT.get(effect)
        if comp is None or comp not in (counted, other):
            return None, "allele_incompatible"
        # Non-palindromic pair, so complementing is unambiguous.
        effect = comp
        outcome_prefix = "strand_flip"

    if effect == counted:
        result, outcome = dosage, "allele_match"
    else:
        result, outcome = 2 - dosage, "allele_flip"

    return result, (outcome_prefix or outcome)


def check_genome_build(manifest: Manifest, declared_build: Optional[str]) -> None:
    """Scoring-time genome-build check (R2.2-C1).

    Build matching is a metadata comparison: a genotype matrix of integers carries no
    intrinsic build information, so the build must be *declared* alongside it and
    compared against the model's. There is no way to infer it from dosages, and
    guessing would be worse than refusing.

    A mismatch is fatal, not a warning. The same rsID can denote different positions
    across builds, so scoring GRCh38 genotypes against a GRCh37 model silently
    computes a weighted sum over misaligned variants and returns a plausible number.
    """
    if declared_build is None:
        if manifest.genome_build.startswith("UNSPECIFIED"):
            return  # manifest itself declares the build unknown; see fixture caveat
        raise ValidationError(
            "the model manifest declares genome build %r but the genotype data "
            "declared no build. Supply --genotype-build. Build matching cannot be "
            "inferred from dosage values." % manifest.genome_build
        )
    if declared_build.strip().upper() != manifest.genome_build.strip().upper():
        raise ValidationError(
            "genome build mismatch: model manifest declares %r, genotype data "
            "declares %r. Refusing to score. The same variant identifier can map to "
            "different positions across builds, so scoring would produce a "
            "plausible but meaningless number."
            % (manifest.genome_build, declared_build)
        )


def check_variant_order(manifest: Manifest, column_ids: Sequence[str]) -> None:
    """Scoring-time variant-order check (R2.2-C1).

    The dot product is positional: column i of the genotype matrix is multiplied by
    weight i. If the two orders differ, every product is formed from a mismatched
    pair and the result is meaningless while still looking like a score. Order is
    therefore verified element-by-element, not merely by length.
    """
    if len(column_ids) != len(manifest):
        raise ValidationError(
            "genotype file declares %d variant columns but the manifest declares %d"
            % (len(column_ids), len(manifest))
        )
    for i, (declared, v) in enumerate(zip(column_ids, manifest.variants)):
        if declared.strip() != v.vid:
            raise ValidationError(
                "variant order mismatch at position %d: genotype column is %r but "
                "the manifest expects %r. The dot product is positional, so a "
                "reordering silently pairs every dosage with the wrong weight."
                % (i, declared.strip(), v.vid)
            )


def preprocess_individual(
    manifest: Manifest,
    raw_row: Sequence[str],
    mean_dosages: Optional[List[Decimal]] = None,
) -> Tuple[List[Optional[int]], Counts, List[str]]:
    """Apply QC then harmonization to one individual's genotype row.

    Returns (effect_dosages, counts, notes).  A position is None when the variant
    was rejected for that individual; the caller decides how to handle it.
    """
    if len(raw_row) != len(manifest):
        raise ValidationError(
            "genotype row has %d columns but the manifest declares %d variants. "
            "Variant order and count must match exactly; this is a scoring-time "
            "check, not a warning." % (len(raw_row), len(manifest))
        )

    counts = Counts()
    notes: List[str] = []
    out: List[Optional[int]] = []

    for v, token in zip(manifest.variants, raw_row):
        token = token.strip()

        # --- the intercept / constant column is not a dosage -------------------
        # The HEPRS fixtures carry a leading constant column (genotype 1, weight 0).
        # Its value 1 is coincidentally a legal hard call, so validating it as a
        # dosage would pass by luck and hide a real column-alignment error. It is
        # therefore declared in the manifest and handled separately: it takes part
        # in the arithmetic but is never QC'd or harmonized as a genotype.
        if v.is_intercept:
            if token in MISSING_TOKENS:
                raise ValidationError(
                    "intercept column %r is missing; this indicates a malformed "
                    "genotype file rather than a missing genotype" % v.vid
                )
            value = int(Decimal(token))
            if value != 1:
                raise ValidationError(
                    "intercept column %r must be 1, got %r" % (v.vid, token)
                )
            counts.bump("intercept")
            out.append(1)
            continue

        # --- missing data (R2.2-C1): policy is explicit, never an implicit zero --
        if token in MISSING_TOKENS:
            counts.bump("missing")
            if manifest.missing_policy == "reject":
                counts.bump("rejected")
                notes.append("variant %s: missing, rejected per manifest policy" % v.vid)
                out.append(None)
                continue
            if manifest.missing_policy == "zero_dosage":
                counts.bump("imputed")
                notes.append("variant %s: missing, imputed to dosage 0 per manifest "
                             "policy" % v.vid)
                out.append(0)
                continue
            # mean_dosage
            if mean_dosages is None:
                raise ValidationError(
                    "missing_policy is mean_dosage but no cohort mean was supplied"
                )
            counts.bump("imputed")
            imputed = round_half_away_from_zero(mean_dosages[v.index])
            notes.append("variant %s: missing, imputed to cohort mean hard call %d"
                         % (v.vid, imputed))
            out.append(imputed)
            continue

        # --- hard-call validation (R2.2-C1) ------------------------------------
        try:
            numeric = Decimal(token)
        except InvalidOperation:
            counts.bump("invalid")
            counts.bump("rejected")
            notes.append("variant %s: value %r is not numeric" % (v.vid, token))
            out.append(None)
            continue

        if numeric != numeric.to_integral_value() or int(numeric) not in VALID_DOSAGES:
            # This paper evaluates hard calls only. Dosages such as 0.7 from
            # imputation, and out-of-range values such as 9, are rejected rather
            # than clamped -- clamping would silently alter the score.
            counts.bump("invalid")
            counts.bump("rejected")
            notes.append("variant %s: dosage %r is not a diploid hard call in "
                         "{0,1,2}" % (v.vid, token))
            out.append(None)
            continue

        dosage = int(numeric)

        # --- effect-allele harmonization (R2.3-C1) ----------------------------
        effect_dosage, outcome = harmonize_dosage(v, dosage)
        counts.bump(outcome)
        if effect_dosage is None:
            counts.bump("rejected")
            notes.append("variant %s: %s" % (v.vid, outcome))
            out.append(None)
            continue

        counts.bump("matched")
        out.append(effect_dosage)

    return out, counts, notes


def cohort_mean_dosages(manifest: Manifest, rows: Sequence[Sequence[str]]) -> List[Decimal]:
    """Per-variant mean of the observed hard calls, for mean_dosage imputation."""
    means: List[Decimal] = []
    for v in manifest.variants:
        total = Decimal(0)
        n = 0
        for row in rows:
            token = row[v.index].strip()
            if token in MISSING_TOKENS:
                continue
            try:
                val = Decimal(token)
            except InvalidOperation:
                continue
            if val == val.to_integral_value() and int(val) in VALID_DOSAGES:
                total += val
                n += 1
        means.append(Decimal(0) if n == 0 else total / Decimal(n))
    return means


# ---------------------------------------------------------------------------
# Equation 1 and the three-step encoding
# ---------------------------------------------------------------------------

class Encoding:
    """Quantised model: q, u, z_w, z_s. Derived once per (weights, scale)."""

    def __init__(self, betas: Sequence[Decimal], scale: int, use_float: bool = False):
        self.scale = scale
        self.use_float = use_float

        if use_float:
            self.q = [int(_js_round(float(scale) * float(b))) for b in betas]
        else:
            self.q = [round_half_away_from_zero(Decimal(scale) * b) for b in betas]

        raw_zw = -min(self.q) if self.q else 0
        # SPECIFICATION DEVIATION (recorded).  The manuscript defines
        # z_w = -min_i q_i unconditionally.  When every quantised weight is
        # positive that expression is negative, and the on-chain weightZeroPoint is
        # a uint64, so a negative value cannot be stored.  The invariant the shift
        # exists to guarantee -- u_i >= 0 -- already holds at z_w = 0 in that case,
        # so we clamp at zero. See validation/README.md.
        self.z_w = max(0, raw_zw)
        self.z_w_unclamped = raw_zw
        self.u = [qi + self.z_w for qi in self.q]
        self.z_s = sum(2 * (-qi) for qi in self.q if qi < 0)

    def encode(self, dosages: Sequence[int]) -> Dict[str, int]:
        """On-chain encoding for one individual."""
        partial_sum = sum(g * u for g, u in zip(dosages, self.u))
        geno_sum = sum(dosages)
        # Order matters: z_s is added before z_w*G is subtracted, so the
        # intermediate never goes negative under unsigned arithmetic.
        intermediate = partial_sum + self.z_s
        encoded = intermediate - self.z_w * geno_sum
        return {
            "partialSum": partial_sum,
            "genoSum": geno_sum,
            "intermediate": intermediate,
            "encodedScore": encoded,
        }

    def decode(self, encoded: int) -> Decimal:
        return (Decimal(encoded) - Decimal(self.z_s)) / Decimal(self.scale)

    def overflow_report(self, max_geno_sum: int) -> Dict[str, object]:
        worst_partial = sum(2 * u for u in self.u)
        worst_intermediate = worst_partial + self.z_s
        return {
            "worstCasePartialSum": worst_partial,
            "worstCaseIntermediate": worst_intermediate,
            "uint64Max": UINT64_MAX,
            "fitsUint64": worst_intermediate <= UINT64_MAX,
            "headroomBits": (worst_intermediate.bit_length() if worst_intermediate else 0),
            "maxGenoSum": max_geno_sum,
        }


def _js_round(x: float) -> float:
    """JavaScript Math.round semantics: half up (toward +inf), for --float-arithmetic."""
    import math
    return math.floor(x + 0.5)


def equation_one(dosages: Sequence[int], betas: Sequence[Decimal]) -> Decimal:
    """Equation 1: PRS = sum_i g_i * beta_i, computed exactly."""
    total = Decimal(0)
    for g, b in zip(dosages, betas):
        total += Decimal(g) * b
    return total


# ---------------------------------------------------------------------------
# Scoring driver
# ---------------------------------------------------------------------------

def read_csv_rows(path: str) -> List[List[str]]:
    with open(path, "r", newline="") as fh:
        return [row for row in csv.reader(fh) if row and any(c.strip() for c in row)]


def score_case(case: dict) -> dict:
    """Score an in-memory known-answer case (validation/cases/*.json).

    Also re-derives the case's `hand_checked` block and reports any disagreement, so
    the case files themselves are validated rather than trusted.
    """
    manifest = Manifest(case["manifest"])
    betas = [parse_weight(str(w), i) for i, w in enumerate(case["weights"])]
    if len(betas) != len(manifest):
        raise ValidationError(
            "case %r: %d weights but %d manifest variants"
            % (case.get("name"), len(betas), len(manifest))
        )

    encoding = Encoding(betas, manifest.scale)
    individuals = []
    harmonized_all = []
    max_geno_sum = 0

    for idx, row in enumerate(case["genotypes"]):
        dosages, counts, notes = preprocess_individual(
            manifest, [str(v) for v in row])
        if any(d is None for d in dosages):
            individuals.append({"individual": idx, "status": "rejected",
                                "counts": counts.to_dict(), "notes": notes})
            harmonized_all.append(None)
            continue
        clean = [d for d in dosages if d is not None]
        harmonized_all.append(clean)
        prs = equation_one(clean, betas)
        enc = encoding.encode(clean)
        decoded = encoding.decode(enc["encodedScore"])
        max_geno_sum = max(max_geno_sum, enc["genoSum"])
        individuals.append({
            "individual": idx,
            "status": "scored",
            "inputDosages": list(row),
            "effectAlleleDosages": clean,
            "equation1PRS": str(prs),
            "encodedScore": enc["encodedScore"],
            "partialSum": enc["partialSum"],
            "genoSum": enc["genoSum"],
            "decodedPRS": str(decoded),
            "roundTripAbsError": str(abs(decoded - prs)),
            "counts": counts.to_dict(),
            "notes": notes,
        })

    # Validate the case file's own hand-computed expectations.
    hand = case.get("hand_checked", {})
    hand_checks = []

    def hc(label, got, want):
        hand_checks.append({"check": label, "got": str(got), "want": str(want),
                            "agrees": got == want})

    if "q" in hand:
        hc("q", encoding.q, list(hand["q"]))
    if "z_w" in hand:
        hc("z_w", encoding.z_w, hand["z_w"])
    if "u" in hand:
        hc("u", encoding.u, list(hand["u"]))
    if "z_s" in hand:
        hc("z_s", encoding.z_s, hand["z_s"])
    if "harmonized_genotypes" in hand:
        hc("harmonized_genotypes",
           [h for h in harmonized_all if h is not None],
           [list(r) for r in hand["harmonized_genotypes"]])
    for key, expect in hand.items():
        if not key.startswith("individual_"):
            continue
        idx = int(key.split("_")[1])
        row = individuals[idx]
        if "encodedScore" in expect:
            hc("%s.encodedScore" % key, row.get("encodedScore"),
               expect["encodedScore"])
        if "prs" in expect:
            hc("%s.prs" % key, Decimal(row.get("equation1PRS", "nan")),
               Decimal(expect["prs"]))

    return {
        "tool": "independent_prs_reference.py",
        "case": case.get("name"),
        "arithmetic": "exact_decimal",
        "rounding": "half_away_from_zero",
        "manifest": {
            "genomeBuild": manifest.genome_build,
            "scale": manifest.scale,
            "missingPolicy": manifest.missing_policy,
            "variantCount": len(manifest),
        },
        "encoding": {
            "weightZeroPoint": encoding.z_w,
            "weightZeroPointUnclamped": encoding.z_w_unclamped,
            "scoreOffset": encoding.z_s,
            "quantizedWeights": encoding.q,
            "shiftedWeights": encoding.u,
        },
        "overflow": encoding.overflow_report(max_geno_sum),
        "handCheckedAgreement": {
            "checks": hand_checks,
            "allAgree": all(c["agrees"] for c in hand_checks) if hand_checks else None,
        },
        "individuals": individuals,
    }


def score_cohort(manifest: Manifest, genotype_path: str, weights_path: str,
                 use_float: bool = False, declared_build: Optional[str] = None,
                 variant_order_path: Optional[str] = None) -> dict:
    check_genome_build(manifest, declared_build)

    if variant_order_path:
        with open(variant_order_path, "r", newline="") as fh:
            order_rows = [r for r in csv.reader(fh) if r and any(c.strip() for c in r)]
        if len(order_rows) != 1:
            raise ValidationError(
                "variant-order file must hold exactly one row of ids, found %d rows"
                % len(order_rows))
        check_variant_order(manifest, order_rows[0])

    weight_rows = read_csv_rows(weights_path)
    if len(weight_rows) != 1:
        raise ValidationError(
            "expected exactly one row of weights, found %d" % len(weight_rows)
        )
    betas = [parse_weight(t, i) for i, t in enumerate(weight_rows[0])]
    if len(betas) != len(manifest):
        raise ValidationError(
            "weights file has %d columns but the manifest declares %d variants"
            % (len(betas), len(manifest))
        )

    geno_rows = read_csv_rows(genotype_path)
    for i, row in enumerate(geno_rows):
        if len(row) != len(manifest):
            raise ValidationError(
                "genotype row %d has %d columns, manifest declares %d"
                % (i, len(row), len(manifest))
            )

    means = (cohort_mean_dosages(manifest, geno_rows)
             if manifest.missing_policy == "mean_dosage" else None)

    encoding = Encoding(betas, manifest.scale, use_float=use_float)

    individuals = []
    max_geno_sum = 0
    for idx, row in enumerate(geno_rows):
        dosages, counts, notes = preprocess_individual(manifest, row, means)

        if any(d is None for d in dosages):
            individuals.append({
                "individual": idx,
                "status": "rejected",
                "counts": counts.to_dict(),
                "notes": notes,
            })
            continue

        clean = [d for d in dosages if d is not None]
        prs = equation_one(clean, betas)
        enc = encoding.encode(clean)
        decoded = encoding.decode(enc["encodedScore"])
        max_geno_sum = max(max_geno_sum, enc["genoSum"])

        individuals.append({
            "individual": idx,
            "status": "scored",
            "equation1PRS": str(prs),
            "encodedScore": enc["encodedScore"],
            "partialSum": enc["partialSum"],
            "genoSum": enc["genoSum"],
            "decodedPRS": str(decoded),
            "roundTripAbsError": str(abs(decoded - prs)),
            "counts": counts.to_dict(),
            "notes": notes,
        })

    return {
        "tool": "independent_prs_reference.py",
        "independence": "derived from the manuscript; does not consult test/utils/heprs.ts",
        "arithmetic": "float" if use_float else "exact_decimal",
        "rounding": "half_away_from_zero",
        "checks": {
            "genomeBuildDeclared": declared_build,
            "genomeBuildVerified": declared_build is not None,
            "variantOrderVerified": variant_order_path is not None,
        },
        "manifest": {
            "genomeBuild": manifest.genome_build,
            "scale": manifest.scale,
            "missingPolicy": manifest.missing_policy,
            "variantCount": len(manifest),
            "note": manifest.note,
        },
        "encoding": {
            "weightZeroPoint": encoding.z_w,
            "weightZeroPointUnclamped": encoding.z_w_unclamped,
            "scoreOffset": encoding.z_s,
        },
        "overflow": encoding.overflow_report(max_geno_sum),
        "individuals": individuals,
    }


# ---------------------------------------------------------------------------
# Comparison against the contract path (R2.6-T1)
# ---------------------------------------------------------------------------

def compare(reference: dict, contract: dict, tolerance: Decimal) -> dict:
    """Compare this implementation against contract output.

    Contract JSON shape:
        {"individuals": [{"individual": 0, "encodedScore": "...",
                          "decodedPRS": "..."} , ...],
         "encoding": {"weightZeroPoint": ..., "scoreOffset": ...}}

    Encoded scores are integers and must agree EXACTLY -- they are the same
    deterministic integer arithmetic on both sides, so any difference is a real
    disagreement, not a precision artifact.  Decoded scores are compared against
    the declared tolerance.
    """
    ref_by_id = {r["individual"]: r for r in reference["individuals"]}
    rows = []
    encoded_mismatch = 0
    decoded_mismatch = 0
    max_abs_err = Decimal(0)

    for c in contract.get("individuals", []):
        idx = c["individual"]
        r = ref_by_id.get(idx)
        if r is None:
            rows.append({"individual": idx, "verdict": "MISSING_IN_REFERENCE"})
            encoded_mismatch += 1
            continue
        if r.get("status") != "scored":
            rows.append({"individual": idx, "verdict": "REFERENCE_REJECTED",
                         "notes": r.get("notes", [])})
            encoded_mismatch += 1
            continue

        ref_enc = int(r["encodedScore"])
        con_enc = int(c["encodedScore"])
        enc_ok = ref_enc == con_enc
        if not enc_ok:
            encoded_mismatch += 1

        ref_dec = Decimal(r["decodedPRS"])
        dec_ok = True
        abs_err = Decimal(0)
        if "decodedPRS" in c:
            con_dec = Decimal(str(c["decodedPRS"]))
            abs_err = abs(ref_dec - con_dec)
            max_abs_err = max(max_abs_err, abs_err)
            dec_ok = abs_err <= tolerance
            if not dec_ok:
                decoded_mismatch += 1

        rows.append({
            "individual": idx,
            "referenceEncoded": ref_enc,
            "contractEncoded": con_enc,
            "encodedAgrees": enc_ok,
            "referenceDecoded": str(ref_dec),
            "absError": str(abs_err),
            "decodedWithinTolerance": dec_ok,
            "verdict": "PASS" if (enc_ok and dec_ok) else "FAIL",
        })

    enc_ref = reference.get("encoding", {})
    enc_con = contract.get("encoding", {})
    encoding_rows = []
    for key in ("weightZeroPoint", "scoreOffset"):
        if key in enc_con:
            a, b = int(enc_ref.get(key, -1)), int(enc_con[key])
            encoding_rows.append({"field": key, "reference": a, "contract": b,
                                  "agrees": a == b})
            if a != b:
                encoded_mismatch += 1

    compared = len([r for r in rows if "encodedAgrees" in r])
    return {
        "compared": compared,
        "encodedMismatches": encoded_mismatch,
        "decodedMismatches": decoded_mismatch,
        "maxAbsError": str(max_abs_err),
        "tolerance": str(tolerance),
        "encodingParameters": encoding_rows,
        "rows": rows,
        "pass": encoded_mismatch == 0 and decoded_mismatch == 0 and compared > 0,
    }


# ---------------------------------------------------------------------------
# Known-answer self test
# ---------------------------------------------------------------------------

def _mk_manifest(n: int, scale: int, missing_policy: str = "reject",
                 build: str = "GRCh37", intercept: bool = False,
                 variants: Optional[List[dict]] = None) -> Manifest:
    if variants is None:
        variants = []
        if intercept:
            variants.append({"id": "intercept", "intercept": True})
        for i in range(n):
            variants.append({
                "id": "rs%d" % (i + 1),
                "ref": "G", "alt": "A",
                "effect_allele": "A", "other_allele": "G",
            })
    return Manifest({
        "genome_build": build, "scale": scale,
        "missing_policy": missing_policy, "variants": variants,
    })


def selftest(verbose: bool = True) -> int:
    """Known-answer cases. Returns the number of failures."""
    failures = []

    def check(name, got, want):
        ok = got == want
        if not ok:
            failures.append((name, got, want))
        if verbose:
            print("  %-58s %s" % (name, "PASS" if ok else
                                  "FAIL  got=%r want=%r" % (got, want)))

    print("Case 1 -- manuscript worked example (Quantisation Scheme)")
    betas = [Decimal("-0.30"), Decimal("0.10"), Decimal("0.25")]
    enc = Encoding(betas, 100)
    check("q == [-30, 10, 25]", enc.q, [-30, 10, 25])
    check("z_w == 30", enc.z_w, 30)
    check("u == [0, 40, 55]", enc.u, [0, 40, 55])
    check("z_s == 60", enc.z_s, 60)
    e = enc.encode([0, 2, 1])
    check("partialSum == 135", e["partialSum"], 135)
    check("G == 3", e["genoSum"], 3)
    check("encodedScore == 105", e["encodedScore"], 105)
    check("decode == 0.45", enc.decode(e["encodedScore"]), Decimal("0.45"))
    check("Equation 1 == 0.45", equation_one([0, 2, 1], betas), Decimal("0.45"))

    print("Case 2 -- all-positive weights (z_w clamp)")
    enc2 = Encoding([Decimal("0.10"), Decimal("0.20")], 100)
    check("q == [10, 20]", enc2.q, [10, 20])
    check("z_w clamped to 0", enc2.z_w, 0)
    check("z_w unclamped would be -10", enc2.z_w_unclamped, -10)
    check("z_s == 0 (no negative weights)", enc2.z_s, 0)
    e2 = enc2.encode([1, 2])
    check("encodedScore == 50", e2["encodedScore"], 50)
    check("decode == 0.50", enc2.decode(e2["encodedScore"]), Decimal("0.50"))

    print("Case 3 -- mixed signed weights, hand-checked")
    # beta = [-0.5, 0.25, -0.125, 0.0625], s = 10000, g = [2, 1, 0, 2]
    # q  = [-5000, 2500, -1250, 625];  z_w = 5000
    # u  = [0, 7500, 3750, 5625]
    # partialSum = 2*0 + 1*7500 + 0*3750 + 2*5625 = 18750 ; G = 5
    # z_s = 2*5000 + 2*1250 = 12500
    # e = (18750 + 12500) - 5000*5 = 31250 - 25000 = 6250
    # PRS = (6250 - 12500)/10000 = -0.625
    # check: 2*-0.5 + 1*0.25 + 0*-0.125 + 2*0.0625 = -1 + 0.25 + 0.125 = -0.625
    b3 = [Decimal("-0.5"), Decimal("0.25"), Decimal("-0.125"), Decimal("0.0625")]
    enc3 = Encoding(b3, 10000)
    check("q == [-5000, 2500, -1250, 625]", enc3.q, [-5000, 2500, -1250, 625])
    check("z_w == 5000", enc3.z_w, 5000)
    check("z_s == 12500", enc3.z_s, 12500)
    e3 = enc3.encode([2, 1, 0, 2])
    check("partialSum == 18750", e3["partialSum"], 18750)
    check("encodedScore == 6250", e3["encodedScore"], 6250)
    check("decode == -0.625", enc3.decode(e3["encodedScore"]), Decimal("-0.625"))
    check("Equation 1 == -0.625", equation_one([2, 1, 0, 2], b3), Decimal("-0.625"))
    check("negative PRS still encodes non-negative", e3["encodedScore"] >= 0, True)

    print("Case 4 -- allele reversal (R2.3-T1): [0,1,2] -> [2,1,0]")
    flipped = Manifest({
        "genome_build": "GRCh37", "scale": 100, "missing_policy": "reject",
        "variants": [{"id": "rsFlip", "ref": "G", "alt": "A",
                      "effect_allele": "G", "other_allele": "A"}],
    })
    got = []
    for d in ("0", "1", "2"):
        dos, _, _ = preprocess_individual(flipped, [d])
        got.append(dos[0])
    check("reversed effect allele maps [0,1,2] -> [2,1,0]", got, [2, 1, 0])

    aligned = _mk_manifest(1, 100)
    got_al = []
    for d in ("0", "1", "2"):
        dos, _, _ = preprocess_individual(aligned, [d])
        got_al.append(dos[0])
    check("aligned effect allele leaves [0,1,2] unchanged", got_al, [0, 1, 2])

    print("Case 5 -- strand handling (R2.3-T1)")
    # C/T is not palindromic; effect allele A is the complement of T (the ALT),
    # so the strand is resolvable and the dosage is kept.
    strand = Manifest({
        "genome_build": "GRCh37", "scale": 100, "missing_policy": "reject",
        "variants": [{"id": "rsStrand", "ref": "C", "alt": "T",
                      "effect_allele": "A", "other_allele": "G"}],
    })
    _, c5, _ = preprocess_individual(strand, ["1"])
    check("strand-compatible SNP resolves via complement", c5.strand_flip, 1)
    check("strand-compatible SNP is not rejected", c5.rejected, 0)

    palin = Manifest({
        "genome_build": "GRCh37", "scale": 100, "missing_policy": "reject",
        "variants": [{"id": "rsPalin", "ref": "A", "alt": "T",
                      "effect_allele": "A", "other_allele": "T"}],
    })
    dos_p, c5b, _ = preprocess_individual(palin, ["1"])
    check("unresolved palindromic SNP is rejected", c5b.strand_ambiguous, 1)
    check("unresolved palindromic SNP yields no dosage", dos_p[0], None)

    resolved = Manifest({
        "genome_build": "GRCh37", "scale": 100, "missing_policy": "reject",
        "variants": [{"id": "rsPalin", "ref": "A", "alt": "T", "effect_allele": "T",
                      "other_allele": "A", "strand_resolved": True}],
    })
    dos_r, c5c, _ = preprocess_individual(resolved, ["1"])
    check("explicitly strand-resolved palindrome is accepted", c5c.allele_match, 1)
    check("explicitly strand-resolved palindrome keeps dosage", dos_r[0], 1)

    print("Case 6 -- QC rules (R2.2-T1)")
    m = _mk_manifest(1, 100)
    _, c6a, _ = preprocess_individual(m, ["9"])
    check("out-of-range dosage 9 is invalid", (c6a.invalid, c6a.rejected), (1, 1))
    _, c6b, _ = preprocess_individual(m, ["0.7"])
    check("non-integer dosage 0.7 is invalid", (c6b.invalid, c6b.rejected), (1, 1))
    _, c6c, _ = preprocess_individual(m, ["abc"])
    check("non-numeric dosage is invalid", (c6c.invalid, c6c.rejected), (1, 1))

    mrej = _mk_manifest(1, 100, missing_policy="reject")
    dos6, c6d, _ = preprocess_individual(mrej, ["NA"])
    check("missing under reject policy -> rejected", (c6d.missing, c6d.rejected), (1, 1))
    check("missing under reject policy -> no dosage", dos6[0], None)

    mzero = _mk_manifest(1, 100, missing_policy="zero_dosage")
    dos6b, c6e, _ = preprocess_individual(mzero, [""])
    check("missing under zero policy -> imputed 0", (c6e.imputed, dos6b[0]), (1, 0))

    try:
        Manifest({"genome_build": "GRCh37", "scale": 100, "variants": []})
        check("manifest without missing_policy is rejected", False, True)
    except ValidationError:
        check("manifest without missing_policy is rejected", True, True)

    try:
        preprocess_individual(_mk_manifest(2, 100), ["1"])
        check("wrong variant count is rejected", False, True)
    except ValidationError:
        check("wrong variant count is rejected", True, True)

    try:
        Manifest({"genome_build": "GRCh37", "scale": 100, "missing_policy": "reject",
                  "variants": [{"id": "rsDup"}, {"id": "rsDup"}]})
        check("duplicate variant ids are rejected", False, True)
    except ValidationError:
        check("duplicate variant ids are rejected", True, True)

    multi = Manifest({
        "genome_build": "GRCh37", "scale": 100, "missing_policy": "reject",
        "variants": [{"id": "rsMulti", "ref": "G", "alt": "A,T",
                      "effect_allele": "A", "other_allele": "G"}],
    })
    _, c6f, _ = preprocess_individual(multi, ["1"])
    check("multiallelic variant is rejected", (c6f.multiallelic, c6f.rejected), (1, 1))

    print("Case 7 -- intercept column handling")
    mi = _mk_manifest(2, 100, intercept=True)
    dos7, c7, _ = preprocess_individual(mi, ["1", "0", "2"])
    check("intercept counted separately from dosages",
          (c7.intercept, c7.matched), (1, 2))
    check("intercept passes through as 1", dos7[0], 1)
    try:
        preprocess_individual(mi, ["0", "0", "2"])
        check("intercept != 1 is a hard error", False, True)
    except ValidationError:
        check("intercept != 1 is a hard error", True, True)

    print("Case 7b -- genome build and variant order (R2.2-T1)")
    mb = _mk_manifest(2, 100, build="GRCh37")
    try:
        check_genome_build(mb, "GRCh37")
        check("matching build is accepted", True, True)
    except ValidationError:
        check("matching build is accepted", False, True)
    try:
        check_genome_build(mb, "GRCh38")
        check("wrong build is rejected", False, True)
    except ValidationError:
        check("wrong build is rejected", True, True)
    try:
        check_genome_build(mb, None)
        check("undeclared build is rejected when manifest names one", False, True)
    except ValidationError:
        check("undeclared build is rejected when manifest names one", True, True)
    try:
        check_genome_build(_mk_manifest(1, 100, build="UNSPECIFIED_ASSUMED_CONSISTENT"), None)
        check("fixture manifest with UNSPECIFIED build tolerates no declaration", True, True)
    except ValidationError:
        check("fixture manifest with UNSPECIFIED build tolerates no declaration", False, True)

    try:
        check_variant_order(mb, ["rs1", "rs2"])
        check("correct variant order is accepted", True, True)
    except ValidationError:
        check("correct variant order is accepted", False, True)
    try:
        check_variant_order(mb, ["rs2", "rs1"])
        check("swapped variant order is rejected", False, True)
    except ValidationError:
        check("swapped variant order is rejected", True, True)
    try:
        check_variant_order(mb, ["rs1"])
        check("truncated variant order is rejected", False, True)
    except ValidationError:
        check("truncated variant order is rejected", True, True)

    print("Case 7c -- advisor scale table (CD-010 regression guard)")
    check("100-SNP advisor scale is 3e6", advisor_scale(100), 3_000_000)
    check("500-SNP advisor scale is 3e6", advisor_scale(500), 3_000_000)
    check("1000-SNP advisor scale is 1e6", advisor_scale(1000), 1_000_000)
    check("5000-SNP advisor scale is 1e6", advisor_scale(5000), 1_000_000)
    try:
        advisor_scale(250)
        check("unknown fixture size is rejected, not guessed", False, True)
    except ValidationError:
        check("unknown fixture size is rejected, not guessed", True, True)
    # Exactness holds at every integer multiple of 1e6, so CD-006 survives the fix.
    check("weights stay exact at s=3e6",
          Encoding([Decimal("0.000439"), Decimal("-0.009534")], 3_000_000).q,
          [1317, -28602])

    print("Case 8 -- rounding rule")
    check("round_half_away_from_zero(+0.5) == 1",
          round_half_away_from_zero(Decimal("0.5")), 1)
    check("round_half_away_from_zero(-0.5) == -1",
          round_half_away_from_zero(Decimal("-0.5")), -1)
    check("round_half_away_from_zero(+1.5) == 2",
          round_half_away_from_zero(Decimal("1.5")), 2)
    check("round_half_away_from_zero(-2.5) == -3",
          round_half_away_from_zero(Decimal("-2.5")), -3)
    check("exact decimal avoids 1e6*0.000439 float drift",
          Encoding([Decimal("0.000439")], 10 ** 6).q, [439])

    print()
    if failures:
        print("SELFTEST FAILED: %d of the above checks did not pass" % len(failures))
    else:
        print("SELFTEST PASSED: all known-answer checks agree")
    return len(failures)


# ---------------------------------------------------------------------------
# Fixture manifest generator
# ---------------------------------------------------------------------------

# Advisor-recommended "balanced" scale per fixture size.
#
# This is a model PARAMETER, not part of the algorithm being independently derived.
# Independence concerns the arithmetic; the scale is an input, exactly like the fixture
# data itself, and both arms must use the same value or the comparison is meaningless.
# It mirrors HEPRS_BALANCED_RECOMMENDATIONS in test/utils/heprs.ts.
#
# Recorded because getting this wrong is silent: an incorrect scale produces encoded
# scores that differ from the contract path by exactly the scale ratio, which looks
# like a correctness failure rather than a configuration mismatch. It did, once —
# see CD-010.
ADVISOR_BALANCED_SCALE = {
    100: 3_000_000,
    500: 3_000_000,
    1000: 1_000_000,
    5000: 1_000_000,
}


def advisor_scale(nominal: int) -> int:
    if nominal not in ADVISOR_BALANCED_SCALE:
        raise ValidationError(
            "no advisor-recommended scale recorded for a %d-SNP fixture; known sizes "
            "are %s. Do not guess: an incorrect scale silently rescales every encoded "
            "score." % (nominal, sorted(ADVISOR_BALANCED_SCALE))
        )
    return ADVISOR_BALANCED_SCALE[nominal]


def fixture_manifest(nominal: int, scale: int) -> dict:
    """Manifest for the supplied HEPRS fixtures.

    FIXTURE CAVEAT (R2.3-M1).  The HEPRS fixtures ship as bare numeric matrices with
    no variant identifiers, no genome build, and no allele labels.  They are
    therefore *assumed* to be pre-aligned: effect allele == ALT for every variant,
    and no strand or build checking is possible.  This manifest records that
    assumption explicitly rather than letting it stay implicit.  It does not
    independently validate strand or build, because the fixtures carry no
    information with which to do so.

    The leading column is the intercept: weight 0, dosage 1 for every individual.
    The encoded vector length is therefore `nominal + 1`.
    """
    variants: List[dict] = [{
        "id": "intercept",
        "intercept": True,
        "note": "constant column: weight 0, dosage 1",
    }]
    for i in range(nominal):
        variants.append({
            "id": "fixture_snp_%04d" % (i + 1),
            "ref": "G", "alt": "A",
            "effect_allele": "A", "other_allele": "G",
            "assumed_pre_aligned": True,
        })
    return {
        "manifest_version": 1,
        "genome_build": "UNSPECIFIED_ASSUMED_CONSISTENT",
        "scale": scale,
        "missing_policy": "reject",
        "note": ("HEPRS fixture manifest, nominal %d SNPs plus one intercept column "
                 "(%d encoded positions). Alleles are placeholders: the fixtures "
                 "carry no allele or build metadata, so they are assumed pre-aligned "
                 "and no strand or build validation is performed."
                 % (nominal, nominal + 1)),
        "variants": variants,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(
        description="Independent reference implementation of bioETH-PRS scoring.")
    sub = p.add_subparsers(dest="cmd")

    sp = sub.add_parser("score", help="score a cohort against a manifest")
    sp.add_argument("--manifest", required=True)
    sp.add_argument("--genotypes", required=True)
    sp.add_argument("--weights", required=True)
    sp.add_argument("--out")
    sp.add_argument("--float-arithmetic", action="store_true",
                    help="use binary float instead of exact decimal (diagnostic)")
    sp.add_argument("--genotype-build",
                    help="genome build the genotype data is declared to be on; "
                         "must match the manifest")
    sp.add_argument("--genotype-variants",
                    help="single-row CSV of the genotype file's variant ids, in "
                         "column order; verified element-by-element")

    cp = sub.add_parser("compare", help="compare reference output to contract output")
    cp.add_argument("--reference", required=True)
    cp.add_argument("--contract", required=True)
    cp.add_argument("--tolerance", default="1e-9")
    cp.add_argument("--out")

    sub.add_parser("selftest", help="run known-answer checks")

    rc = sub.add_parser("run-case", help="score a known-answer case file")
    rc.add_argument("--case", required=True)
    rc.add_argument("--out")

    fp = sub.add_parser("fixture-manifest", help="emit a manifest for HEPRS fixtures")
    fp.add_argument("--nominal", type=int, required=True)
    fp.add_argument("--scale", type=int, default=None,
                    help="override the advisor-recommended scale for this fixture "
                         "size; omit to use it (recommended)")
    fp.add_argument("--out")

    args = p.parse_args(argv)

    if args.cmd == "selftest":
        return 1 if selftest() else 0

    if args.cmd == "run-case":
        with open(args.case) as fh:
            case = json.load(fh)
        result = score_case(case)
        text = json.dumps(result, indent=2)
        if args.out:
            with open(args.out, "w") as fh:
                fh.write(text + "\n")
        agree = result["handCheckedAgreement"]
        n_checks = len(agree["checks"])
        bad = [c for c in agree["checks"] if not c["agrees"]]
        print("case %-24s scale=%-8d z_w=%-8d z_s=%-10d hand-checks %d/%d agree"
              % (result["case"], result["manifest"]["scale"],
                 result["encoding"]["weightZeroPoint"],
                 result["encoding"]["scoreOffset"],
                 n_checks - len(bad), n_checks))
        for c in bad:
            print("   DISAGREE %s: got %s want %s" % (c["check"], c["got"], c["want"]))
        return 1 if bad else 0

    if args.cmd == "fixture-manifest":
        scale = args.scale if args.scale is not None else advisor_scale(args.nominal)
        doc = fixture_manifest(args.nominal, scale)
        text = json.dumps(doc, indent=2)
        if args.out:
            with open(args.out, "w") as fh:
                fh.write(text + "\n")
            print("wrote %s (%d variants incl. intercept, scale=%d%s)"
                  % (args.out, len(doc["variants"]), scale,
                     "" if args.scale is None else " OVERRIDDEN"))
        else:
            print(text)
        return 0

    if args.cmd == "score":
        manifest = Manifest.load(args.manifest)
        result = score_cohort(manifest, args.genotypes, args.weights,
                              use_float=args.float_arithmetic,
                              declared_build=args.genotype_build,
                              variant_order_path=args.genotype_variants)
        text = json.dumps(result, indent=2)
        if args.out:
            with open(args.out, "w") as fh:
                fh.write(text + "\n")
            scored = sum(1 for i in result["individuals"] if i["status"] == "scored")
            print("wrote %s: %d individuals scored, %d rejected"
                  % (args.out, scored, len(result["individuals"]) - scored))
            print("  weightZeroPoint=%d scoreOffset=%d fitsUint64=%s"
                  % (result["encoding"]["weightZeroPoint"],
                     result["encoding"]["scoreOffset"],
                     result["overflow"]["fitsUint64"]))
        else:
            print(text)
        return 0

    if args.cmd == "compare":
        with open(args.reference) as fh:
            ref = json.load(fh)
        with open(args.contract) as fh:
            con = json.load(fh)
        rep = compare(ref, con, Decimal(args.tolerance))
        if args.out:
            with open(args.out, "w") as fh:
                fh.write(json.dumps(rep, indent=2) + "\n")
        print("compared              : %d" % rep["compared"])
        print("encoded mismatches    : %d" % rep["encodedMismatches"])
        print("decoded mismatches    : %d" % rep["decodedMismatches"])
        print("max abs decode error  : %s" % rep["maxAbsError"])
        print("tolerance             : %s" % rep["tolerance"])
        for row in rep["encodingParameters"]:
            print("  %-16s reference=%-12d contract=%-12d %s"
                  % (row["field"], row["reference"], row["contract"],
                     "agree" if row["agrees"] else "DISAGREE"))
        if not rep["pass"]:
            print("\nCOMPARISON FAILED")
            for r in rep["rows"]:
                if r.get("verdict") != "PASS":
                    print("  individual %s: %s" % (r.get("individual"), r))
            return 1
        print("\nCOMPARISON PASSED")
        return 0

    p.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
