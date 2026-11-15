import { Router } from 'express';
import { withActual } from '../actual/client';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(await withActual((actual) => actual.getCategories()));
  } catch (e) {
    next(e);
  }
});

export default router;
