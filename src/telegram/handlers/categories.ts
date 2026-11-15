import { getActualApi } from '../../actual/client';
import { MyContext } from '../types';
import { escapeHtml } from '../utils/format';

export const categoriesCommand = async (ctx: MyContext): Promise<void> => {
  try {
    const api = getActualApi();
    const [categories, groups] = await Promise.all([
      api.getCategories(),
      api.getCategoryGroups()
    ]);

    if (!categories || categories.length === 0) {
      await ctx.reply('No categories found.', { parse_mode: 'HTML' });
      return;
    }

    let message = '<b>🏷️ Your Categories</b>\n\n';

    for (const group of groups) {
      const groupCategories = categories.filter((c: any) => c.group_id === group.id);
      if (groupCategories.length > 0) {
        message += `<b>📁 ${escapeHtml(group.name)}</b>\n`;
        for (const category of groupCategories) {
          message += `  • ${escapeHtml(category.name)}\n`;
        }
        message += '\n';
      }
    }

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error fetching categories:', error);
    await ctx.reply('Failed to fetch categories. Please try again later.', { parse_mode: 'HTML' });
  }
};
