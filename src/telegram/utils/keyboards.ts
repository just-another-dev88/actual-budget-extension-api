import { InlineKeyboard } from 'grammy';
import { getConfig } from '../../config';
import { formatMonthLabel, shiftMonth } from '../../lib/dates';

export interface KeyboardAccount {
  id: string;
  name: string;
}

export interface KeyboardCategory {
  id: string;
  name: string;
  group_id?: string;
  groupId?: string;
  hidden?: boolean | number;
}

export interface KeyboardCategoryGroup {
  id: string;
  name: string;
  hidden?: boolean | number;
}

export function accountKeyboard(
  accounts: KeyboardAccount[],
  callbackPrefix = 'select_account',
  includeCancel = false,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  let count = 0;
  for (const acc of accounts) {
    keyboard.text(acc.name, `${callbackPrefix}:${acc.id}`);
    count++;
    if (count % 2 === 0) keyboard.row();
  }
  if (includeCancel) {
    if (count % 2 !== 0) keyboard.row();
    keyboard.text('❌ Cancel', 'cancel_flow');
  }
  return keyboard;
}

export function categoryKeyboard(
  categories: KeyboardCategory[],
  groups?: KeyboardCategoryGroup[],
  callbackPrefix = 'select_category',
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const visibleCategories = categories.filter((c) => !c.hidden);

  if (groups && groups.length > 0) {
    for (const group of groups) {
      if (group.hidden) continue;
      const groupCats = visibleCategories.filter((c) => (c.groupId ?? c.group_id) === group.id);
      if (groupCats.length === 0) continue;

      keyboard.text(`── ${group.name} ──`, 'noop').row();
      let count = 0;
      for (const cat of groupCats) {
        keyboard.text(cat.name, `${callbackPrefix}:${cat.id}`);
        count++;
        if (count % 2 === 0) keyboard.row();
      }
      if (count % 2 !== 0) keyboard.row();
    }
  } else {
    let count = 0;
    for (const cat of visibleCategories) {
      keyboard.text(cat.name, `${callbackPrefix}:${cat.id}`);
      count++;
      if (count % 2 === 0) keyboard.row();
    }
    if (count % 2 !== 0) keyboard.row();
  }

  keyboard.row().text('⏭️ Skip', `${callbackPrefix}:skip`).row().text('❌ Cancel', 'cancel_flow');
  return keyboard;
}

export function confirmKeyboard(callbackPrefix = 'confirm'): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm', `${callbackPrefix}:yes`)
    .text('❌ Cancel', `${callbackPrefix}:no`);
}

export function paginationKeyboard(
  prefix: string,
  offset: number,
  total: number,
  limit: number,
  suffix = '',
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  if (hasPrev) {
    keyboard.text('◀️ Prev', `${prefix}:prev:${Math.max(offset - limit, 0)}${suffix}`);
  }

  keyboard.text(`Page ${currentPage} of ${totalPages}`, 'noop');

  if (hasNext) {
    keyboard.text('Next ▶️', `${prefix}:next:${offset + limit}${suffix}`);
  }

  return keyboard;
}

export function monthNavigationKeyboard(
  callbackPrefix: string,
  currentMonth: string,
): InlineKeyboard {
  const prevMonthStr = shiftMonth(currentMonth, -1);
  const nextMonthStr = shiftMonth(currentMonth, 1);
  const label = formatMonthLabel(currentMonth, getConfig().APP_LOCALE);

  return new InlineKeyboard()
    .text('◀️', `${callbackPrefix}:${prevMonthStr}`)
    .text(label, 'noop')
    .text('▶️', `${callbackPrefix}:${nextMonthStr}`);
}
