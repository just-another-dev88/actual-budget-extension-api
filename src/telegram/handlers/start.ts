import { MyContext } from '../types';

export const startCommand = async (ctx: MyContext): Promise<void> => {
  const message = `
<b>🤖 Welcome to Actual Budget Bot!</b>

I can help you manage your finances directly from Telegram.
Here are the available commands:

/start - Show this welcome message
/help - Show detailed help
/accounts - List all your accounts
/categories - List all your categories
/transactions - View recent transactions
/add - Add a new transaction
/budget - View and manage your budget
`;
  await ctx.reply(message, { parse_mode: 'HTML' });
};

export const helpCommand = async (ctx: MyContext): Promise<void> => {
  const message = `
<b>📖 Help & Commands</b>

<b>/start</b> - Show the welcome message
<b>/help</b> - Show this detailed help message
<b>/accounts</b> - List all your accounts with their IDs
<b>/categories</b> - List all your budget categories grouped by category group
<b>/transactions</b> - View your recent transactions for a specific account. Supports pagination.
<b>/add</b> - Start an interactive flow to add a new transaction.
<b>/budget</b> - View your budget for the current month.
`;
  await ctx.reply(message, { parse_mode: 'HTML' });
};
