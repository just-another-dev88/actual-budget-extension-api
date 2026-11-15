import { Context, NextFunction } from 'grammy';
import { getConfig } from '../../config';
import { logger } from '../../lib/logger';

const log = logger.child({ module: 'telegram-auth' });

export async function authGuard(ctx: Context, next: NextFunction): Promise<void> {
  // Financial data must never be posted into group chats or channels.
  if (ctx.chat && ctx.chat.type !== 'private') {
    log.warn(
      { chatId: ctx.chat.id, chatType: ctx.chat.type, userId: ctx.from?.id },
      'Ignored non-private Telegram chat',
    );
    return;
  }

  const allowedUsers = getConfig().TELEGRAM_ALLOWED_USERS;
  if (ctx.from?.id && allowedUsers.includes(ctx.from.id)) {
    await next();
    return;
  }

  log.warn({ userId: ctx.from?.id, chatId: ctx.chat?.id }, 'Unauthorized Telegram access attempt');
}
