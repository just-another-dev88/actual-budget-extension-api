import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getConfig, resetConfigCache } from '../../src/config';
import { getComponentStates } from '../../src/lib/health';
import { MyContext, MyConversation } from '../../src/telegram/types';

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    getAccounts: vi.fn(),
    getCategoryGroups: vi.fn(),
    addTransactions: vi.fn(),
    setBudgetAmount: vi.fn(),
  },
}));

vi.mock('../../src/actual/client', () => ({
  withActual: vi.fn(async (fn: (api: typeof mockApi) => Promise<unknown>) => fn(mockApi)),
  getActualStatus: vi.fn(() => ({ ready: true, lastSyncAt: null })),
}));

import { addTransactionConversation } from '../../src/telegram/handlers/add';
import {
  setBudgetCallbackHandler,
  setBudgetConversation,
} from '../../src/telegram/handlers/budget';
import { startBot } from '../../src/telegram/bot';

type MockEvent = { type: 'callback'; data: string } | { type: 'text'; text: string };

function createMockConversation(events: MockEvent[]) {
  let index = 0;

  const nextCallback = (data: string) => ({
    callbackQuery: { data, message: { message_id: 1 } },
    answerCallbackQuery: vi.fn(async () => undefined),
    editMessageText: vi.fn(async () => undefined),
    reply: vi.fn(async () => undefined),
  });

  const nextText = (text: string) => ({
    message: { text },
    reply: vi.fn(async () => undefined),
  });

  const conversation = {
    external: vi.fn(async <T>(fn: () => Promise<T> | T) => fn()),
    wait: vi.fn(async () => {
      const ev = events[index++];
      if (!ev) throw new Error('Test ran out of conversation events');
      return ev.type === 'callback' ? nextCallback(ev.data) : nextText(ev.text);
    }),
    waitForCallbackQuery: vi.fn(async () => {
      const ev = events[index++];
      if (!ev || ev.type !== 'callback') {
        throw new Error(`Expected callback event at index ${index - 1}, got ${ev?.type}`);
      }
      return nextCallback(ev.data);
    }),
  };

  return conversation as unknown as MyConversation;
}

function createMockCtx(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    reply: vi.fn(async () => undefined),
    editMessageText: vi.fn(async () => undefined),
    answerCallbackQuery: vi.fn(async () => undefined),
    conversation: { enter: vi.fn(async () => undefined) },
    ...overrides,
  } as unknown as MyContext & {
    reply: ReturnType<typeof vi.fn>;
    editMessageText: ReturnType<typeof vi.fn>;
    answerCallbackQuery: ReturnType<typeof vi.fn>;
    conversation: { enter: ReturnType<typeof vi.fn> };
  };
}

describe('Telegram Conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetConfigCache();
  });

  describe('addTransactionConversation', () => {
    beforeEach(() => {
      mockApi.getAccounts.mockResolvedValue([{ id: 'acct-1', name: 'Checking', closed: false }]);
      mockApi.getCategoryGroups.mockResolvedValue([
        {
          id: 'grp-1',
          name: 'Food',
          is_income: false,
          hidden: false,
          categories: [{ id: 'cat-1', name: 'Coffee', group_id: 'grp-1', hidden: false }],
        },
        {
          id: 'grp-inc',
          name: 'Income',
          is_income: true,
          hidden: false,
          categories: [{ id: 'cat-inc', name: 'Salary', group_id: 'grp-inc', is_income: true }],
        },
      ]);
      mockApi.addTransactions.mockResolvedValue(['txn-new-1']);
    });

    it('creates an expense transaction by default via addTransactions and handles invalid amount retry', async () => {
      const conversation = createMockConversation([
        { type: 'callback', data: 'select_account:acct-1' },
        { type: 'text', text: '12abc' }, // invalid input -> re-prompt
        { type: 'text', text: '15.50' }, // plain number -> -1550 cents (expense)
        { type: 'text', text: 'Local Cafe' },
        { type: 'callback', data: 'select_category:cat-1' },
        { type: 'callback', data: 'skip_notes' },
        { type: 'callback', data: 'confirm:yes' },
      ]);
      const ctx = createMockCtx();

      await addTransactionConversation(conversation, ctx);

      expect(mockApi.addTransactions).toHaveBeenCalledTimes(1);
      const [acctId, txns, opts] = mockApi.addTransactions.mock.calls[0];
      expect(acctId).toBe('acct-1');
      expect(txns[0]).toMatchObject({
        amount: -1550,
        payee_name: 'Local Cafe',
        category: 'cat-1',
        cleared: false,
      });
      expect(opts).toEqual({ learnCategories: true, runTransfers: true });
    });

    it('creates an income transaction when prefixed with +', async () => {
      const conversation = createMockConversation([
        { type: 'callback', data: 'select_account:acct-1' },
        { type: 'text', text: '+500' },
        { type: 'text', text: 'Employer' },
        { type: 'callback', data: 'select_category:skip' },
        { type: 'text', text: 'Bonus' },
        { type: 'callback', data: 'confirm:yes' },
      ]);
      const ctx = createMockCtx();

      await addTransactionConversation(conversation, ctx);

      expect(mockApi.addTransactions).toHaveBeenCalledTimes(1);
      expect(mockApi.addTransactions.mock.calls[0][1][0]).toMatchObject({
        amount: 50000,
        payee_name: 'Employer',
        notes: 'Bonus',
      });
    });

    it('cancels cleanly when cancel_flow is pressed', async () => {
      const conversation = createMockConversation([{ type: 'callback', data: 'cancel_flow' }]);
      const ctx = createMockCtx();

      await addTransactionConversation(conversation, ctx);

      expect(mockApi.addTransactions).not.toHaveBeenCalled();
    });
  });

  describe('setBudgetConversation & setBudgetCallbackHandler', () => {
    it('passes viewed month from set_budget callback into conversation', async () => {
      const ctx = createMockCtx({ callbackQuery: { data: 'set_budget:2026-05' } });
      await setBudgetCallbackHandler(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      expect(ctx.conversation.enter).toHaveBeenCalledWith('setBudgetConversation', '2026-05');
    });

    it('sets budget amount on the passed month argument', async () => {
      mockApi.getCategoryGroups.mockResolvedValueOnce([
        {
          id: 'grp-1',
          name: 'Food',
          is_income: false,
          hidden: false,
          categories: [{ id: 'cat-1', name: 'Groceries', group_id: 'grp-1', hidden: false }],
        },
      ]);
      mockApi.setBudgetAmount.mockResolvedValueOnce(undefined);

      const conversation = createMockConversation([
        { type: 'callback', data: 'setbud_cat:cat-1' },
        { type: 'text', text: '650.25' },
      ]);
      const ctx = createMockCtx();

      await setBudgetConversation(conversation, ctx, '2026-05');

      expect(mockApi.setBudgetAmount).toHaveBeenCalledWith('2026-05', 'cat-1', 65025);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('2026-05'),
        expect.objectContaining({ parse_mode: 'HTML' }),
      );
    });
  });

  describe('Optional Telegram startup', () => {
    it('sets telegram component to disabled and does not throw when TELEGRAM_BOT_TOKEN is unset', async () => {
      const originalToken = process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_BOT_TOKEN;
      resetConfigCache();

      try {
        expect(getConfig().TELEGRAM_BOT_TOKEN).toBeUndefined();
        await expect(startBot()).resolves.toBeUndefined();
        expect(getComponentStates().telegram).toBe('disabled');
      } finally {
        process.env.TELEGRAM_BOT_TOKEN = originalToken;
        resetConfigCache();
      }
    });
  });
});
