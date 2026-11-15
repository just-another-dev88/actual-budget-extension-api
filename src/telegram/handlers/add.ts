import { InlineKeyboard } from 'grammy';
import { getConfig } from '../../config';
import { todayISO } from '../../lib/dates';
import { logger } from '../../lib/logger';
import { parseTransactionAmount } from '../../lib/money';
import { listAccounts } from '../../services/accounts';
import { listCategoryGroups } from '../../services/categories';
import { createTransactions } from '../../services/transactions';
import { MyContext, MyConversation } from '../types';
import { escapeHtml, formatCurrency } from '../utils/format';
import { accountKeyboard, categoryKeyboard, confirmKeyboard } from '../utils/keyboards';

const log = logger.child({ module: 'telegram-add' });

export async function addTransactionConversation(
  conversation: MyConversation,
  ctx: MyContext,
): Promise<void> {
  const cancelMarkup = new InlineKeyboard().text('❌ Cancel', 'cancel_flow');

  // Step 1: Fetch accounts and show selection
  const accounts = await conversation.external(() => listAccounts());
  if (accounts.length === 0) {
    await ctx.reply('No accounts found.');
    return;
  }

  await ctx.reply('<b>💳 Select an account:</b>', {
    reply_markup: accountKeyboard(accounts, 'select_account', true),
    parse_mode: 'HTML',
  });

  // Step 2: Wait for account selection
  const accQuery = await conversation.waitForCallbackQuery([/^select_account:.+/, 'cancel_flow']);
  await accQuery.answerCallbackQuery();
  if (accQuery.callbackQuery.data === 'cancel_flow') {
    await accQuery.editMessageText('❌ Transaction cancelled.');
    return;
  }

  const accountId = accQuery.callbackQuery.data.slice('select_account:'.length);
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const accountName = selectedAccount?.name ?? accountId;
  await accQuery.editMessageText(`💳 Account: <b>${escapeHtml(accountName)}</b>`, {
    parse_mode: 'HTML',
  });

  // Step 3: Ask for amount (expense by default, + for income)
  await ctx.reply(
    '💰 Enter the amount (e.g. <code>25.50</code> for expense, <code>+500</code> for income):',
    { parse_mode: 'HTML', reply_markup: cancelMarkup },
  );

  let amountCents: number | null = null;
  while (amountCents === null) {
    const res = await conversation.wait();
    if (res.callbackQuery?.data === 'cancel_flow') {
      await res.answerCallbackQuery();
      await res.editMessageText('❌ Transaction cancelled.');
      return;
    }
    if (res.message?.text) {
      const text = res.message.text.trim();
      if (text === '/cancel' || text.startsWith('/cancel ')) {
        await ctx.reply('❌ Transaction cancelled.');
        return;
      }
      const parsed = parseTransactionAmount(text);
      if (parsed !== null) {
        amountCents = parsed;
        break;
      }
    }
    await ctx.reply(
      '❌ Invalid amount. Please enter a non-zero number (e.g. <code>25.50</code> for expense, <code>+500</code> for income):',
      { parse_mode: 'HTML', reply_markup: cancelMarkup },
    );
  }

  // Step 4: Ask for payee name
  await ctx.reply('🏪 Enter the payee name:', { reply_markup: cancelMarkup });
  let payee = '';
  while (!payee) {
    const res = await conversation.wait();
    if (res.callbackQuery?.data === 'cancel_flow') {
      await res.answerCallbackQuery();
      await res.editMessageText('❌ Transaction cancelled.');
      return;
    }
    if (res.message?.text) {
      const text = res.message.text.trim();
      if (text === '/cancel' || text.startsWith('/cancel ')) {
        await ctx.reply('❌ Transaction cancelled.');
        return;
      }
      if (text.length > 0 && text.length <= 200) {
        payee = text;
        break;
      }
    }
    await ctx.reply('❌ Please enter a payee name (1–200 characters):', {
      reply_markup: cancelMarkup,
    });
  }

  // Step 5: Fetch expense categories and show selection
  const groups = await conversation.external(() => listCategoryGroups({ income: false }));
  const categories = groups.flatMap((g) => g.categories);

  await ctx.reply('<b>📂 Select a category:</b>', {
    reply_markup: categoryKeyboard(categories, groups, 'select_category'),
    parse_mode: 'HTML',
  });

  // Step 6: Wait for category selection
  const catQuery = await conversation.waitForCallbackQuery([/^select_category:.+/, 'cancel_flow']);
  await catQuery.answerCallbackQuery();
  if (catQuery.callbackQuery.data === 'cancel_flow') {
    await catQuery.editMessageText('❌ Transaction cancelled.');
    return;
  }

  const categoryIdRaw = catQuery.callbackQuery.data.slice('select_category:'.length);
  const categoryId = categoryIdRaw === 'skip' ? null : categoryIdRaw;

  let categoryDisplay = '<i>None</i>';
  if (categoryId) {
    const selectedCat = categories.find((c) => c.id === categoryId);
    categoryDisplay = selectedCat ? `<b>${escapeHtml(selectedCat.name)}</b>` : '<i>Unknown</i>';
  }
  await catQuery.editMessageText(`📂 Category: ${categoryDisplay}`, { parse_mode: 'HTML' });

  // Step 7: Ask for notes (optional)
  const notesKeyboard = new InlineKeyboard()
    .text('⏭️ Skip', 'skip_notes')
    .text('❌ Cancel', 'cancel_flow');
  await ctx.reply('📝 Enter notes, or skip:', {
    reply_markup: notesKeyboard,
    parse_mode: 'HTML',
  });

  let notes = '';
  while (true) {
    const res = await conversation.wait();
    if (res.callbackQuery?.data === 'cancel_flow') {
      await res.answerCallbackQuery();
      await res.editMessageText('❌ Transaction cancelled.');
      return;
    }
    if (res.callbackQuery?.data === 'skip_notes') {
      await res.answerCallbackQuery();
      await res.editMessageText('<i>📝 Notes: skipped</i>', { parse_mode: 'HTML' });
      break;
    }
    if (res.message?.text) {
      const text = res.message.text.trim();
      if (text === '/cancel' || text.startsWith('/cancel ')) {
        await ctx.reply('❌ Transaction cancelled.');
        return;
      }
      notes = text.slice(0, 1000);
      break;
    }
    await ctx.reply('Please send text notes, or tap Skip / Cancel:', {
      reply_markup: notesKeyboard,
    });
  }

  // Step 8: Show summary in local timezone and confirm
  const today = await conversation.external(() => todayISO(getConfig().APP_TIMEZONE));

  const summary = [
    '<b>📋 Transaction Summary</b>',
    '',
    `💳 Account: <b>${escapeHtml(accountName)}</b>`,
    `💰 Amount: <b>${escapeHtml(formatCurrency(amountCents))}</b>`,
    `🏪 Payee: <b>${escapeHtml(payee)}</b>`,
    `📂 Category: ${categoryDisplay}`,
    `📅 Date: <b>${escapeHtml(today)}</b>`,
    notes ? `📝 Notes: <i>${escapeHtml(notes)}</i>` : '',
    '',
    'Is this correct?',
  ]
    .filter(Boolean)
    .join('\n');

  await ctx.reply(summary, {
    reply_markup: confirmKeyboard(),
    parse_mode: 'HTML',
  });

  // Step 9: Wait for confirmation
  const confQuery = await conversation.waitForCallbackQuery([/^confirm:(yes|no)$/, 'cancel_flow']);
  await confQuery.answerCallbackQuery();

  if (confQuery.callbackQuery.data === 'confirm:yes') {
    try {
      await conversation.external(() =>
        createTransactions(
          [
            {
              accountId,
              date: today,
              amount: amountCents!,
              payeeName: payee,
              categoryId,
              notes: notes || undefined,
            },
          ],
          'add',
        ),
      );

      await confQuery.editMessageText('✅ Transaction created successfully!');
    } catch (error) {
      log.error({ err: error }, 'Error creating transaction');
      await confQuery.editMessageText('❌ Failed to create transaction. Please try again.');
    }
  } else {
    await confQuery.editMessageText('❌ Transaction cancelled.');
  }
}
