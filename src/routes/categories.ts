import { Router } from 'express';
import { getActualApi } from '../actual/client';
import { z } from 'zod';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const api = getActualApi();
    const categories = await api.getCategories();
    res.json(categories);
  } catch (e) {
    next(e);
  }
});

export default router;
