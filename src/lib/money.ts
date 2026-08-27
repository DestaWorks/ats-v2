/**
 * The Money primitive — an integer amount in MINOR units, paired with an explicit currency.
 *
 * Zero runtime dependencies (destined for the same dependency-free `domain` package as `Clock`).
 *
 * Three invariants the type enforces so callers cannot get them wrong:
 *  1. The amount is always an integer count of minor units — a float amount is unrepresentable
 *     (`money()` throws), so `0.1 + 0.2` style drift can never enter a stored figure.
 *  2. Every amount carries its currency; `add`/`subtract`/`compare` refuse a mismatched pair
 *     instead of silently adding dollars to birr.
 *  3. The major↔minor factor comes from a per-currency `scale`, never a hardcoded `100` — JPY
 *     has scale 0, and any zero-decimal currency added later gets it right for free.
 */

/** Decimal digits in each currency's minor unit (ISO 4217 exponents). */
export const CURRENCY_SCALE = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  ETB: 2,
  JPY: 0,
} as const;

export type CurrencyCode = keyof typeof CURRENCY_SCALE;

export interface Money {
  readonly currency: CurrencyCode;
  /** Integer count of minor units (cents for USD, whole yen for JPY). */
  readonly minorUnits: number;
}

export function scaleOf(currency: CurrencyCode): number {
  return CURRENCY_SCALE[currency];
}

/** Minor units in one major unit — 100 for USD, 1 for JPY. Never assume this value. */
export function minorUnitsPerMajor(currency: CurrencyCode): number {
  return 10 ** CURRENCY_SCALE[currency];
}

function assertCurrency(currency: CurrencyCode): void {
  if (!(currency in CURRENCY_SCALE)) throw new RangeError(`Unknown currency: ${currency}`);
}

/** Build a Money from an integer count of minor units. Throws on a float or unsafe integer. */
export function money(minorUnits: number, currency: CurrencyCode): Money {
  assertCurrency(currency);
  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError(`Money amount must be a safe integer of minor units: ${minorUnits}`);
  }
  return { currency, minorUnits };
}

export function zero(currency: CurrencyCode): Money {
  return money(0, currency);
}

/**
 * Build a Money from a MAJOR-unit amount (dollars). The major amount must land exactly on a
 * minor unit — `fromMajorUnits(1.005, "USD")` is a rounding decision the caller has to make
 * deliberately, not something this constructor guesses at.
 */
export function fromMajorUnits(major: number, currency: CurrencyCode): Money {
  assertCurrency(currency);
  if (!Number.isFinite(major)) throw new RangeError(`Money major amount must be finite: ${major}`);
  const scaled = major * minorUnitsPerMajor(currency);
  const rounded = roundHalfAwayFromZero(scaled);
  if (Math.abs(scaled - rounded) > 1e-6) {
    throw new RangeError(
      `${major} is not representable in ${currency} (scale ${scaleOf(currency)}) — round it first`,
    );
  }
  return money(rounded, currency);
}

/** The major-unit value as a number — for DTO/display edges only, never for arithmetic. */
export function toMajorUnits(m: Money): number {
  return m.minorUnits / minorUnitsPerMajor(m.currency);
}

/** Exact fixed-point major-unit string, built from integer math (no float formatting). */
export function toMajorString(m: Money): string {
  const scale = scaleOf(m.currency);
  const sign = m.minorUnits < 0 ? "-" : "";
  const abs = Math.abs(m.minorUnits);
  if (scale === 0) return `${sign}${abs}`;
  const per = minorUnitsPerMajor(m.currency);
  return `${sign}${Math.trunc(abs / per)}.${String(abs % per).padStart(scale, "0")}`;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minorUnits + b.minorUnits, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minorUnits - b.minorUnits, a.currency);
}

export function negate(m: Money): Money {
  return money(-m.minorUnits, m.currency);
}

/** Commercial rounding: .5 always moves away from zero, symmetrically for debits and credits. */
function roundHalfAwayFromZero(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/** Scale by a dimensionless factor (a count, a rate, a fraction of a period). */
export function multiply(m: Money, factor: number): Money {
  if (!Number.isFinite(factor)) throw new RangeError(`Money factor must be finite: ${factor}`);
  return money(roundHalfAwayFromZero(m.minorUnits * factor), m.currency);
}

/** `percent` is a whole-number percentage (50 → half), matching how margins are stored. */
export function percentOf(m: Money, percent: number): Money {
  return multiply(m, percent / 100);
}

export function sum(amounts: readonly Money[], currency: CurrencyCode): Money {
  return amounts.reduce((acc, m) => add(acc, m), zero(currency));
}

/** Negative when `a < b`, 0 when equal, positive when `a > b`. Throws across currencies. */
export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.minorUnits - b.minorUnits;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.minorUnits === b.minorUnits;
}

export function isZero(m: Money): boolean {
  return m.minorUnits === 0;
}

export function isNegative(m: Money): boolean {
  return m.minorUnits < 0;
}

export function isPositive(m: Money): boolean {
  return m.minorUnits > 0;
}

/** Clamp to zero — for figures that are meaningless when negative (accrued revenue, balances). */
export function clampAtZero(m: Money): Money {
  return m.minorUnits < 0 ? zero(m.currency) : m;
}
