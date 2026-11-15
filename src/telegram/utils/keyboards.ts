import { InlineKeyboard } from 'grammy';

export function accountKeyboard(
  accounts: Array<{ id: string; name: string }>,
  callbackPrefix = 'select_account',
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  let count = 0;
  for (const acc of accounts) {
    keyboard.text(acc.name, `${callbackPrefix}:${acc.id}`);
    count++;
    if (count % 2 === 0) keyboard.row();
  }
  return keyboard;
}

export function categoryKeyboard(
  categories: Array<{ id: string; name: string; group_id?: string }>,
  groups?: Array<{ id: string; name: string }>,
  callbackPrefix = 'select_category',
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (groups && groups.length > 0) {
    for (const group of groups) {
      keyboard.text(`── ${group.name} ──`, 'noop').row();
      const groupCats = categories.filter((c) => c.group_id === group.id);
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
    for (const cat of categories) {
      keyboard.text(cat.name, `${callbackPrefix}:${cat.id}`);
      count++;
      if (count % 2 === 0) keyboard.row();
    }
    if (count % 2 !== 0) keyboard.row();
  }

  keyboard.row().text('⏭️ Skip', `${callbackPrefix}:skip`);
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
    keyboard.text('◀️ Prev', `${prefix}:prev:${offset - limit}${suffix}`);
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
  const [yearStr, monthStr] = currentMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }

  const prevMonthStr = `${prevYear}-${prevMonth.toString().padStart(2, '0')}`;
  const nextMonthStr = `${nextYear}-${nextMonth.toString().padStart(2, '0')}`;

  const date = new Date(year, month - 1, 1);
  const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return new InlineKeyboard()
    .text('◀️', `${callbackPrefix}:${prevMonthStr}`)
    .text(label, 'noop')
    .text('▶️', `${callbackPrefix}:${nextMonthStr}`);
}
