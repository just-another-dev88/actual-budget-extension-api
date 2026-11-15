import { logger } from '../../lib/logger';
import { listAccounts } from '../../services/accounts';
import { MyContext } from '../types';
import { chunkHtmlMessage, escapeHtml, formatCurrency } from '../utils/format';

const log = logger.child({ module: 'telegram-accounts' });

export const accountsCommand = async (ctx: MyContext): Promise<void> => {
  try {
    const accounts = await listAccounts({ withBalances: true });

    if (accounts.length === 0) {
      await ctx.reply('No accounts found.', { parse_mode: 'HTML' });
      return;
    }

    let message = '<b>🏦 Your Accounts</b>\n\n';
    for (const account of accounts) {
      const balance = formatCurrency(account.balance ?? 0);
      const tag = account.offBudget ? ' <i>(off-budget)</i>' : '';
      message += `• <b>${escapeHtml(account.name)}</b>${tag}: <b>${escapeHtml(balance)}</b>\n`;
    }

    for (const chunk of chunkHtmlMessage(message)) {
      await ctx.reply(chunk, { parse_mode: 'HTML' });
    }
  } catch (error) {
    log.error({ err: error }, 'Error fetching accounts');
    await ctx.reply('Failed to fetch accounts. Please try again later.', { parse_mode: 'HTML' });
  }
};
