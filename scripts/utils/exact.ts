/**
 * Exact decimal arithmetic for decoding PRS scores.
 *
 * Decoding is `PRS = (e - z_s) / s`. Doing that division in JavaScript `Number`
 * introduces binary floating-point error into the very value being compared against
 * the independent reference, which would make a genuine disagreement
 * indistinguishable from a rounding artifact. These helpers keep the whole path in
 * `bigint` and emit a decimal string, so the comparison tolerance can be exactly zero.
 *
 * Shared by `validation/contract_case_run.ts` (R2.6-T1) and
 * `scripts/individual_level_validation.ts` (R2.7-E1).
 */

/**
 * Round a finite JavaScript number to the nearest integer, resolving exact half ties
 * away from zero. JavaScript's `Math.round` resolves negative half ties toward positive
 * infinity, so using it directly would disagree with the manuscript and independent
 * Decimal reference for values such as -0.5 and -2.5.
 */
export function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`roundHalfAwayFromZero requires a finite number, got ${value}`);
  }
  if (value === 0) return 0;
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Exact decimal string for `numerator / scale`, where `scale` is a positive power of
 * ten. Handles negative numerators, which occur whenever a patient carries more
 * risk-decreasing than risk-increasing alleles.
 */
export function decodeExactScaled(numerator: bigint, scale: bigint): string {
  if (scale <= 0n) throw new Error(`scale must be positive, got ${scale}`);
  const digits = decimalDigits(scale);
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const whole = abs / scale;
  const frac = abs % scale;
  // Suppress "-0" / "-0.000000": a zero score has no sign.
  const sign = negative && (whole !== 0n || frac !== 0n) ? "-" : "";
  if (digits === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${frac.toString().padStart(digits, "0")}`;
}

/**
 * Number of fractional digits implied by a power-of-ten scale. Throws when the scale
 * is not a power of ten, because the fixed-width fractional padding used above is
 * only correct for those.
 *
 * Note the advisor recommends scales such as 3e6 which are NOT powers of ten. Those
 * are handled by `decodeExactRational`, not here.
 */
function decimalDigits(scale: bigint): number {
  let n = scale;
  let digits = 0;
  while (n % 10n === 0n && n > 1n) {
    n /= 10n;
    digits += 1;
  }
  if (n !== 1n) {
    throw new Error(
      `decodeExactScaled requires a power-of-ten scale; ${scale} is not one. ` +
        `Use decodeExactRational for scales such as 3000000.`
    );
  }
  return digits;
}

/**
 * Exact decimal string for `numerator / scale` for ANY positive integer scale,
 * rendered to a fixed number of fractional digits with round-half-away-from-zero.
 *
 * Needed because the advisor's balanced recommendation is 3,000,000 for the 100- and
 * 500-SNP fixtures (CD-010), and 1/3,000,000 has no finite decimal expansion in
 * general. Rendering at a declared precision, with the rule stated, is honest;
 * silently truncating is not.
 *
 * `digits` should exceed the precision of the values being compared. The fixture
 * weights carry six decimal places, so 12 digits leaves ample headroom.
 */
export function decodeExactRational(
  numerator: bigint,
  scale: bigint,
  digits = 12
): string {
  if (scale <= 0n) throw new Error(`scale must be positive, got ${scale}`);
  if (digits < 0) throw new Error(`digits must be non-negative, got ${digits}`);

  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const pow = 10n ** BigInt(digits);

  // Scale up, then round half away from zero: (abs*pow*2 + scale) / (scale*2).
  const scaled = (abs * pow * 2n + scale) / (scale * 2n);

  const whole = scaled / pow;
  const frac = scaled % pow;
  const sign = negative && scaled !== 0n ? "-" : "";
  if (digits === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${frac.toString().padStart(digits, "0")}`;
}

/**
 * True when two exact decimal strings denote the same rational number, ignoring
 * trailing-zero and leading-zero differences ("0.45" vs "0.450000", "-0" vs "0").
 *
 * The Python reference emits the shortest exact representation while the contract arm
 * renders at a fixed width, so a plain string comparison would report spurious
 * mismatches.
 */
export function decimalStringsEqual(a: string, b: string): boolean {
  return normaliseDecimal(a) === normaliseDecimal(b);
}

export function normaliseDecimal(value: string): string {
  let s = value.trim();
  let sign = "";
  if (s.startsWith("-")) {
    sign = "-";
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  let [whole, frac = ""] = s.split(".");
  whole = whole.replace(/^0+(?=\d)/, "");
  frac = frac.replace(/0+$/, "");
  if (whole === "") whole = "0";
  if (whole === "0" && frac === "") return "0"; // canonical zero, unsigned
  return frac ? `${sign}${whole}.${frac}` : `${sign}${whole}`;
}
