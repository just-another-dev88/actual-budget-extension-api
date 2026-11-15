import * as fs from 'node:fs/promises';
import path from 'node:path';
import bigInt from 'big-integer';
import { Api, TelegramClient } from 'telegram';
import type { EntityLike } from 'telegram/define';
import { NewMessage, type NewMessageEvent } from 'telegram/events';
import { CallbackQuery, type CallbackQueryEvent } from 'telegram/events/CallbackQuery';
import { LogLevel, Logger as GramJsLogger } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';
import { Button } from 'telegram/tl/custom/button';
import type { Bot, Transformer } from 'grammy';
import type {
  ApiResponse,
  Chat,
  InlineKeyboardButton,
  Message,
  MessageEntity,
  Update,
  User,
  UserFromGetMe,
} from '@grammyjs/types';
import { logger } from '../lib/logger';
import { BOT_COMMANDS } from './handlers/start';
import type { MyContext } from './types';

const log = logger.child({ module: 'telegram-mtproto' });
const SESSION_FILE_NAME = 'telegram-mtproto.session';

/** Minimal GramJS client surface required by the MTProto Bot API bridge. */
export interface MtprotoClientLike {
  invoke(request: Api.AnyRequest): Promise<unknown>;
  sendMessage(
    entity: EntityLike,
    params: {
      message?: string;
      parseMode?: string;
      buttons?: Api.TypeReplyMarkup;
      linkPreview?: boolean;
      replyTo?: number;
    },
  ): Promise<{ id: number; date?: number; message?: string }>;
  editMessage(
    entity: EntityLike,
    params: {
      message: number;
      text?: string;
      parseMode?: string;
      buttons?: Api.TypeReplyMarkup;
      linkPreview?: boolean;
    },
  ): Promise<{ id: number; date?: number; message?: string }>;
  deleteMessages(
    entity: EntityLike | undefined,
    messageIds: number[],
    options: { revoke?: boolean },
  ): Promise<unknown>;
  getInputEntity(peer: EntityLike): Promise<Api.TypeInputPeer>;
}

export interface StartMtprotoOptions {
  apiId: number;
  apiHash: string;
  botToken: string;
  dataDir: string;
}

export interface MtprotoBotHandle {
  stop: () => Promise<void>;
}

export interface UpdateUserInput {
  id: number;
  isBot?: boolean;
  firstName: string;
  lastName?: string;
  username?: string;
}

export interface MessageUpdateInput {
  updateId: number;
  messageId: number;
  date: number;
  text: string;
  chatId: number;
  chatType?: 'private' | 'group' | 'supergroup';
  chatTitle?: string;
  from: UpdateUserInput;
}

export interface CallbackUpdateInput {
  updateId: number;
  queryId: string;
  messageId: number;
  date?: number;
  data: string;
  chatId: number;
  chatType?: 'private' | 'group' | 'supergroup';
  chatTitle?: string;
  chatInstance?: string;
  messageText?: string;
  from: UpdateUserInput;
}

function buildUser(input: UpdateUserInput): User {
  return {
    id: input.id,
    is_bot: Boolean(input.isBot),
    first_name: input.firstName,
    ...(input.lastName ? { last_name: input.lastName } : {}),
    ...(input.username ? { username: input.username } : {}),
  };
}

type BotChat = Chat.PrivateChat | Chat.GroupChat | Chat.SupergroupChat;

function buildChat(
  chatId: number,
  chatType: 'private' | 'group' | 'supergroup',
  from: UpdateUserInput,
  title?: string,
): BotChat {
  if (chatType === 'private') {
    return {
      id: chatId,
      type: 'private',
      first_name: from.firstName,
      ...(from.lastName ? { last_name: from.lastName } : {}),
      ...(from.username ? { username: from.username } : {}),
    };
  }
  return {
    id: chatId,
    type: chatType,
    title: title ?? `Chat ${chatId}`,
  };
}

function inferChatType(chatId: number, isPrivate?: boolean): 'private' | 'group' | 'supergroup' {
  if (isPrivate ?? chatId > 0) return 'private';
  return chatId <= -1_000_000_000_000 ? 'supergroup' : 'group';
}

