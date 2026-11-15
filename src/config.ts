import { z } from 'zod';
import { isValidTimeZone, systemTimeZone } from './lib/dates';

/**
 * Environment configuration.
 *
 * Parsing is lazy (`getConfig()`) so modules can be imported without a fully
 * populated environment, and tests can provide their own env. `.env` loading
 * happens only in the process entrypoint (`src/index.ts`).
 */

const userIdList = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (!raw || raw.trim() === '') return [] as number[];
    const ids: number[] = [];
    for (const part of raw.split(',')) {
      const trimmed = part.trim();
      if (!/^\d+$/.test(trimmed)) {
        ctx.addIssue({
          code: 'custom',
          message: `Invalid Telegram user ID "${trimmed}" (digits only)`,
        });
        return z.NEVER;
      }
      ids.push(Number(trimmed));
    }
    return ids;
  });

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    ACTUAL_SERVER_URL: z.url(),
    ACTUAL_PASSWORD: z.string().min(1),
    ACTUAL_BUDGET_ID: z.string().min(1),
    ACTUAL_DATA_DIR: z.string().default('./data'),
    ACTUAL_E2E_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),
    /** Minimum interval between on-demand syncs before reads. */
    ACTUAL_SYNC_THROTTLE_MS: z.coerce.number().int().nonnegative().default(30_000),
    /** Background sync interval. 0 disables it. */
    ACTUAL_SYNC_INTERVAL_MS: z.coerce.number().int().nonnegative().default(300_000),

    API_KEY: z.string().min(18, 'API_KEY must be at least 18 characters long'),

    APP_TIMEZONE: z.string().default(systemTimeZone()).refine(isValidTimeZone, {
      message: 'APP_TIMEZONE must be a valid IANA time zone, e.g. Asia/Manila',
    }),
    APP_LOCALE: z.string().default('en-US'),
    CURRENCY_CODE: z
      .string()
      .regex(/^[A-Z]{3}$/, 'CURRENCY_CODE must be an ISO 4217 code, e.g. USD')
      .default('USD'),

    /** Telegram is enabled when a token is configured. */
    TELEGRAM_BOT_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
    TELEGRAM_ALLOWED_USERS: userIdList,
    /** Optional MTProto developer credentials (from my.telegram.org). */
    TELEGRAM_API_ID: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
    TELEGRAM_API_HASH: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.TELEGRAM_BOT_TOKEN && cfg.TELEGRAM_ALLOWED_USERS.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['TELEGRAM_ALLOWED_USERS'],
        message:
          'TELEGRAM_ALLOWED_USERS must list at least one user ID when TELEGRAM_BOT_TOKEN is set',
      });
    }
    const hasApiId = cfg.TELEGRAM_API_ID !== undefined;
    const hasApiHash = cfg.TELEGRAM_API_HASH !== undefined;
    if (hasApiId !== hasApiHash) {
      ctx.addIssue({
        code: 'custom',
        path: [hasApiId ? 'TELEGRAM_API_HASH' : 'TELEGRAM_API_ID'],
        message: 'TELEGRAM_API_ID and TELEGRAM_API_HASH must both be set together',
      });
    }
    if ((hasApiId || hasApiHash) && !cfg.TELEGRAM_BOT_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['TELEGRAM_BOT_TOKEN'],
        message: 'TELEGRAM_BOT_TOKEN is required when MTProto credentials are set',
      });
    }
  });

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse(env);
}

let cached: Config | undefined;

export function getConfig(): Config {
  cached ??= loadConfig();
  return cached;
}

/** Test helper: drop the cached config so the next `getConfig()` re-reads env. */
export function resetConfigCache(): void {
  cached = undefined;
}
