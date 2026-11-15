import { describe, it, expect, vi, beforeEach } from 'vitest';

// Ensure Telegram env vars exist for config validation (dotenv loads .env automatically)
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test_bot_token';
process.env.TELEGRAM_ALLOWED_USERS = process.env.TELEGRAM_ALLOWED_USERS || '123456789';

const mockApi = {
  getAccounts: vi.fn(),
  getCategories: vi.fn(),
  getCategoryGroups: vi.fn(),
  getTransactions: vi.fn(),
  getBudgetMonth: vi.fn(),
  importTransactions: vi.fn(),
  setBudgetAmount: vi.fn(),
  utils: {
    amountToInteger: vi.fn((amt: number) => Math.round(amt * 100)),
  },
};

vi.mock('../../src/actual/client', () => ({
  getActualApi: vi.fn(() => mockApi),
}));

import { startCommand, helpCommand } from '../../src/telegram/handlers/start';
import { accountsCommand } from '../../src/telegram/handlers/accounts';
import { categoriesCommand } from '../../src/telegram/handlers/categories';

function createMockContext() {
  return {
    reply: vi.fn(),
    editMessageText: vi.fn(),
    answerCallbackQuery: vi.fn(),
    callbackQuery: undefined as any,
    from: { id: 123456789 },
    conversation: { enter: vi.fn() },
  } as any;
}

describe('Start Handler', () => {
  it('should send welcome message with commands', async () => {
    const ctx = createMockContext();
    await startCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const message = ctx.reply.mock.calls[0][0] as string;
    expect(message).toContain('Welcome');
    expect(message).toContain('/add');
    expect(message).toContain('/budget');
    expect(ctx.reply.mock.calls[0][1]).toEqual({ parse_mode: 'HTML' });
  });
});

describe('Help Handler', () => {
  it('should send help message listing all commands', async () => {
    const ctx = createMockContext();
    await helpCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const message = ctx.reply.mock.calls[0][0] as string;
    expect(message).toContain('/start');
    expect(message).toContain('/help');
    expect(message).toContain('/accounts');
    expect(message).toContain('/categories');
    expect(message).toContain('/transactions');
    expect(message).toContain('/add');
    expect(message).toContain('/budget');
  });
});

describe('Accounts Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display list of accounts', async () => {
    mockApi.getAccounts.mockResolvedValueOnce([
      { id: 'acct-1', name: 'Checking' },
      { id: 'acct-2', name: 'Savings' },
    ]);

    const ctx = createMockContext();
    await accountsCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const message = ctx.reply.mock.calls[0][0] as string;
    expect(message).toContain('Checking');
    expect(message).toContain('Savings');
    expect(message).toContain('acct-1');
    expect(message).toContain('acct-2');
  });

  it('should handle no accounts', async () => {
    mockApi.getAccounts.mockResolvedValueOnce([]);

    const ctx = createMockContext();
    await accountsCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const message = ctx.reply.mock.calls[0][0] as string;
    expect(message).toContain('No accounts found');
  });

  it('should handle API errors gracefully', async () => {
    mockApi.getAccounts.mockRejectedValueOnce(new Error('API Error'));

    const ctx = createMockContext();
    await accountsCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const message = ctx.reply.mock.calls[0][0] as string;
    expect(message).toContain('Failed');
  });
});

describe('Categories Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display grouped categories', async () => {
    mockApi.getCategories.mockResolvedValueOnce([
      { id: 'cat-1', name: 'Groceries', group_id: 'grp-1' },
      { id: 'cat-2', name: 'Rent', group_id: 'grp-2' },
    ]);
    mockApi.getCategoryGroups.mockResolvedValueOnce([
      { id: 'grp-1', name: 'Food' },
      { id: 'grp-2', name: 'Housing' },
    ]);

    const ctx = createMockContext();
    await categoriesCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const message = ctx.reply.mock.calls[0][0] as string;
    expect(message).toContain('Food');
    expect(message).toContain('Groceries');
    expect(message).toContain('Housing');
    expect(message).toContain('Rent');
  });

  it('should handle no categories', async () => {
    mockApi.getCategories.mockResolvedValueOnce([]);
    mockApi.getCategoryGroups.mockResolvedValueOnce([]);

    const ctx = createMockContext();
    await categoriesCommand(ctx);

    const message = ctx.reply.mock.calls[0][0] as string;
    expect(message).toContain('No categories found');
  });
});