/** Build a Bot-API-compatible Message Update from MTProto message fields. */
export function buildMessageUpdate(input: MessageUpdateInput): Update {
  const chatType = input.chatType ?? inferChatType(input.chatId);
  const from = buildUser(input.from);
  const chat = buildChat(input.chatId, chatType, input.from, input.chatTitle);

  const entities: MessageEntity[] = [];
  const cmdMatch = /^\/[a-zA-Z0-9_]+(?:@[a-zA-Z0-9_]+)?/.exec(input.text);
  if (cmdMatch) {
    entities.push({
      type: 'bot_command',
      offset: 0,
      length: cmdMatch[0].length,
    });
  }

  return {
    update_id: input.updateId,
    message: {
      message_id: input.messageId,
      date: input.date,
      from,
      chat,
      text: input.text,
      ...(entities.length > 0 ? { entities } : {}),
    },
  };
}

/** Build a Bot-API-compatible CallbackQuery Update from MTProto callback fields. */
export function buildCallbackUpdate(input: CallbackUpdateInput): Update {
  const chatType = input.chatType ?? inferChatType(input.chatId);
  const from = buildUser(input.from);
  const chat = buildChat(input.chatId, chatType, input.from, input.chatTitle);

  return {
    update_id: input.updateId,
    callback_query: {
      id: input.queryId,
      from,
      chat_instance: input.chatInstance ?? String(input.chatId),
      data: input.data,
      message: {
        message_id: input.messageId,
        date: input.date ?? Math.floor(Date.now() / 1000),
        chat,
        text: input.messageText ?? '',
      },
    },
  };
}

/** Convert grammY inline keyboard markup into a GramJS MTProto ReplyInlineMarkup. */
export function toGramJsMarkup(replyMarkup: unknown): Api.ReplyInlineMarkup | undefined {
  if (!replyMarkup || typeof replyMarkup !== 'object' || !('inline_keyboard' in replyMarkup)) {
    return undefined;
  }
  const rawKeyboard = replyMarkup.inline_keyboard;
  if (!Array.isArray(rawKeyboard)) return undefined;

  const rows: Api.KeyboardButtonRow[] = [];
  for (const rawRow of rawKeyboard) {
    if (!Array.isArray(rawRow)) continue;
    const buttons: Api.TypeKeyboardButton[] = [];
    for (const rawBtn of rawRow) {
      if (!rawBtn || typeof rawBtn !== 'object') continue;
      const btn = rawBtn as Partial<
        InlineKeyboardButton.CallbackButton & InlineKeyboardButton.UrlButton
      >;
      if (typeof btn.text !== 'string') continue;
      if (typeof btn.callback_data === 'string') {
        buttons.push(Button.inline(btn.text, Buffer.from(btn.callback_data, 'utf-8')));
      } else if (typeof btn.url === 'string') {
        buttons.push(Button.url(btn.text, btn.url));
      }
    }
    if (buttons.length > 0) {
      rows.push(new Api.KeyboardButtonRow({ buttons }));
    }
  }

  return rows.length > 0 ? new Api.ReplyInlineMarkup({ rows }) : undefined;
}

/** Map a GramJS `Api.User` bot record to grammY's `UserFromGetMe`. */
export function toBotUser(me: Api.User): UserFromGetMe {
  return {
    id: Number(me.id),
    is_bot: true,
    first_name: me.firstName ?? 'Bot',
    ...(me.lastName ? { last_name: me.lastName } : {}),
    username: me.username ?? 'bot',
    can_join_groups: !me.botNochats,
    can_read_all_group_messages: Boolean(me.botChatHistory),
    supports_inline_queries: Boolean(me.botInlinePlaceholder),
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
    can_manage_bots: false,
    supports_join_request_queries: false,
  };
}

function normalizeParseMode(raw: unknown): string | undefined {
  // GramJS sanitizeParseMode only accepts lowercase names ('html', 'md', 'markdown', 'markdownv2').
  if (typeof raw !== 'string') return undefined;
  return raw.toLowerCase();
}

