import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
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
