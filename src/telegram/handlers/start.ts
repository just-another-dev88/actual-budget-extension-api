import { MyContext } from '../types';

export interface BotCommandMeta {
  command: string;
  description: string;
}

export const BOT_COMMANDS: readonly BotCommandMeta[] = [
  { command: 'start', description: 'Welcome message' },
  { command: 'help', description: 'List all commands' },
  { command: 'accounts', description: 'View accounts and balances' },
  { command: 'categories', description: 'View budget categories' },
  { command: 'transactions', description: 'Browse recent transactions' },
  { command: 'add', description: 'Add a new transaction' },
  { command: 'budget', description: 'View monthly budget' },
  { command: 'setbudget', description: 'Set a category budget' },
  { command: 'cancel', description: 'Cancel the current action' },
];

function formatCommandList(boldCommands = false): string {
  return BOT_COMMANDS.map(({ command, description }) =>
    boldCommands ? `<b>/${command}</b> - ${description}` : `/${command} - ${description}`,
  ).join('\n');
}

export const startCommand = async (ctx: MyContext): Promise<void> => {
  const message =
    '<b>🤖 Welcome to Actual Budget Bot!</b>\n\n' +
    'I can help you manage your finances directly from Telegram.\n' +
    'Here are the available commands:\n\n' +
    formatCommandList(false);

  await ctx.reply(message, { parse_mode: 'HTML' });
};

export const helpCommand = async (ctx: MyContext): Promise<void> => {
  const message = '<b>📖 Help &amp; Commands</b>\n\n' + formatCommandList(true);
  await ctx.reply(message, { parse_mode: 'HTML' });
};