function isLinkPreviewDisabled(payload: Record<string, unknown>): boolean {
  if (payload.disable_web_page_preview === true) return true;
  const opts = payload.link_preview_options;
  return Boolean(
    opts &&
    typeof opts === 'object' &&
    'is_disabled' in opts &&
    (opts as { is_disabled?: boolean }).is_disabled,
  );
}

function toBotApiMessage(
  sent: { id: number; date?: number; message?: string },
  chatId: number,
  fallbackText: string,
  botInfo: UserFromGetMe,
): Message {
  const chat = buildChat(chatId, inferChatType(chatId), { id: chatId, firstName: 'User' });

  return {
    message_id: sent.id,
    date: sent.date ?? Math.floor(Date.now() / 1000),
    chat,
    from: botInfo,
    text: sent.message ?? fallbackText,
  };
}

async function resolvePeer(
  client: MtprotoClientLike,
  rawChatId: unknown,
  peerCache?: Map<number, EntityLike>,
): Promise<EntityLike> {
  if (typeof rawChatId !== 'number' && typeof rawChatId !== 'string') {
    throw new Error('Missing or invalid chat_id');
  }
  const numericId = Number(rawChatId);
  if (Number.isFinite(numericId)) {
    const cached = peerCache?.get(numericId);
    if (cached) return cached;
  }
  const target: EntityLike = Number.isFinite(numericId) ? numericId : rawChatId;
  try {
    return await client.getInputEntity(target);
  } catch {
    return target;
  }
}

async function dispatchMtprotoMethod(
  client: MtprotoClientLike,
  method: string,
  payload: Record<string, unknown>,
  getBotInfo: () => UserFromGetMe,
  peerCache?: Map<number, EntityLike>,
): Promise<ApiResponse<unknown>> {
  switch (method) {
    case 'getMe':
      return { ok: true, result: getBotInfo() };

    case 'setMyCommands': {
      const rawCommands = Array.isArray(payload.commands) ? payload.commands : [];
      const commands = rawCommands
        .filter((c): c is { command: string; description: string } =>
          Boolean(c && typeof c === 'object' && 'command' in c && 'description' in c),
        )
        .map(
          (c) =>
            new Api.BotCommand({
              command: String(c.command),
              description: String(c.description),
            }),
        );
      await client.invoke(
        new Api.bots.SetBotCommands({
          scope: new Api.BotCommandScopeDefault(),
          langCode: typeof payload.language_code === 'string' ? payload.language_code : '',
          commands,
        }),
      );
      return { ok: true, result: true };
    }

    case 'sendMessage': {
      const peer = await resolvePeer(client, payload.chat_id, peerCache);
      const text = typeof payload.text === 'string' ? payload.text : '';
      const replyParams =
        payload.reply_parameters && typeof payload.reply_parameters === 'object'
          ? (payload.reply_parameters as { message_id?: number })
          : undefined;
      const replyTo =
        typeof replyParams?.message_id === 'number'
          ? replyParams.message_id
          : typeof payload.reply_to_message_id === 'number'
            ? payload.reply_to_message_id
            : undefined;

      const sent = await client.sendMessage(peer, {
        message: text,
        parseMode: normalizeParseMode(payload.parse_mode),
        buttons: toGramJsMarkup(payload.reply_markup),
        linkPreview: !isLinkPreviewDisabled(payload),
        ...(replyTo !== undefined ? { replyTo } : {}),
      });
      return {
        ok: true,
        result: toBotApiMessage(sent, Number(payload.chat_id), text, getBotInfo()),
      };
    }

    case 'editMessageText': {
      const peer = await resolvePeer(client, payload.chat_id, peerCache);
      const messageId = Number(payload.message_id);
      if (!Number.isFinite(messageId)) {
        return { ok: false, error_code: 400, description: 'Bad Request: message_id is required' };
      }
      const text = typeof payload.text === 'string' ? payload.text : '';
      const edited = await client.editMessage(peer, {
        message: messageId,
        text,
        parseMode: normalizeParseMode(payload.parse_mode),
        buttons: toGramJsMarkup(payload.reply_markup),
        linkPreview: !isLinkPreviewDisabled(payload),
      });
      return {
        ok: true,
        result: toBotApiMessage(edited, Number(payload.chat_id), text, getBotInfo()),
      };
    }

    case 'answerCallbackQuery': {
      const queryId = String(payload.callback_query_id ?? '');
      await client.invoke(
        new Api.messages.SetBotCallbackAnswer({
          queryId: bigInt(queryId),
          message: typeof payload.text === 'string' ? payload.text : undefined,
          alert: Boolean(payload.show_alert),
          url: typeof payload.url === 'string' ? payload.url : undefined,
          cacheTime: typeof payload.cache_time === 'number' ? payload.cache_time : 0,
        }),
      );
      return { ok: true, result: true };
    }

    case 'deleteMessage': {
      const peer = await resolvePeer(client, payload.chat_id, peerCache);
      const messageId = Number(payload.message_id);
      await client.deleteMessages(peer, [messageId], { revoke: true });
      return { ok: true, result: true };
    }

    default:
      return {
        ok: false,
        error_code: 501,
        description: `Unsupported Bot API method in MTProto mode: ${method}`,
      };
  }
}

