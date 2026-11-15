import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';

const { mockGetActualStatus, mockReloadActual } = vi.hoisted(() => ({
  mockGetActualStatus: vi.fn(() => ({ ready: true, lastSyncAt: '2026-11-15T02:00:00.000Z' })),
  mockReloadActual: vi.fn(async () => undefined),
}));

vi.mock('../src/actual/client', () => ({
  getActualStatus: mockGetActualStatus,
  reloadActual: mockReloadActual,
  withActual: vi.fn(),
}));

describe('System routes', () => {
  const apiKey = process.env.API_KEY || 'test_api_key_1234567890';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActualStatus.mockReturnValue({ ready: true, lastSyncAt: '2026-11-15T02:00:00.000Z' });
  });

  it('GET /health should return ok when Actual is ready', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', ready: true });
  });

  it('GET /health should return 503 when Actual is not ready', async () => {
    mockGetActualStatus.mockReturnValueOnce({ ready: false, lastSyncAt: null });
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'unavailable', ready: false });
  });

  it('POST /reload should reject unauthenticated requests', async () => {
    const res = await request(app).post('/reload');
    expect(res.status).toBe(401);
    expect(mockReloadActual).not.toHaveBeenCalled();
  });

  it('POST /reload should reload when authenticated', async () => {
    const res = await request(app).post('/reload').set('X-API-Key', apiKey);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', reloaded: true });
    expect(mockReloadActual).toHaveBeenCalledTimes(1);
  });
});
