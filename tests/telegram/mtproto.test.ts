import { beforeEach, describe, expect, it, vi } from 'vitest';
import bigInt from 'big-integer';
import { Api } from 'telegram';

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

import { loadConfig } from '../../src/config';
import { createBot } from '../../src/telegram/bot';
import {
  buildCallbackUpdate,
  buildMessageUpdate,
  createMtprotoTransformer,
  toBotUser,
  toGramJsMarkup,
  type MtprotoClientLike,
} from '../../src/telegram/mtproto';

const baseEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  ACTUAL_SERVER_URL: 'http://localhost:5006',
  ACTUAL_PASSWORD: 'test_password',
  ACTUAL_BUDGET_ID: 'test-budget-id',
  ACTUAL_DATA_DIR: './data',
  API_KEY: 'test_api_key_1234567890',
  TELEGRAM_BOT_TOKEN: '123456:TEST_TOKEN',
  TELEGRAM_ALLOWED_USERS: '111,222',
};

describe('MTProto config validation', () => {
  it('accepts config when MTProto vars are omitted', () => {
    const cfg = loadConfig({ ...baseEnv });
    expect(cfg.TELEGRAM_API_ID).toBeUndefined();
    expect(cfg.TELEGRAM_API_HASH).toBeUndefined();
  });

  it('rejects TELEGRAM_API_ID without TELEGRAM_API_HASH', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        TELEGRAM_API_ID: '1234567',
      }),
    ).toThrow(/TELEGRAM_API_ID and TELEGRAM_API_HASH/);
  });

  it('rejects TELEGRAM_API_HASH without TELEGRAM_API_ID', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        TELEGRAM_API_HASH: '0123456789abcdef0123456789abcdef',
      }),
    ).toThrow(/TELEGRAM_API_ID and TELEGRAM_API_HASH/);
  });

  it('rejects MTProto credentials without TELEGRAM_BOT_TOKEN', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        TELEGRAM_BOT_TOKEN: undefined,
        TELEGRAM_ALLOWED_USERS: undefined,
        TELEGRAM_API_ID: '1234567',
        TELEGRAM_API_HASH: '0123456789abcdef0123456789abcdef',
      }),
    ).toThrow(/TELEGRAM_BOT_TOKEN is required/);
  });

  it('accepts valid MTProto configuration and coerces numeric TELEGRAM_API_ID', () => {
    const cfg = loadConfig({
      ...baseEnv,
      TELEGRAM_API_ID: '1234567',
      TELEGRAM_API_HASH: '0123456789abcdef0123456789abcdef',
    });
    expect(cfg.TELEGRAM_API_ID).toBe(1234567);
    expect(cfg.TELEGRAM_API_HASH).toBe('0123456789abcdef0123456789abcdef');
  });
});

