/**
 * Money helpers. Actual stores amounts as integer cents (negative = outflow).
 * Parsing is done on the string to avoid floating point rounding.
 */

// Optional sign, digits (optionally grouped with commas), optional 1-2 decimals.
const AMOUNT_RE = /^([+-])?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

export interface ParsedAmount {
  /** Absolute value in cents. */
  cents: number;
  /** Sign explicitly typed by the user, if any. */
  sign: '+' | '-' | null;
}

export function parseAmount(input: string): ParsedAmount | null {
  const normalized = input.trim().replace(/\s+/g, '');
  const match = AMOUNT_RE.exec(normalized);
  if (!match) return null;
  const [, sign, whole, fraction = ''] = match;
  const wholeNum = Number(whole.replace(/,/g, ''));
  const cents = wholeNum * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return { cents, sign: (sign as '+' | '-' | undefined) ?? null };
}

/**
 * Parse a transaction amount typed in chat.
 * Expenses are the default: `12.50` and `-12.50` are outflows, `+500` is income.
 * Returns signed cents, or null when invalid or zero.
 */
export function parseTransactionAmount(input: string): number | null {
  const parsed = parseAmount(input);
  if (!parsed || parsed.cents === 0) return null;
  return parsed.sign === '+' ? parsed.cents : -parsed.cents;
}

/** Parse a budget amount (must be >= 0, no sign allowed other than '+'). */
export function parseBudgetAmount(input: string): number | null {
  const parsed = parseAmount(input);
  if (!parsed || parsed.sign === '-') return null;
  return parsed.cents;
}

/** Convert a decimal number (REST input, e.g. 12.34) to integer cents. */
export function decimalToCents(amount: number): number {
  return Math.round(amount * 100);
}

export function formatMoney(cents: number, { locale = 'en-US', currency = 'USD' } = {}): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}
