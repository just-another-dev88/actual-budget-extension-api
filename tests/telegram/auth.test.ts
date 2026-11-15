import { describe, it, expect, vi, beforeEach } from 'vitest';

// Ensure Telegram env vars exist for config validation (dotenv loads .env automatically)
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test_bot_token';
process.env.TELEGRAM_ALLOWED_USERS = process.env.TELEGRAM_ALLOWED_USERS || '123456789';

import { authGuard } from '../../src/telegram/middleware/auth';

// Parse the allowed users from the env (same logic as the middleware)
const allowedUsers = (process.env.TELEGRAM_ALLOWED_USERS || '')
  .split(',')
  .map((id: string) => parseInt(id.trim(), 10))
  .filter((id: number) => !isNaN(id));

const firstAllowedUser = allowedUsers[0] || 123456789;

describe('Telegram Auth Guard', () => {
  const mockNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow authorized user', async () => {
    const ctx = {
      from: { id: firstAllowedUser },
      reply: vi.fn(),
    } as any;

    await authGuard(ctx, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('should reject unauthorized user', async () => {
    const ctx = {
      from: { id: 999999999 },
      reply: vi.fn(),
    } as any;

    await authGuard(ctx, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith('⛔ Unauthorized. Contact the bot admin.');
  });

  it('should reject when from is undefined', async () => {
    const ctx = {
      from: undefined,
      reply: vi.fn(),
    } as any;

    await authGuard(ctx, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalled();
  });
});
