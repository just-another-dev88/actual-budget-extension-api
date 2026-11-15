import { getActualApi } from '../../actual/client';
import { MyContext } from '../types';
import { escapeHtml } from '../utils/format';

export const accountsCommand = async (ctx: MyContext): Promise<void> => {
  try {
    const api = getActualApi();
    const accounts = await api.getAccounts();

    if (!accounts || accounts.length === 0) {
      await ctx.reply('No accounts found.', { parse_mode: 'HTML' });
      return;
    }

    let message = '<b>🏦 Your Accounts</b>\n\n';
    for (const account of accounts) {
      message += `• <b>${escapeHtml(account.name)}</b> (<code>${escapeHtml(account.id)}</code>)\n`;
    }

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    await ctx.reply('Failed to fetch accounts. Please try again later.', { parse_mode: 'HTML' });
  }
};
