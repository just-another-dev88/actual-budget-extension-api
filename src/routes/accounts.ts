import { Router } from 'express';
import { withActual } from '../actual/client';
import type { ActualAccount } from '../services/types';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(await withActual((actual) => actual.getAccounts()));
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const accounts = (await withActual((actual) => actual.getAccounts())) as ActualAccount[];
    const account = accounts.find((a) => a.id === req.params.id);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    res.json(account);
  } catch (e) {
    next(e);
  }
});

export default router;
