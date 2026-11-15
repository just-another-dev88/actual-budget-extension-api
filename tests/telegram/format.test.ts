import { describe, it, expect, vi } from 'vitest';

// Ensure Telegram env vars exist for config validation (dotenv loads .env automatically)
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test_bot_token';
process.env.TELEGRAM_ALLOWED_USERS = process.env.TELEGRAM_ALLOWED_USERS || '123456789';

import { formatCurrency, formatDate, escapeHtml, formatTransactionLine } from '../../src/telegram/utils/format';

describe('formatCurrency', () => {
  it('should format positive amounts', () => {
    expect(formatCurrency(1234)).toBe('$12.34');
  });

  it('should format negative amounts', () => {
    expect(formatCurrency(-1234)).toBe('-$12.34');
  });

  it('should format zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('should handle small amounts', () => {
    expect(formatCurrency(5)).toBe('$0.05');
  });

  it('should handle large amounts', () => {
    expect(formatCurrency(1000000)).toBe('$10,000.00');
  });
});

describe('formatDate', () => {
  it('should format a date string', () => {
    const result = formatDate('2024-01-15');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('should format another date', () => {
    const result = formatDate('2024-12-25');
    expect(result).toContain('Dec');
    expect(result).toContain('25');
    expect(result).toContain('2024');
  });
});

describe('escapeHtml', () => {
  it('should escape ampersands', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('should escape angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('should handle clean strings', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('should handle all special chars together', () => {
    expect(escapeHtml('<b>A & B</b>')).toBe('&lt;b&gt;A &amp; B&lt;/b&gt;');
  });
});

describe('formatTransactionLine', () => {
  it('should format a basic transaction', () => {
    const tx = {
      date: '2024-01-15',
      payee_name: 'Grocery Store',
      amount: -5000,
    };
    const result = formatTransactionLine(tx);
    expect(result).toContain('Grocery Store');
    expect(result).toContain('$50.00');
    expect(result).toContain('Jan');
  });

  it('should use payee if payee_name is missing', () => {
    const tx = {
      date: '2024-01-15',
      payee: 'Some Payee',
      amount: 1000,
    };
    const result = formatTransactionLine(tx);
    expect(result).toContain('Some Payee');
  });

  it('should show Unknown for missing payee', () => {
    const tx = {
      date: '2024-01-15',
      amount: 1000,
    };
    const result = formatTransactionLine(tx);
    expect(result).toContain('Unknown');
  });

  it('should include notes when present', () => {
    const tx = {
      date: '2024-01-15',
      payee_name: 'Store',
      amount: -2500,
      notes: 'Weekly groceries',
    };
    const result = formatTransactionLine(tx);
    expect(result).toContain('Weekly groceries');
  });

  it('should escape HTML in payee names', () => {
    const tx = {
      date: '2024-01-15',
      payee_name: 'A<B&C',
      amount: 100,
    };
    const result = formatTransactionLine(tx);
    expect(result).toContain('A&lt;B&amp;C');
  });
});
