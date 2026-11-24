/**
 * Exact rational arithmetic on BigInt so money math never touches binary floats.
 * Values are always normalised: denominator > 0 and gcd(num, den) = 1.
 */
export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

function abs(v: bigint): bigint {
  return v < 0n ? -v : v;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

export function rational(num: bigint, den: bigint = 1n): Rational {
  if (den === 0n) throw new RangeError('Division by zero');
  const sign = den < 0n ? -1n : 1n;
  const g = gcd(num, den);
  return { num: (sign * num) / g, den: (sign * den) / g };
}

export const ZERO = rational(0n);

const DECIMAL_RE = /^([+-])?(\d*)(?:\.(\d*))?$/;

/** Parses a plain decimal string such as "12", "-0.5" or ".25". Returns null if malformed. */
export function parseDecimal(input: string): Rational | null {
  const match = DECIMAL_RE.exec(input.trim());
  if (!match) return null;
  const [, sign, intPart = '', fracPart = ''] = match;
  if (intPart === '' && fracPart === '') return null;
  const digits = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, '') || '0';
  const value = rational(BigInt(digits), 10n ** BigInt(fracPart.length));
  return sign === '-' ? negate(value) : value;
}

export function add(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function sub(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mul(a: Rational, b: Rational): Rational {
  return rational(a.num * b.num, a.den * b.den);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.num === 0n) throw new RangeError('Division by zero');
  return rational(a.num * b.den, a.den * b.num);
}

export function negate(a: Rational): Rational {
  return { num: -a.num, den: a.den };
}

export function isZero(a: Rational): boolean {
  return a.num === 0n;
}

/** Rounds to the nearest integer, halves away from zero (commercial rounding). */
export function roundHalfAwayFromZero(a: Rational): bigint {
  const n = abs(a.num);
  const q = n / a.den;
  const r = n % a.den;
  const rounded = r * 2n >= a.den ? q + 1n : q;
  return a.num < 0n ? -rounded : rounded;
}

/** Converts a value expressed in major units to integer minor units. */
export function toMinorUnits(value: Rational, fractionDigits: number): bigint {
  return roundHalfAwayFromZero(mul(value, rational(10n ** BigInt(fractionDigits))));
}
