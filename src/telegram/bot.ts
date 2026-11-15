import { Bot, session, type Transformer } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { hydrate } from '@grammyjs/hydrate';
import { getConfig } from '../config';
import { setComponentState } from '../lib/health';
import { logger } from '../lib/logger';
import { authGuard } from './middleware/auth';
import { BOT_COMMANDS, startCommand, helpCommand } from './handlers/start';
import { accountsCommand } from './handlers/accounts';
import { categoriesCommand } from './handlers/categories';
import {
  transactionsCommand,
  transactionsPaginationHandler,
  transactionsAccountHandler,
} from './handlers/transactions';
import { addTransactionConversation } from './handlers/add';
import {
  budgetCommand,
  budgetMonthHandler,
  setBudgetCallbackHandler,
  setBudgetConversation,
} from './handlers/budget';
import type { MyContext } from './types';

const CONVERSATION_TIMEOUT_MS = 300_000;
const log = logger.child({ module: 'telegram' });

let bot: Bot<MyContext> | null = null;

/** Retry once on Telegram 429 flood-control responses (capped at 30s). */
const rateLimitRetry: Transformer = async (prev, method, payload, signal) => {
  const res = await prev(method, payload, signal);
  if (!res.ok && res.error_code === 429 && res.parameters?.retry_after) {
    const delaySeconds = Math.min(res.parameters.retry_after, 30);
    log.warn({ method, retryAfter: res.parameters.retry_after }, 'Telegram rate limited; retrying');
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    return prev(method, payload, signal);
  }
  return res;
};

export function createBot(token?: string): Bot<MyContext> {
  const botToken = token ?? getConfig().TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required to create the Telegram bot');
  }

  const instance = new Bot<MyContext>(botToken);
  instance.api.config.use(rateLimitRetry);

  // --- Middleware stack ---
  instance.use(hydrate());
  instance.use(authGuard);
  instance.use(
    session({
      initial: () => ({}),
    }),
  );
  instance.use(conversations());

  // --- Global cancel handlers (registered before conversations so they always escape active flows) ---
  instance.command('cancel', async (ctx) => {
    await ctx.conversation.exitAll();
    await ctx.reply('🛑 Operation cancelled.');
  });

  instance.callbackQuery('cancel_flow', async (ctx) => {
    await ctx.conversation.exitAll();
    await ctx.answerCallbackQuery();
    if (ctx.callbackQuery.message) {
      await ctx.editMessageText('🛑 Operation cancelled.');
    } else {
      await ctx.reply('🛑 Operation cancelled.');
    }
  });

  // --- Register conversations ---
  instance.use(
    createConversation(addTransactionConversation, {
      maxMillisecondsToWait: CONVERSATION_TIMEOUT_MS,
    }),
  );
  instance.use(
    createConversation(setBudgetConversation, {
      maxMillisecondsToWait: CONVERSATION_TIMEOUT_MS,
    }),
  );

  // --- Commands ---
  instance.command('start', startCommand);
  instance.command('help', helpCommand);
  instance.command('accounts', accountsCommand);
  instance.command('categories', categoriesCommand);
  instance.command('transactions', transactionsCommand);
  instance.command('add', async (ctx) => {
    await ctx.conversation.enter('addTransactionConversation');
  });
  instance.command('budget', budgetCommand);
  instance.command('setbudget', async (ctx) => {
    await ctx.conversation.enter('setBudgetConversation');
  });

  // --- Callback query handlers ---
  instance.callbackQuery(/^txn_account:/, transactionsAccountHandler);
  instance.callbackQuery(/^txn_page:/, transactionsPaginationHandler);
  instance.callbackQuery(/^budget_month:/, budgetMonthHandler);
  instance.callbackQuery(/^set_budget:/, setBudgetCallbackHandler);
  instance.callbackQuery('noop', async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // --- Error handler ---
  instance.catch(async (err) => {
    log.error({ err: err.error, updateId: err.ctx.update.update_id }, 'Telegram bot error');
    try {
      await err.ctx.reply('❌ Something went wrong. Please try again.');
    } catch {
      // Ignore secondary send errors (e.g. blocked bot or non-replyable update)
    }
  });

  return instance;
}

export async function startBot(): Promise<void> {
  const cfg = getConfig();
  if (!cfg.TELEGRAM_BOT_TOKEN) {
    setComponentState('telegram', 'disabled');
    log.info('Telegram bot disabled (TELEGRAM_BOT_TOKEN not set)');
    return;
  }

  setComponentState('telegram', 'starting');

  try {
    const instance = createBot(cfg.TELEGRAM_BOT_TOKEN);
    bot = instance;

    await instance.api.setMyCommands(
      BOT_COMMANDS.map((c) => ({ command: c.command, description: c.description })),
    );

    // Start long-polling in the background; polling failures never crash the HTTP server
    void instance
      .start({
        onStart: () => {
          setComponentState('telegram', 'running');
          log.info('Telegram bot is running');
        },
      })
      .catch((err: unknown) => {
        setComponentState('telegram', 'error');
        log.error({ err }, 'Telegram bot polling stopped unexpectedly');
      });
  } catch (err) {
    setComponentState('telegram', 'error');
    log.error({ err }, 'Failed to start Telegram bot; continuing without bot');
    bot = null;
  }
}

export async function stopBot(): Promise<void> {
  if (!bot) return;
  const current = bot;
  bot = null;
  try {
    await current.stop();
    setComponentState('telegram', 'stopped');
  } catch (err) {
    log.warn({ err }, 'Error stopping Telegram bot');
  }
}