function extractRpcError(err: unknown): { code: number; description: string; retryAfter?: number } {
  if (err && typeof err === 'object') {
    const record = err as { code?: unknown; seconds?: unknown; message?: unknown };
    const description =
      typeof record.message === 'string' ? record.message : 'Unknown MTProto RPC error';
    const retryAfter = typeof record.seconds === 'number' ? record.seconds : undefined;
    const code =
      typeof record.code === 'number' ? record.code : retryAfter !== undefined ? 429 : 500;
    return { code, description, retryAfter };
  }
  return { code: 500, description: String(err) };
}

/**
 * Creates a grammY API Transformer that translates Bot API calls into GramJS
 * MTProto RPCs over TCP without contacting `https://api.telegram.org`.
 */
export function createMtprotoTransformer(
  client: MtprotoClientLike,
  getBotInfo: () => UserFromGetMe,
  peerCache?: Map<number, EntityLike>,
): Transformer {
  return async (_prev, method, payload) => {
    try {
      const rawPayload = (payload ?? {}) as unknown as Record<string, unknown>;
      const res = await dispatchMtprotoMethod(client, method, rawPayload, getBotInfo, peerCache);
      return res as Awaited<ReturnType<Transformer>>;
    } catch (err) {
      const { code, description, retryAfter } = extractRpcError(err);
      log.warn({ method, code, description }, 'MTProto RPC error');
      const errorResponse: ApiResponse<never> = {
        ok: false,
        error_code: code,
        description,
        ...(retryAfter !== undefined ? { parameters: { retry_after: retryAfter } } : {}),
      };
      return errorResponse as Awaited<ReturnType<Transformer>>;
    }
  };
}

function extractSenderUser(senderEntity: unknown, fallbackId: number): UpdateUserInput {
  if (senderEntity instanceof Api.User) {
    return {
      id: Number(senderEntity.id),
      isBot: Boolean(senderEntity.bot),
      firstName: senderEntity.firstName ?? 'User',
      lastName: senderEntity.lastName,
      username: senderEntity.username,
    };
  }
  return { id: fallbackId, firstName: 'User' };
}

async function readSavedSession(sessionPath: string): Promise<string> {
  try {
    return (await fs.readFile(sessionPath, 'utf-8')).trim();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      log.warn({ err, sessionPath }, 'Failed to read MTProto session file; starting fresh');
    }
    return '';
  }
}

async function connectWithSession(
  options: StartMtprotoOptions,
  savedSession: string,
): Promise<TelegramClient> {
  const client = new TelegramClient(
    new StringSession(savedSession),
    options.apiId,
    options.apiHash,
    {
      connectionRetries: 5,
      retryDelay: 2000,
      autoReconnect: true,
      baseLogger: new GramJsLogger(LogLevel.ERROR),
    },
  );
  await client.start({ botAuthToken: options.botToken });
  return client;
}

