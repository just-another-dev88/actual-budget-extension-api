import { getActualApi } from '../../actual/client';
import { MyContext } from '../types';
import { formatTransactionLine } from '../utils/format';
import { accountKeyboard, paginationKeyboard } from '../utils/keyboards';

const LIMIT = 10;

export const transactionsCommand = async (ctx: MyContext): Promise<void> => {
  try {
    const api = getActualApi();
    const accounts = await api.getAccounts();

    if (!accounts || accounts.length === 0) {
      await ctx.reply('No accounts found.', { parse_mode: 'HTML' });
      return;
    }

    const keyboard = accountKeyboard(accounts, 'txn_account');
    await ctx.reply('<b>🧾 Select an account to view transactions:</b>', {
      reply_markup: keyboard,
      parse_mode: 'HTML',
    });
  } catch (error) {
    console.error('Error in transactions command:', error);
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
    console.error('Error in transactions account handler:', error);
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
    const offset = parseInt(parts[2], 10) || 0;
    const accountId = parts[3];

    if (!accountId) return;

    await ctx.answerCallbackQuery();
    await renderTransactionsPage(ctx, accountId, offset);
  } catch (error) {
    console.error('Error in transactions pagination:', error);
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
  const api = getActualApi();

  // Fetch last 90 days of transactions
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const allTransactions = await api.getTransactions(accountId, startDate, endDate);
  const total = allTransactions.length;

  const pageTransactions = allTransactions.slice(offset, offset + LIMIT);

  let message = '<b>🧾 Recent Transactions</b>\n\n';
  if (pageTransactions.length === 0) {
    message += '<i>No transactions found in the last 90 days.</i>';
  } else {
    for (const txn of pageTransactions) {
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
