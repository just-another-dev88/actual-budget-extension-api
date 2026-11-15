import { logger } from '../../lib/logger';
import { listCategoryGroups } from '../../services/categories';
import { MyContext } from '../types';
import { chunkHtmlMessage, escapeHtml } from '../utils/format';

const log = logger.child({ module: 'telegram-categories' });

export const categoriesCommand = async (ctx: MyContext): Promise<void> => {
  try {
    const groups = await listCategoryGroups({ includeHidden: false });

    if (groups.length === 0) {
      await ctx.reply('No categories found.', { parse_mode: 'HTML' });
      return;
    }

    let message = '<b>🏷️ Your Categories</b>\n\n';
    for (const group of groups) {
      message += `<b>📁 ${escapeHtml(group.name)}</b>\n`;
      for (const category of group.categories) {
        message += `  • ${escapeHtml(category.name)}\n`;
      }
      message += '\n';
    }

    for (const chunk of chunkHtmlMessage(message)) {
      await ctx.reply(chunk, { parse_mode: 'HTML' });
    }
  } catch (error) {
    log.error({ err: error }, 'Error fetching categories');
    await ctx.reply('Failed to fetch categories. Please try again later.', { parse_mode: 'HTML' });
  }
};