describe('MTProto transformer & update bridge', () => {
  let mockClient: MtprotoClientLike & {
    invoke: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    editMessage: ReturnType<typeof vi.fn>;
    deleteMessages: ReturnType<typeof vi.fn>;
    getInputEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      invoke: vi.fn(async () => true),
      sendMessage: vi.fn(async (_peer, params: { message?: string }) => ({
        id: 101,
        date: 1_700_000_000,
        message: params.message ?? '',
      })),
      editMessage: vi.fn(async (_peer, params: { message: number; text?: string }) => ({
        id: params.message,
        date: 1_700_000_001,
        message: params.text ?? '',
      })),
      deleteMessages: vi.fn(async () => []),
      getInputEntity: vi.fn(
        async (peer) =>
          new Api.InputPeerUser({
            userId: bigInt(Number(peer)),
            accessHash: bigInt(0),
          }),
      ),
    };
  });

  function createBridgedBot() {
    const bot = createBot('123456:TEST_TOKEN');
    const botInfo = toBotUser(
      new Api.User({
        id: bigInt(999_000),
        bot: true,
        firstName: 'ActualBot',
        username: 'actual_test_bot',
      }),
    );
    bot.botInfo = botInfo;
    bot.api.config.use(createMtprotoTransformer(mockClient, () => botInfo));
    return bot;
  }

  it('converts grammY inline keyboards to Api.ReplyInlineMarkup', () => {
    const markup = toGramJsMarkup({
      inline_keyboard: [
        [
          { text: 'Checking', callback_data: 'txn_account:acct-1' },
          { text: 'Docs', url: 'https://example.com' },
        ],
      ],
    });
    expect(markup).toBeInstanceOf(Api.ReplyInlineMarkup);
    expect(markup?.rows).toHaveLength(1);
    expect(markup?.rows[0].buttons).toHaveLength(2);
    expect(markup?.rows[0].buttons[0]).toBeInstanceOf(Api.KeyboardButtonCallback);
    expect(markup?.rows[0].buttons[1]).toBeInstanceOf(Api.KeyboardButtonUrl);
  });

  it('routes /start and /accounts through MTProto without HTTP Bot API calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const bot = createBridgedBot();

    await bot.handleUpdate(
      buildMessageUpdate({
        updateId: 1,
        messageId: 10,
        date: 1_700_000_000,
        text: '/start',
        chatId: 111,
        from: { id: 111, firstName: 'Alice' },
      }),
    );

    expect(mockClient.sendMessage).toHaveBeenCalledTimes(1);
    const startCall = mockClient.sendMessage.mock.calls[0][1] as {
      message?: string;
      parseMode?: string;
    };
    expect(startCall.parseMode).toBe('html');
    expect(startCall.message).toContain('Welcome');

    mockApi.getAccounts.mockResolvedValueOnce([
      { id: 'acct-1', name: 'Checking', offbudget: false, closed: false },
    ]);
    mockApi.getAccountBalance.mockResolvedValueOnce(150_000);

    await bot.handleUpdate(
      buildMessageUpdate({
        updateId: 2,
        messageId: 11,
        date: 1_700_000_001,
        text: '/accounts',
        chatId: 111,
        from: { id: 111, firstName: 'Alice' },
      }),
    );

    expect(mockClient.sendMessage).toHaveBeenCalledTimes(2);
    const accountsCall = mockClient.sendMessage.mock.calls[1][1] as {
      message?: string;
      parseMode?: string;
    };
    expect(accountsCall.parseMode).toBe('html');
    expect(accountsCall.message).toContain('Checking');
    expect(accountsCall.message).toContain('$1,500.00');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('routes inline keyboards and callback queries through MTProto RPCs', async () => {
    const bot = createBridgedBot();

    mockApi.getAccounts.mockResolvedValueOnce([
      { id: 'acct-1', name: 'Checking', offbudget: false, closed: false },
    ]);

    await bot.handleUpdate(
      buildMessageUpdate({
        updateId: 3,
        messageId: 12,
        date: 1_700_000_002,
        text: '/transactions',
        chatId: 111,
        from: { id: 111, firstName: 'Alice' },
      }),
    );

    expect(mockClient.sendMessage).toHaveBeenCalledTimes(1);
    const txnPrompt = mockClient.sendMessage.mock.calls[0][1] as { buttons?: unknown };
    expect(txnPrompt.buttons).toBeInstanceOf(Api.ReplyInlineMarkup);

    mockApi.getTransactions.mockResolvedValueOnce([
      {
        id: 'tx-1',
        account: 'acct-1',
        date: '2026-11-10',
        amount: -2550,
        payee: 'payee-1',
        category: 'cat-1',
        notes: 'Morning latte',
      },
    ]);
    mockApi.getPayees.mockResolvedValueOnce([{ id: 'payee-1', name: 'Blue Bottle Coffee' }]);
    mockApi.getCategories.mockResolvedValueOnce([{ id: 'cat-1', name: 'Coffee' }]);

    await bot.handleUpdate(
      buildCallbackUpdate({
        updateId: 4,
        queryId: '9876543210',
        messageId: 101,
        data: 'txn_account:acct-1',
        chatId: 111,
        from: { id: 111, firstName: 'Alice' },
      }),
    );

    expect(mockClient.invoke).toHaveBeenCalledTimes(1);
    const rpcReq = mockClient.invoke.mock.calls[0][0];
    expect(rpcReq).toBeInstanceOf(Api.messages.SetBotCallbackAnswer);
    expect((rpcReq as Api.messages.SetBotCallbackAnswer).queryId.toString()).toBe('9876543210');

    expect(mockClient.editMessage).toHaveBeenCalledTimes(1);
    const editArgs = mockClient.editMessage.mock.calls[0][1] as { message: number; text?: string };
    expect(editArgs.message).toBe(101);
    expect(editArgs.text).toContain('Blue Bottle Coffee');
    expect(editArgs.text).toContain('-$25.50');
  });

  it('supports setMyCommands and deleteMessage and enforces authGuard', async () => {
    const bot = createBridgedBot();

    await bot.api.setMyCommands([{ command: 'start', description: 'Welcome' }]);
    expect(mockClient.invoke).toHaveBeenCalledTimes(1);
    expect(mockClient.invoke.mock.calls[0][0]).toBeInstanceOf(Api.bots.SetBotCommands);

    await bot.api.deleteMessage(111, 55);
    expect(mockClient.deleteMessages).toHaveBeenCalledWith(expect.anything(), [55], {
      revoke: true,
    });

    await bot.handleUpdate(
      buildMessageUpdate({
        updateId: 5,
        messageId: 13,
        date: 1_700_000_005,
        text: '/start',
        chatId: 999_999,
        from: { id: 999_999, firstName: 'Stranger' },
      }),
    );
    expect(mockClient.sendMessage).not.toHaveBeenCalled();
  });
});
