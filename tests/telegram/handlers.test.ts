import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyContext } from '../../src/telegram/types';

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    getAccounts: vi.fn(),
    getAccountBalance: vi.fn(),
    getCategories: vi.fn(),
    getCategoryGroups: vi.fn(),
    getPayees: vi.fn(),
    getTransactions: vi.fn(),
    getBudgetMonth: vi.fn(),
    addTransactions: vi.fn(),
    setBudgetAmount: vi.fn(),
  },
}));

vi.mock('../../src/actual/client', () => ({
  withActual: vi.fn(async (fn: (api: typeof mockApi) => Promise<unknown>) => fn(mockApi)),
  getActualStatus: vi.fn(() => ({ ready: true, lastSyncAt: null })),
}));

import { startCommand, helpCommand } from '../../src/telegram/handlers/start';
import { accountsCommand } from '../../src/telegram/handlers/accounts';
import { categoriesCommand } from '../../src/telegram/handlers/categories';
import { transactionsAccountHandler } from '../../src/telegram/handlers/transactions';

function createMockContext(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    reply: vi.fn(async () => undefined),
    editMessageText: vi.fn(async () => undefined),
    answerCallbackQuery: vi.fn(async () => undefined),
    callbackQuery: undefined,
    from: { id: 111 },
    chat: { id: 111, type: 'private' },
    conversation: { enter: vi.fn(async () => undefined), exitAll: vi.fn(async () => undefined) },
    ...overrides,
  } as unknown as MyContext & {
    reply: ReturnType<typeof vi.fn>;
    editMessageText: ReturnType<typeof vi.fn>;
    answerCallbackQuery: ReturnType<typeof vi.fn>;
  };
}

describe('Start & Help Handlers', () => {
  it('should send welcome message with registered commands', async () => {
    const ctx = createMockContext();
    await startCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const message = ctx.reply.mock.calls[0][0] as string;
    expect(message).toContain('Welcome');
    expect(message).toContain('/add');
    expect(message).toContain('/budget');
    expect(message).toContain('/cancel');
    expect(ctx.reply.mock.calls[0][1]).toEqual({ parse_mode: 'HTML' });
  });

  it('should send help message listing all commands', async () => {
    const ctx = createMockContext();
    await helpCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const message = ctx.reply.mock.calls[0][0] as string;
    for (const cmd of [
      '/start',
      '/help',
      '/accounts',
      '/categories',
      '/transactions',
      '/add',
      '/budget',
      '/setbudget',
      '/cancel',
    ]) {
      expect(message).toContain(cmd);
    }
  });
});

describe('Accounts Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display list of open accounts with balances', async () => {
    mockApi.getAccounts.mockResolvedValueOnce([
      { id: 'acct-1', name: 'Checking', offbudget: false, closed: false },
      { id: 'acct-2', name: 'Investment', offbudget: true, closed: false },
      { id: 'acct-3', name: 'Old Closed', offbudget: false, closed: true },
    ]);
    mockApi.getAccountBalance.mockResolvedValueOnce(150000).mockResolvedValueOnce(250000);

    const ctx = createMockContext();
    await accountsCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const message = ctx.reply.mock.calls[0][0] as string;
    expect(message).toContain('Checking');
    expect(message).toContain('$1,500.00');
    expect(message).toContain('Investment');
    expect(message).toContain('(off-budget)');
    expect(message).not.toContain('Old Closed');
  });

  it('should handle no accounts', async () => {
    mockApi.getAccounts.mockResolvedValueOnce([]);

    const ctx = createMockContext();
    await accountsCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.reply.mock.calls[0][0]).toContain('No accounts found');
  });

  it('should handle API errors gracefully', async () => {
    mockApi.getAccounts.mockRejectedValueOnce(new Error('API Error'));

    const ctx = createMockContext();
    await accountsCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.reply.mock.calls[0][0]).toContain('Failed');
  });
});

describe('Categories Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display grouped visible categories', async () => {
    mockApi.getCategoryGroups.mockResolvedValueOnce([
      {
        id: 'grp-1',
        name: 'Food',
        hidden: false,
        categories: [
          { id: 'cat-1', name: 'Groceries', hidden: false },
          { id: 'cat-hidden', name: 'Secret', hidden: true },
        ],
      },
      {
        id: 'grp-hidden',
        name: 'Hidden Group',
        hidden: true,
        categories: [{ id: 'cat-2', name: 'Hidden Cat', hidden: false }],
      },
    ]);

    const ctx = createMockContext();
    await categoriesCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const message = ctx.reply.mock.calls[0][0] as string;
    expect(message).toContain('Food');
    expect(message).toContain('Groceries');
    expect(message).not.toContain('Secret');
    expect(message).not.toContain('Hidden Group');
  });

  it('should handle no categories', async () => {
    mockApi.getCategoryGroups.mockResolvedValueOnce([]);

    const ctx = createMockContext();
    await categoriesCommand(ctx);

    expect(ctx.reply.mock.calls[0][0]).toContain('No categories found');
  });
});

describe('Transactions Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve payee and category names instead of showing UUIDs', async () => {
    mockApi.getTransactions.mockResolvedValueOnce([
      {
        id: 'tx-1',
        account: 'acct-1',
        date: '2026-11-10',
        amount: -2550,
        payee: 'payee-uuid-1',
        category: 'cat-uuid-1',
        notes: 'Morning latte',
      },
    ]);
    mockApi.getPayees.mockResolvedValueOnce([{ id: 'payee-uuid-1', name: 'Blue Bottle Coffee' }]);
    mockApi.getCategories.mockResolvedValueOnce([{ id: 'cat-uuid-1', name: 'Coffee' }]);

    const ctx = createMockContext({
      callbackQuery: {
        data: 'txn_account:acct-1',
        message: { message_id: 1 },
      },
    });

    await transactionsAccountHandler(ctx);

    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.editMessageText).toHaveBeenCalledTimes(1);
    const rendered = ctx.editMessageText.mock.calls[0][0] as string;
    expect(rendered).toContain('Blue Bottle Coffee');
    expect(rendered).toContain('Coffee');
    expect(rendered).toContain('-$25.50');
    expect(rendered).not.toContain('payee-uuid-1');
  });
});