/**
 * Connects to Telegram directly over MTProto TCP as a bot using `api_id`,
 * `api_hash`, and `bot_token`, wires the grammY MTProto transformer, and
 * forwards incoming messages & callback queries to `bot.handleUpdate`.
 */
export async function startMtprotoBot(
  bot: Bot<MyContext>,
  options: StartMtprotoOptions,
): Promise<MtprotoBotHandle> {
  const sessionPath = path.join(options.dataDir, SESSION_FILE_NAME);
  const savedSession = await readSavedSession(sessionPath);

  let client: TelegramClient;
  try {
    client = await connectWithSession(options, savedSession);
  } catch (err) {
    if (!savedSession) throw err;
    log.warn({ err }, 'Cached MTProto session failed; re-authenticating with fresh session');
    client = await connectWithSession(options, '');
  }

  const sessionString = client.session.save() as unknown;
  if (typeof sessionString === 'string' && sessionString.length > 0) {
    await fs.mkdir(options.dataDir, { recursive: true });
    await fs.writeFile(sessionPath, sessionString, { encoding: 'utf-8', mode: 0o600 });
  }

  const me = await client.getMe();
  const botInfo = toBotUser(me);
  bot.botInfo = botInfo;

  const peerCache = new Map<number, EntityLike>();
  bot.api.config.use(createMtprotoTransformer(client, () => botInfo, peerCache));

  await bot.api.setMyCommands(
    BOT_COMMANDS.map((c) => ({ command: c.command, description: c.description })),
  );

  let nextUpdateId = 1;

  client.addEventHandler(
    (event: NewMessageEvent) => {
      void (async () => {
        try {
          const msg = event.message;
          const chatId = Number(event.chatId ?? msg.senderId ?? 0);
          if (!chatId) return;

          const inputChat = await event.getInputChat().catch(() => undefined);
          if (inputChat) peerCache.set(chatId, inputChat);

          const senderEntity = msg.sender ?? (await msg.getSender().catch(() => undefined));
          const from = extractSenderUser(senderEntity, Number(msg.senderId ?? chatId));

          const chatEntity = event.chat ?? (await event.getChat().catch(() => undefined));
          const chatTitle =
            chatEntity instanceof Api.Chat || chatEntity instanceof Api.Channel
              ? chatEntity.title
              : undefined;

          const update = buildMessageUpdate({
            updateId: nextUpdateId++,
            messageId: msg.id,
            date: msg.date ?? Math.floor(Date.now() / 1000),
            text: msg.message ?? '',
            chatId,
            chatType: inferChatType(chatId, event.isPrivate),
            chatTitle,
            from,
          });
          await bot.handleUpdate(update);
        } catch (err) {
          log.error({ err }, 'Error dispatching MTProto message update');
        }
      })();
    },
    new NewMessage({ incoming: true }),
  );

  client.addEventHandler((event: CallbackQueryEvent) => {
    void (async () => {
      try {
        const chatId = Number(event.chatId ?? event.senderId ?? 0);
        if (!chatId) return;

        const inputChat = await event.getInputChat().catch(() => undefined);
        if (inputChat) peerCache.set(chatId, inputChat);

        const from = extractSenderUser(event.sender, Number(event.senderId ?? chatId));
        const update = buildCallbackUpdate({
          updateId: nextUpdateId++,
          queryId: event.id.toString(),
          messageId: event.messageId,
          data: event.data ? event.data.toString('utf-8') : '',
          chatId,
          chatType: inferChatType(chatId, event.isPrivate),
          chatInstance: event.chatInstance.toString(),
          from,
        });
        await bot.handleUpdate(update);
      } catch (err) {
        log.error({ err }, 'Error dispatching MTProto callback query update');
      }
    })();
  }, new CallbackQuery({}));

  return {
    stop: async () => {
      await client.destroy();
    },
  };
}
