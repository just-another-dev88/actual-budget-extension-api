import { Router } from 'express';
import { getActualApi } from '../actual/client';
import { z } from 'zod';

const router = Router();

router.get('/:month', async (req, res, next) => {
  try {
    const api = getActualApi();
    const month = req.params.month; // Expected YYYY-MM
    const budget = await api.getBudgetMonth(month);
    res.json(budget);
  } catch (e) {
    next(e);
  }
});

const patchBudgetSchema = z.object({
  amount: z.number(),
});

router.patch('/:month/categories/:categoryId', async (req, res, next) => {
  try {
    const { month, categoryId } = req.params;
    const { amount } = patchBudgetSchema.parse(req.body);
    const api = getActualApi();

    await api.setBudgetAmount(month, categoryId, api.utils.amountToInteger(amount));

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
