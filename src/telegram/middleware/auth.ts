import { Context, NextFunction } from 'grammy';
import { config } from '../../config';

const allowedUsers = (config.TELEGRAM_ALLOWED_USERS || '')
    .split(',')
    .map((id: string) => parseInt(id.trim(), 10))
    .filter((id: number) => !isNaN(id));

export async function authGuard(ctx: Context, next: NextFunction) {
    if (ctx.from?.id && allowedUsers.includes(ctx.from.id)) {
        await next();
    } else {
        await ctx.reply('⛔ Unauthorized. Contact the bot admin.');
    }
}
