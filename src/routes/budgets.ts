import { Router } from 'express';
import { z } from 'zod';
import { getBudgetMonthRaw, setCategoryBudget } from '../services/budgets';
import { decimalToCents } from '../lib/money';
import { isValidMonth } from '../lib/dates';

const router = Router();

const monthParam = z.string().refine(isValidMonth, 'Expected month in YYYY-MM format');

router.get('/:month', async (req, res, next) => {
  try {
    const month = monthParam.parse(req.params.month);
    res.json(await getBudgetMonthRaw(month));
  } catch (e) {
    next(e);
  }
});

const patchBudgetSchema = z.object({
  amount: z.number().finite().min(0),
});

router.patch('/:month/categories/:categoryId', async (req, res, next) => {
  try {
    const month = monthParam.parse(req.params.month);
    const { amount } = patchBudgetSchema.parse(req.body);
    await setCategoryBudget(month, req.params.categoryId, decimalToCents(amount));
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
