import { Router } from 'express';
import { getActualApi } from '../actual/client';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const api = getActualApi();
    const accounts = await api.getAccounts();
    res.json(accounts);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const api = getActualApi();
    const accounts = await api.getAccounts();
    const account = accounts.find((a: any) => a.id === req.params.id);
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
