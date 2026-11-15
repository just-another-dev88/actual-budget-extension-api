import { getConfig } from '../../config';
import { formatDisplayDate } from '../../lib/dates';
import { formatMoney } from '../../lib/money';

export function formatCurrency(amountInCents: number): string {
  const { APP_LOCALE, CURRENCY_CODE } = getConfig();
  return formatMoney(amountInCents, { locale: APP_LOCALE, currency: CURRENCY_CODE });
}

export function formatDate(dateStr: string): string {
  const { APP_LOCALE } = getConfig();
  return formatDisplayDate(dateStr, APP_LOCALE);
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface FormattableTransaction {
  date: string;
  amount: number;
  payeeName?: string;
  payee_name?: string;
  payee?: string | null;
  categoryName?: string | null;
  category?: string | null;
  notes?: string | null;
}

export function formatTransactionLine(tx: FormattableTransaction): string {
  const dateFormatted = formatDate(tx.date);
  const payeeName = escapeHtml(tx.payeeName || tx.payee_name || tx.payee || 'Unknown');
  const amountFormatted = formatCurrency(tx.amount);
  const category = tx.categoryName ?? tx.category ?? null;

  let line = `🗓 <b>${dateFormatted}</b> | 🛒 ${payeeName} | 💰 <b>${amountFormatted}</b>`;
  if (category) {
    line += `\n🏷️ ${escapeHtml(category)}`;
  }
  if (tx.notes) {
    line += `\n📝 <i>${escapeHtml(tx.notes)}</i>`;
  }
  return line;
}

/**
 * Split a long HTML message into chunks at paragraph (`\n\n`) or line (`\n`)
 * boundaries so each chunk stays safely under Telegram's 4096-character limit.
 */
export function chunkHtmlMessage(html: string, maxLength = 4000): string[] {
  if (!html) return [];
  if (html.length <= maxLength) return [html];

  const chunks: string[] = [];
  let remaining = html;

  while (remaining.length > maxLength) {
    const window = remaining.slice(0, maxLength);
    let splitAt = window.lastIndexOf('\n\n');
    let skip = 2;

    if (splitAt <= 0) {
      splitAt = window.lastIndexOf('\n');
      skip = 1;
    }
    if (splitAt <= 0) {
      splitAt = maxLength;
      skip = 0;
    }

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt + skip).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
