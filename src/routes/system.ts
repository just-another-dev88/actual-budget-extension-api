import { Router } from 'express';
import { getActualStatus, reloadActual } from '../actual/client';
import { getComponentStates } from '../lib/health';

/** Public, unauthenticated routes. Keep this to liveness/readiness only. */
export const publicSystemRoutes = Router();

publicSystemRoutes.get('/health', (req, res) => {
  const actual = getActualStatus();
  res.status(actual.ready ? 200 : 503).json({
    status: actual.ready ? 'ok' : 'unavailable',
    ready: actual.ready,
    lastSyncAt: actual.lastSyncAt,
    components: getComponentStates(),
  });
});

/** Admin routes. Must be mounted behind authentication. */
export const adminSystemRoutes = Router();

adminSystemRoutes.post('/reload', async (req, res, next) => {
  try {
    await reloadActual();
    res.json({ status: 'ok', reloaded: true });
  } catch (e) {
    next(e);
  }
});
