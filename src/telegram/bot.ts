import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { hydrate } from '@grammyjs/hydrate';
import { config } from '../config';
import { authGuard } from './middleware/auth';
import { startCommand, helpCommand } from './handlers/start';
import { accountsCommand } from './handlers/accounts';
import { categoriesCommand } from './handlers/categories';
import { transactionsCommand, transactionsPaginationHandler, transactionsAccountHandler } from './handlers/transactions';
import { addTransactionConversation } from './handlers/add';
import { budgetCommand, budgetMonthHandler, setBudgetConversation } from './handlers/budget';
import type { MyContext } from './types';

let bot: Bot<MyContext> | null = null;

export function createBot(): Bot<MyContext> {
  const instance = new Bot<MyContext>(config.TELEGRAM_BOT_TOKEN);

  // --- Middleware stack ---
  instance.use(hydrate());
  instance.use(authGuard);
  instance.use(
    session({
      initial: () => ({}),
    }),
  );
  instance.use(conversations());

  // --- Register conversations ---
  instance.use(createConversation(addTransactionConversation));
  instance.use(createConversation(setBudgetConversation));

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
  instance.callbackQuery('noop', async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // --- Error handler ---
  instance.catch((err) => {
    console.error('Telegram bot error:', err);
  });

  return instance;
}

export async function startBot(): Promise<void> {
  bot = createBot();

  // Set bot commands menu for Telegram UI
  await bot.api.setMyCommands([
    { command: 'start', description: 'Welcome message' },
    { command: 'help', description: 'List all commands' },
    { command: 'accounts', description: 'View accounts' },
    { command: 'categories', description: 'View categories' },
    { command: 'transactions', description: 'Browse transactions' },
    { command: 'add', description: 'Add a new transaction' },
    { command: 'budget', description: 'View monthly budget' },
    { command: 'setbudget', description: 'Set a category budget' },
  ]);

  // Start long-polling (non-blocking)
  bot.start({
    onStart: () => {
      console.log('🤖 Telegram bot is running');
    },
  });
}

export async function stopBot(): Promise<void> {
  if (bot) {
    await bot.stop();
    bot = null;
  }
}
