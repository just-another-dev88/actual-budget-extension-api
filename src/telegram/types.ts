import { Context, SessionFlavor } from 'grammy';
import { ConversationFlavor, Conversation } from '@grammyjs/conversations';
import { HydrateFlavor } from '@grammyjs/hydrate';

// Session data interface (can be extended if needed)
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SessionData {}

export type MyContext = HydrateFlavor<Context> &
  SessionFlavor<SessionData> &
  ConversationFlavor<Context>;

export type MyConversation = Conversation<MyContext, MyContext>;
