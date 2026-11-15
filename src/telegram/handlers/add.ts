import { getActualApi } from '../../actual/client';
import { MyContext, MyConversation } from '../types';
import { escapeHtml, formatCurrency } from '../utils/format';
import { accountKeyboard, categoryKeyboard, confirmKeyboard } from '../utils/keyboards';
import { InlineKeyboard } from 'grammy';

export async function addTransactionConversation(
  conversation: MyConversation,
  ctx: MyContext,
): Promise<void> {
  // Step 1: Fetch accounts and show selection
  const accounts = await conversation.external(() => getActualApi().getAccounts());
  if (!accounts || accounts.length === 0) {
    await ctx.reply('No accounts found.');
    return;
  }

  const accKeyboard = accountKeyboard(accounts, 'select_account');
  await ctx.reply('<b>💳 Select an account:</b>', {
    reply_markup: accKeyboard,
    parse_mode: 'HTML',
  });

  // Step 2: Wait for account selection
  const accQuery = await conversation.waitForCallbackQuery(/^select_account:.+/);
  await accQuery.answerCallbackQuery();
  const accountId = accQuery.callbackQuery.data.split(':')[1];
  const selectedAccount = accounts.find((a: any) => a.id === accountId);
  const accountName = selectedAccount?.name ?? accountId;
  await accQuery.editMessageText(`💳 Account: <b>${escapeHtml(accountName)}</b>`, {
    parse_mode: 'HTML',
  });

  // Step 3: Ask for amount
  await ctx.reply('💰 Enter the amount:\n<i>(positive = income, negative = expense, e.g. -25.50)</i>', {
    parse_mode: 'HTML',
  });

  let amountFloat: number | null = null;
  while (amountFloat === null) {
    const amountMsg = await conversation.waitFor('message:text');
    const parsed = parseFloat(amountMsg.message.text);
    if (!isNaN(parsed)) {
      amountFloat = parsed;
    } else {
      await ctx.reply('❌ Invalid amount. Please enter a number (e.g., <code>50.00</code> or <code>-25.50</code>):', {
        parse_mode: 'HTML',
      });
    }
  }

  // Step 4: Ask for payee name
  await ctx.reply('🏪 Enter the payee name:');
  const payeeMsg = await conversation.waitFor('message:text');
  const payee = payeeMsg.message.text;

  // Step 5: Fetch categories and show selection
  const fetchResult = await conversation.external(() => {
    const api = getActualApi();
    return Promise.all([api.getCategories(), api.getCategoryGroups()]);
  });
  const [categories, groups] = fetchResult;

  const catKeyboard = categoryKeyboard(categories, groups, 'select_category');
  await ctx.reply('<b>📂 Select a category:</b>', {
    reply_markup: catKeyboard,
    parse_mode: 'HTML',
  });

  // Step 6: Wait for category selection
  const catQuery = await conversation.waitForCallbackQuery(/^select_category:.+/);
  await catQuery.answerCallbackQuery();
  const categoryIdRaw = catQuery.callbackQuery.data.split(':')[1];
  const categoryId = categoryIdRaw === 'skip' ? null : categoryIdRaw;

  let categoryName = '<i>None</i>';
  if (categoryId) {
    const selectedCat = categories.find((c: any) => c.id === categoryId);
    categoryName = selectedCat ? escapeHtml(selectedCat.name) : '<i>Unknown</i>';
  }
  await catQuery.editMessageText(`📂 Category: <b>${categoryName}</b>`, { parse_mode: 'HTML' });

  // Step 7: Ask for notes (optional)
  const notesSkipKeyboard = new InlineKeyboard().text('⏭️ Skip', 'skip_notes');
  await ctx.reply('📝 Enter notes, or skip:', {
    reply_markup: notesSkipKeyboard,
    parse_mode: 'HTML',
  });

  let notes = '';
  const notesResponse = await conversation.wait();
  if (notesResponse.callbackQuery?.data === 'skip_notes') {
    await notesResponse.answerCallbackQuery();
    await notesResponse.editMessageText('<i>📝 Notes: skipped</i>', { parse_mode: 'HTML' });
  } else if (notesResponse.message?.text) {
    notes = notesResponse.message.text;
  }

  // Step 8: Show summary and confirm
  const today = new Date().toISOString().split('T')[0];
  const amountInteger = await conversation.external(() =>
    getActualApi().utils.amountToInteger(amountFloat!),
  );

  const summary = [
    '<b>📋 Transaction Summary</b>',
    '',
    `💳 Account: <b>${escapeHtml(accountName)}</b>`,
    `💰 Amount: <b>${escapeHtml(formatCurrency(amountInteger))}</b>`,
    `🏪 Payee: <b>${escapeHtml(payee)}</b>`,
    `📂 Category: <b>${categoryName}</b>`,
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
  const confQuery = await conversation.waitForCallbackQuery(/^confirm:(yes|no)$/);
  await confQuery.answerCallbackQuery();

  if (confQuery.callbackQuery.data === 'confirm:yes') {
    // Step 10: Create the transaction
    try {
      await conversation.external(async () => {
        const api = getActualApi();
        await api.importTransactions(accountId, [
          {
            account: accountId,
            date: today,
            amount: amountInteger,
            payee_name: payee,
            category: categoryId || undefined,
            notes: notes || undefined,
            cleared: false,
          } as any,
        ]);
      });

      await ctx.reply('✅ Transaction created successfully!');
    } catch (error) {
      console.error('Error creating transaction:', error);
      await ctx.reply('❌ Failed to create transaction. Please try again.');
    }
  } else {
    // Step 11: Cancel
    await confQuery.editMessageText('❌ Transaction cancelled.');
  }
}
