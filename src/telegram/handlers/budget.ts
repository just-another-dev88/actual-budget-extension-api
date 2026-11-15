import { getActualApi } from '../../actual/client';
import { MyContext, MyConversation } from '../types';
import { escapeHtml, formatCurrency } from '../utils/format';
import { categoryKeyboard, monthNavigationKeyboard } from '../utils/keyboards';
import { InlineKeyboard } from 'grammy';

export const budgetCommand = async (ctx: MyContext): Promise<void> => {
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  await renderBudgetMonth(ctx, currentMonth, false);
};

export const budgetMonthHandler = async (ctx: MyContext): Promise<void> => {
  const cbData = ctx.callbackQuery?.data;
  if (!cbData || !cbData.startsWith('budget_month:')) return;

  const month = cbData.split(':')[1];
  await ctx.answerCallbackQuery();
  await renderBudgetMonth(ctx, month, true);
};

async function renderBudgetMonth(ctx: MyContext, month: string, isEdit: boolean): Promise<void> {
  try {
    const api = getActualApi();
    const budgetData = await api.getBudgetMonth(month);

    let message = `<b>📊 Budget for ${escapeHtml(month)}</b>\n\n`;

    if (budgetData && budgetData.categoryGroups) {
      for (const group of budgetData.categoryGroups) {
        message += `<b>📁 ${escapeHtml(group.name)}</b>\n`;
        if (group.categories) {
          for (const cat of group.categories) {
            const budgeted = formatCurrency(cat.budgeted || 0);
            const spent = formatCurrency(cat.spent || 0);
            const balance = formatCurrency(cat.balance || 0);
            message += `  • ${escapeHtml(cat.name)}\n`;
            message += `    <i>Bud: ${budgeted} | Spent: ${spent} | Left: ${balance}</i>\n`;
          }
        }
        message += '\n';
      }
    } else {
      message += '<i>No budget data found for this month.</i>\n';
    }

    const navKeyboard = monthNavigationKeyboard('budget_month', month);
    const finalKeyboard = InlineKeyboard.from([
      ...navKeyboard.inline_keyboard,
      [{ text: '✏️ Set Budget', callback_data: `set_budget:${month}` }],
    ]);

    if (isEdit && ctx.callbackQuery?.message) {
      await ctx.editMessageText(message, { reply_markup: finalKeyboard, parse_mode: 'HTML' });
    } else {
      await ctx.reply(message, { reply_markup: finalKeyboard, parse_mode: 'HTML' });
    }
  } catch (error) {
    console.error('Error fetching budget:', error);
    const errText = 'Failed to load budget data.';
    if (isEdit && ctx.callbackQuery?.message) {
      await ctx.editMessageText(errText);
    } else {
      await ctx.reply(errText);
    }
  }
}

export async function setBudgetConversation(
  conversation: MyConversation,
  ctx: MyContext,
): Promise<void> {
  // Determine month (from callback or default to current)
  const month = new Date().toISOString().slice(0, 7);

  // Fetch categories
  const fetchResult = await conversation.external(() => {
    const api = getActualApi();
    return Promise.all([api.getCategories(), api.getCategoryGroups()]);
  });
  const [categories, groups] = fetchResult;

  const catKeyboard = categoryKeyboard(categories, groups, 'setbud_cat');
  await ctx.reply(`<b>✏️ Set Budget for ${escapeHtml(month)}</b>\n\nSelect a category:`, {
    reply_markup: catKeyboard,
    parse_mode: 'HTML',
  });

  // Wait for category selection
  const catQuery = await conversation.waitForCallbackQuery(/^setbud_cat:.+/);
  await catQuery.answerCallbackQuery();
  const categoryIdRaw = catQuery.callbackQuery.data.split(':')[1];

  if (categoryIdRaw === 'skip') {
    await catQuery.editMessageText('Budget setting cancelled.');
    return;
  }

  const categoryId = categoryIdRaw;
  const selectedCat = categories.find((c: any) => c.id === categoryId);
  const categoryName = selectedCat ? escapeHtml(selectedCat.name) : 'Unknown';

  await catQuery.editMessageText(
    `Setting budget for <b>${categoryName}</b> (${escapeHtml(month)})\n\n💰 Enter the budget amount:`,
    { parse_mode: 'HTML' },
  );

  // Wait for amount input
  let amountFloat: number | null = null;
  while (amountFloat === null) {
    const amountMsg = await conversation.waitFor('message:text');
    const parsed = parseFloat(amountMsg.message.text);
    if (!isNaN(parsed) && parsed >= 0) {
      amountFloat = parsed;
    } else {
      await ctx.reply('❌ Invalid amount. Please enter a positive number (e.g., <code>500.00</code>):', {
        parse_mode: 'HTML',
      });
    }
  }

  // Set the budget
  try {
    await conversation.external(async () => {
      const api = getActualApi();
      const amountInteger = api.utils.amountToInteger(amountFloat!);
      await api.setBudgetAmount(month, categoryId, amountInteger);
    });

    const displayAmount = await conversation.external(() =>
      getActualApi().utils.amountToInteger(amountFloat!),
    );

    await ctx.reply(
      `✅ Budget for <b>${categoryName}</b> set to <b>${formatCurrency(displayAmount)}</b> for ${escapeHtml(month)}.`,
      { parse_mode: 'HTML' },
    );
  } catch (error) {
    console.error('Error setting budget:', error);
    await ctx.reply('❌ Failed to set budget. Please try again.');
  }
}
