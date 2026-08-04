#!/usr/bin/env bash
#
# One command, one pass/fail: cross-language known-answer validation (R2.6-T1).
#
# Runs BOTH implementations over the same immutable inputs and fails on any
# disagreement:
#
#   Arm A  validation/independent_prs_reference.py   Python, derived from the
#                                                   manuscript, exact decimal
#   Arm B  validation/contract_case_run.ts          existing TypeScript helpers
#                                                   plus real fhEVM arithmetic
#                                                   through the deployed contracts
#
# Encoded scores are integers produced by the same deterministic integer arithmetic
# on both sides, so the default tolerance is ZERO: any difference is a genuine
# disagreement, not a precision artifact.
#
# Usage:   npm run validate:cross-language
#          bash validation/cross_language_check.sh [--tolerance 0]

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

TOLERANCE="0"
while [ $# -gt 0 ]; do
  case "$1" in
    --tolerance) TOLERANCE="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

REF_DIR="evidence/phase3/reference"
CON_DIR="evidence/phase3/contract"
CMP_DIR="evidence/phase3"
mkdir -p "$REF_DIR" "$CON_DIR"

# Match the runtime pin so results are reproducible (CD-002).
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm use >/dev/null 2>&1 || true
fi

FAILURES=0
step() { printf '\n=== %s ===\n' "$1"; }
fail() { echo "FAIL: $1"; FAILURES=$((FAILURES + 1)); }

step "Runtime"
echo "node   : $(node -v 2>/dev/null || echo 'not found')"
echo "python : $(python3 -V 2>&1)"
echo "commit : $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

# ---------------------------------------------------------------------------
step "Arm A, step 1 — reference self test (R2.2-T1, R2.3-T1)"
# Covers the manuscript worked example, the z_w clamp, mixed signed weights,
# allele reversal, strand handling, every QC rule, build and variant-order
# checks, intercept handling, and the rounding convention.
if ! python3 validation/independent_prs_reference.py selftest; then
  fail "reference self test"
fi

# ---------------------------------------------------------------------------
step "Arm A, step 2 — score known-answer cases and verify hand-computed values"
CASES=()
for f in validation/cases/*.json; do
  [ -e "$f" ] || continue
  CASES+=("$(basename "$f" .json)")
done
if [ ${#CASES[@]} -eq 0 ]; then
  fail "no case files found in validation/cases/"
fi
for c in "${CASES[@]}"; do
  if ! python3 validation/independent_prs_reference.py run-case \
      --case "validation/cases/${c}.json" \
      --out "${REF_DIR}/case_${c}.json"; then
    fail "reference run-case: ${c}"
  fi
done

# ---------------------------------------------------------------------------
step "Arm B — TypeScript + contract path through the fhEVM mock"
if ! npx hardhat test validation/contract_case_run.ts; then
  fail "contract case run"
fi

# ---------------------------------------------------------------------------
step "Cross-language comparison (tolerance ${TOLERANCE})"
for c in "${CASES[@]}"; do
  echo "--- ${c}"
  if ! python3 validation/independent_prs_reference.py compare \
      --reference "${REF_DIR}/case_${c}.json" \
      --contract "${CON_DIR}/case_${c}.json" \
      --tolerance "${TOLERANCE}" \
      --out "${CMP_DIR}/compare_${c}.json"; then
    fail "cross-language comparison: ${c}"
  fi
done

# ---------------------------------------------------------------------------
printf '\n========================================\n'
if [ "$FAILURES" -eq 0 ]; then
  echo "CROSS-LANGUAGE VALIDATION PASSED"
  echo "cases compared: ${#CASES[@]} (${CASES[*]})"
  echo "This is independent-implementation agreement, not a proof of correctness."
  printf '========================================\n'
  exit 0
fi
echo "CROSS-LANGUAGE VALIDATION FAILED: ${FAILURES} step(s)"
printf '========================================\n'
exit 1
