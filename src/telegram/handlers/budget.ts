import { InlineKeyboard } from 'grammy';
import { getConfig } from '../../config';
import { currentMonth, formatMonthLabel, isValidMonth } from '../../lib/dates';
import { logger } from '../../lib/logger';
import { parseBudgetAmount } from '../../lib/money';
import { getBudgetMonthView, setCategoryBudget } from '../../services/budgets';
import { listCategoryGroups } from '../../services/categories';
import { MyContext, MyConversation } from '../types';
import { chunkHtmlMessage, escapeHtml, formatCurrency } from '../utils/format';
import { categoryKeyboard, monthNavigationKeyboard } from '../utils/keyboards';

const log = logger.child({ module: 'telegram-budget' });

export const budgetCommand = async (ctx: MyContext): Promise<void> => {
  const month = currentMonth(getConfig().APP_TIMEZONE);
  await renderBudgetMonth(ctx, month, false);
};

export const budgetMonthHandler = async (ctx: MyContext): Promise<void> => {
  const cbData = ctx.callbackQuery?.data;
  if (!cbData || !cbData.startsWith('budget_month:')) return;

  const month = cbData.slice('budget_month:'.length);
  if (!isValidMonth(month)) {
    await ctx.answerCallbackQuery({ text: 'Invalid month.' });
    return;
  }

  await ctx.answerCallbackQuery();
  await renderBudgetMonth(ctx, month, true);
};

export const setBudgetCallbackHandler = async (ctx: MyContext): Promise<void> => {
  const cbData = ctx.callbackQuery?.data;
  const month = cbData?.startsWith('set_budget:') ? cbData.slice('set_budget:'.length) : undefined;
  await ctx.answerCallbackQuery();

  if (month && isValidMonth(month)) {
    await ctx.conversation.enter('setBudgetConversation', month);
  } else {
    await ctx.conversation.enter('setBudgetConversation');
  }
};

async function renderBudgetMonth(ctx: MyContext, month: string, isEdit: boolean): Promise<void> {
  try {
    const view = await getBudgetMonthView(month);
    const label = formatMonthLabel(month, getConfig().APP_LOCALE);

    let message = `<b>📊 Budget for ${escapeHtml(label)} (${escapeHtml(month)})</b>\n`;
    message += `<i>To budget: ${escapeHtml(formatCurrency(view.toBudget))}</i>\n\n`;

    if (view.groups.length > 0) {
      for (const group of view.groups) {
        message += `<b>📁 ${escapeHtml(group.name)}</b>\n`;
        for (const cat of group.categories) {
          const budgeted = formatCurrency(cat.budgeted);
          const spent = formatCurrency(cat.spent);
          const balance = formatCurrency(cat.balance);
          message += `  • ${escapeHtml(cat.name)}\n`;
          message += `    <i>Bud: ${escapeHtml(budgeted)} | Spent: ${escapeHtml(spent)} | Left: ${escapeHtml(balance)}</i>\n`;
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

    const chunks = chunkHtmlMessage(message);
    if (chunks.length === 0) return;

    if (isEdit && ctx.callbackQuery?.message) {
      if (chunks.length === 1) {
        await ctx.editMessageText(chunks[0], { reply_markup: finalKeyboard, parse_mode: 'HTML' });
      } else {
        await ctx.editMessageText(chunks[0], { parse_mode: 'HTML' });
        for (let i = 1; i < chunks.length; i++) {
          const isLast = i === chunks.length - 1;
          await ctx.reply(chunks[i], {
            parse_mode: 'HTML',
            ...(isLast ? { reply_markup: finalKeyboard } : {}),
          });
        }
      }
    } else {
      for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        await ctx.reply(chunks[i], {
          parse_mode: 'HTML',
          ...(isLast ? { reply_markup: finalKeyboard } : {}),
        });
      }
    }
  } catch (error) {
    log.error({ err: error, month }, 'Error fetching budget');
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
  monthArg?: string,
): Promise<void> {
  const cancelMarkup = new InlineKeyboard().text('❌ Cancel', 'cancel_flow');

  // Determine month from explicit argument, callback payload, or current local month
  let month: string;
  if (monthArg && isValidMonth(monthArg)) {
    month = monthArg;
  } else if (ctx.callbackQuery?.data?.startsWith('set_budget:')) {
    const candidate = ctx.callbackQuery.data.slice('set_budget:'.length);
    month = isValidMonth(candidate)
      ? candidate
      : await conversation.external(() => currentMonth(getConfig().APP_TIMEZONE));
  } else {
    month = await conversation.external(() => currentMonth(getConfig().APP_TIMEZONE));
  }

  // Fetch expense categories
  const groups = await conversation.external(() => listCategoryGroups({ income: false }));
  const categories = groups.flatMap((g) => g.categories);

  if (categories.length === 0) {
    await ctx.reply('No budget categories found.');
    return;
  }

  const catKeyboard = categoryKeyboard(categories, groups, 'setbud_cat');
  await ctx.reply(`<b>✏️ Set Budget for ${escapeHtml(month)}</b>\n\nSelect a category:`, {
    reply_markup: catKeyboard,
    parse_mode: 'HTML',
  });

  // Wait for category selection
  const catQuery = await conversation.waitForCallbackQuery([/^setbud_cat:.+/, 'cancel_flow']);
  await catQuery.answerCallbackQuery();
  if (catQuery.callbackQuery.data === 'cancel_flow') {
    await catQuery.editMessageText('❌ Budget update cancelled.');
    return;
  }

  const categoryIdRaw = catQuery.callbackQuery.data.slice('setbud_cat:'.length);
  if (categoryIdRaw === 'skip') {
    await catQuery.editMessageText('❌ Budget update cancelled.');
    return;
  }

  const categoryId = categoryIdRaw;
  const selectedCat = categories.find((c) => c.id === categoryId);
  const categoryName = selectedCat ? escapeHtml(selectedCat.name) : 'Unknown';

  await catQuery.editMessageText(
    `Setting budget for <b>${categoryName}</b> (${escapeHtml(month)})\n\n💰 Enter the budget amount (e.g. <code>500.00</code>):`,
    { parse_mode: 'HTML', reply_markup: cancelMarkup },
  );

  // Wait for strict amount input
  let amountCents: number | null = null;
  while (amountCents === null) {
    const res = await conversation.wait();
    if (res.callbackQuery?.data === 'cancel_flow') {
      await res.answerCallbackQuery();
      await res.editMessageText('❌ Budget update cancelled.');
      return;
    }
    if (res.message?.text) {
      const text = res.message.text.trim();
      if (text === '/cancel' || text.startsWith('/cancel ')) {
        await ctx.reply('❌ Budget update cancelled.');
        return;
      }
      const parsed = parseBudgetAmount(text);
      if (parsed !== null) {
        amountCents = parsed;
        break;
      }
    }
    await ctx.reply(
      '❌ Invalid amount. Please enter a non-negative number (e.g. <code>500.00</code>):',
      {
        parse_mode: 'HTML',
        reply_markup: cancelMarkup,
      },
    );
  }

  // Persist budget update
  try {
    await conversation.external(() => setCategoryBudget(month, categoryId, amountCents!));

    await ctx.reply(
      `✅ Budget for <b>${categoryName}</b> set to <b>${escapeHtml(formatCurrency(amountCents))}</b> for ${escapeHtml(month)}.`,
      { parse_mode: 'HTML' },
    );
  } catch (error) {
    log.error({ err: error, month, categoryId }, 'Error setting budget');
    await ctx.reply('❌ Failed to set budget. Please try again.');
  }
}
