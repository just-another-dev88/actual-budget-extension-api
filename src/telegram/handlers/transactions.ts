import { getConfig } from '../../config';
import { daysAgoISO, todayISO } from '../../lib/dates';
import { logger } from '../../lib/logger';
import { listAccounts } from '../../services/accounts';
import { listRecentTransactions } from '../../services/transactions';
import { MyContext } from '../types';
import { formatTransactionLine } from '../utils/format';
import { accountKeyboard, paginationKeyboard } from '../utils/keyboards';

const LIMIT = 10;
const LOOKBACK_DAYS = 90;
const log = logger.child({ module: 'telegram-transactions' });

export const transactionsCommand = async (ctx: MyContext): Promise<void> => {
  try {
    const accounts = await listAccounts();

    if (accounts.length === 0) {
      await ctx.reply('No accounts found.', { parse_mode: 'HTML' });
      return;
    }

    const keyboard = accountKeyboard(accounts, 'txn_account');
    await ctx.reply('<b>🧾 Select an account to view transactions:</b>', {
      reply_markup: keyboard,
      parse_mode: 'HTML',
    });
  } catch (error) {
    log.error({ err: error }, 'Error in transactions command');
    await ctx.reply('Failed to load accounts. Please try again later.');
  }
};

export const transactionsAccountHandler = async (ctx: MyContext): Promise<void> => {
  try {
    const cbData = ctx.callbackQuery?.data;
    if (!cbData) return;

    const accountId = cbData.split(':')[1];
    if (!accountId) return;

    await ctx.answerCallbackQuery();
    await renderTransactionsPage(ctx, accountId, 0);
  } catch (error) {
    log.error({ err: error }, 'Error in transactions account handler');
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: 'Error loading transactions.' });
    }
  }
};

export const transactionsPaginationHandler = async (ctx: MyContext): Promise<void> => {
  try {
    const cbData = ctx.callbackQuery?.data;
    if (!cbData) return;

    // Format: txn_page:prev:<offset>:<accountId> or txn_page:next:<offset>:<accountId>
    const parts = cbData.split(':');
    const offset = Math.max(parseInt(parts[2], 10) || 0, 0);
    const accountId = parts[3];

    if (!accountId) return;

    await ctx.answerCallbackQuery();
    await renderTransactionsPage(ctx, accountId, offset);
  } catch (error) {
    log.error({ err: error }, 'Error in transactions pagination');
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: 'Error fetching transactions.' });
    }
  }
};

async function renderTransactionsPage(
  ctx: MyContext,
  accountId: string,
  offset: number,
): Promise<void> {
  const { APP_TIMEZONE } = getConfig();
  const endDate = todayISO(APP_TIMEZONE);
  const startDate = daysAgoISO(LOOKBACK_DAYS, APP_TIMEZONE);

  const { items, total } = await listRecentTransactions({
    accountId,
    startDate,
    endDate,
    offset,
    limit: LIMIT,
  });

  let message = '<b>🧾 Recent Transactions</b>\n\n';
  if (items.length === 0) {
    message += `<i>No transactions found in the last ${LOOKBACK_DAYS} days.</i>`;
  } else {
    for (const txn of items) {
      message += formatTransactionLine(txn) + '\n\n';
    }
  }

  const keyboard = paginationKeyboard('txn_page', offset, total, LIMIT, `:${accountId}`);

  if (ctx.callbackQuery?.message) {
    await ctx.editMessageText(message, {
      reply_markup: keyboard,
      parse_mode: 'HTML',
    });
  } else {
    await ctx.reply(message, {
      reply_markup: keyboard,
      parse_mode: 'HTML',
    });
  }
}
