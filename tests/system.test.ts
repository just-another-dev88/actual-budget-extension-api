import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// Ensure Telegram env vars exist for config validation (dotenv loads .env automatically)
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test_bot_token';
process.env.TELEGRAM_ALLOWED_USERS = process.env.TELEGRAM_ALLOWED_USERS || '123456789';

import app from '../src/app';

vi.mock('../src/actual/client', () => ({
  getActualApi: vi.fn().mockImplementation(() => ({})),
  reloadActual: vi.fn(),
}));

describe('System routes', () => {
  it('GET /health should return ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', ready: true });
  });

  it('POST /reload should reload ok', async () => {
    const res = await request(app).post('/reload');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', reloaded: true });
  });
});
