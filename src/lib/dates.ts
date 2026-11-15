/**
 * Time-zone aware date helpers. Actual Budget stores dates as plain
 * `YYYY-MM-DD` strings, so "today" must be computed in the user's zone,
 * never via `toISOString()` (which is UTC).
 */

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** `YYYY-MM-DD` for `now` as observed in `timeZone`. */
export function todayISO(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** `YYYY-MM` for `now` as observed in `timeZone`. */
export function currentMonth(timeZone: string, now: Date = new Date()): string {
  return todayISO(timeZone, now).slice(0, 7);
}

/** `YYYY-MM-DD` that is `days` before today in `timeZone`. */
export function daysAgoISO(days: number, timeZone: string, now: Date = new Date()): string {
  const [y, m, d] = todayISO(timeZone, now).split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d - days));
  return shifted.toISOString().slice(0, 10);
}

export function isValidMonth(value: string): boolean {
  return MONTH_RE.test(value);
}

export function isValidISODate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Shift a `YYYY-MM` month by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const match = MONTH_RE.exec(month);
  if (!match) throw new Error(`Invalid month: ${month}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** Human label for a `YYYY-MM` month, e.g. "November 2026". */
export function formatMonthLabel(month: string, locale = 'en-US'): string {
  const match = MONTH_RE.exec(month);
  if (!match) return month;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Human label for a `YYYY-MM-DD` date without any time-zone shifting. */
export function formatDisplayDate(isoDate: string, locale = 'en-US'): string {
  const match = DATE_RE.exec(isoDate);
  if (!match) return isoDate;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
