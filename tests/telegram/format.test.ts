import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  escapeHtml,
  formatTransactionLine,
  chunkHtmlMessage,
} from '../../src/telegram/utils/format';
import { daysAgoISO, todayISO } from '../../src/lib/dates';
import { parseBudgetAmount, parseTransactionAmount } from '../../src/lib/money';

describe('formatCurrency', () => {
  it('should format positive, negative, zero, small, and large amounts', () => {
    expect(formatCurrency(1234)).toBe('$12.34');
    expect(formatCurrency(-1234)).toBe('-$12.34');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(5)).toBe('$0.05');
    expect(formatCurrency(1000000)).toBe('$10,000.00');
  });
});

describe('formatDate', () => {
  it('should format ISO date strings without timezone shift', () => {
    expect(formatDate('2024-01-15')).toBe('Jan 15, 2024');
    expect(formatDate('2024-12-25')).toBe('Dec 25, 2024');
  });
});

describe('escapeHtml', () => {
  it('should escape &, <, >, and quotes', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
    expect(escapeHtml('<script>"x"</script>')).toBe('&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
});

describe('formatTransactionLine', () => {
  it('should format TransactionView with category and notes', () => {
    const result = formatTransactionLine({
      date: '2024-01-15',
      payeeName: 'Grocery Store',
      categoryName: 'Food',
      amount: -5000,
      notes: 'Weekly groceries',
    });
    expect(result).toContain('Grocery Store');
    expect(result).toContain('-$50.00');
    expect(result).toContain('Jan 15, 2024');
    expect(result).toContain('Food');
    expect(result).toContain('Weekly groceries');
  });

  it('should support legacy payee fields and escape HTML', () => {
    const result = formatTransactionLine({
      date: '2024-01-15',
      payee_name: 'A<B&C',
      amount: 100,
    });
    expect(result).toContain('A&lt;B&amp;C');
  });

  it('should fall back to Unknown when payee is missing', () => {
    const result = formatTransactionLine({ date: '2024-01-15', amount: 1000 });
    expect(result).toContain('Unknown');
  });
});

describe('chunkHtmlMessage', () => {
  it('should split long messages on paragraph boundaries under limit', () => {
    const block = '<b>Section</b>\nLine 1\nLine 2\n\n';
    const longText = block.repeat(20);
    const chunks = chunkHtmlMessage(longText, 120);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(120);
    }
  });
});

describe('Timezone date and strict money helpers', () => {
  it('todayISO respects non-UTC timezone before 08:00 UTC+8', () => {
    // 2026-08-02T23:30:00Z is 2026-08-03 07:30:00 in Asia/Manila (UTC+8)
    const now = new Date('2026-08-02T23:30:00Z');
    expect(todayISO('Asia/Manila', now)).toBe('2026-08-03');
    expect(daysAgoISO(2, 'Asia/Manila', now)).toBe('2026-08-01');
  });

  it('parseTransactionAmount defaults to expense and rejects malformed text', () => {
    expect(parseTransactionAmount('25.50')).toBe(-2550);
    expect(parseTransactionAmount('-25.50')).toBe(-2550);
    expect(parseTransactionAmount('+500')).toBe(50000);
    expect(parseTransactionAmount('1,234.56')).toBe(-123456);
    expect(parseTransactionAmount('12abc')).toBeNull();
    expect(parseTransactionAmount('0')).toBeNull();
  });

  it('parseBudgetAmount rejects negative amounts and malformed strings', () => {
    expect(parseBudgetAmount('500')).toBe(50000);
    expect(parseBudgetAmount('0')).toBe(0);
    expect(parseBudgetAmount('-10')).toBeNull();
    expect(parseBudgetAmount('12.345')).toBeNull();
  });
});
