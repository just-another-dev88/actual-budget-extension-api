import { Router } from 'express';
import { getActualApi, reloadActual } from '../actual/client';

const router = Router();

router.get('/health', (req, res) => {
  try {
    // Just verify the api can be retrieved
    getActualApi();
    res.json({ status: 'ok', ready: true });
  } catch {
    res.status(503).json({ status: 'unavailable', ready: false });
  }
});

router.post('/reload', async (req, res, next) => {
  try {
    await reloadActual();
    res.json({ status: 'ok', reloaded: true });
  } catch (e) {
    next(e);
  }
});

export default router;
