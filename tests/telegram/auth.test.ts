import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Context } from 'grammy';
import { resetConfigCache } from '../../src/config';
import { authGuard } from '../../src/telegram/middleware/auth';

describe('Telegram Auth Guard', () => {
  const mockNext = vi.fn(async () => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    resetConfigCache();
  });

  it('should allow authorized user in a private chat', async () => {
    const ctx = {
      from: { id: 111 },
      chat: { id: 111, type: 'private' },
      reply: vi.fn(),
    } as unknown as Context;

    await authGuard(ctx, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('should silently drop unauthorized user without replying', async () => {
    const ctx = {
      from: { id: 999999999 },
      chat: { id: 999999999, type: 'private' },
      reply: vi.fn(),
    } as unknown as Context;

    await authGuard(ctx, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('should silently drop updates when from is undefined', async () => {
    const ctx = {
      from: undefined,
      chat: { id: 111, type: 'private' },
      reply: vi.fn(),
    } as unknown as Context;

    await authGuard(ctx, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('should silently drop authorized user in group chat', async () => {
    const ctx = {
      from: { id: 111 },
      chat: { id: -10012345, type: 'group' },
      reply: vi.fn(),
    } as unknown as Context;

    await authGuard(ctx, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('should silently drop authorized user in supergroup chat', async () => {
    const ctx = {
      from: { id: 111 },
      chat: { id: -10099999, type: 'supergroup' },
      reply: vi.fn(),
    } as unknown as Context;

    await authGuard(ctx, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
