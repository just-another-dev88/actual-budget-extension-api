import { config } from '../../config';

export function formatCurrency(amountInCents: number): string {
    const symbol = config.TELEGRAM_CURRENCY_SYMBOL || '$';
    const absolute = Math.abs(amountInCents) / 100;
    const formatted = absolute.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return amountInCents < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

export function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function formatTransactionLine(tx: { date: string; payee_name?: string; payee?: string; amount: number; notes?: string; category?: string }): string {
    const dateFormatted = formatDate(tx.date);
    const payeeName = escapeHtml(tx.payee_name || tx.payee || 'Unknown');
    const amountFormatted = formatCurrency(tx.amount);
    let line = `🗓 <b>${dateFormatted}</b> | 🛒 ${payeeName} | 💰 <b>${amountFormatted}</b>`;
    if (tx.notes) {
        line += `\n📝 <i>${escapeHtml(tx.notes)}</i>`;
    }
    return line;
}
