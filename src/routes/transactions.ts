import { Router } from 'express';
import { z } from 'zod';
import { withActual } from '../actual/client';
import { createTransactions } from '../services/transactions';
import { decimalToCents } from '../lib/money';
import { isValidISODate } from '../lib/dates';

const router = Router();

const isoDate = z.string().refine(isValidISODate, 'Expected a valid date in YYYY-MM-DD format');

const listQuerySchema = z
  .object({
    accountId: z.string().min(1).optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((q) => Boolean(q.startDate) === Boolean(q.endDate), {
    message: 'startDate and endDate must be provided together',
  });

const createSchema = z.object({
  accountId: z.string().min(1),
  /**
   * `add` (default) writes transactions as given.
   * `import` applies bank-import reconciliation and may merge near-duplicates.
   */
  mode: z.enum(['add', 'import']).default('add'),
  transactions: z
    .array(
      z.object({
        date: isoDate,
        amount: z.number().finite(), // decimal, e.g. -12.34
        payee: z.string().optional(),
        payee_name: z.string().max(200).optional(),
        category: z.string().optional(),
        notes: z.string().max(1000).optional(),
        cleared: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(500),
});

const patchSchema = z
  .object({
    date: isoDate.optional(),
    amount: z.number().finite().optional(),
    payee: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    cleared: z.boolean().optional(),
  })
  .strict();

router.get('/', async (req, res, next) => {
  try {
    const { accountId, startDate, endDate, limit, offset } = listQuerySchema.parse(req.query);

    const transactions = await withActual(async (actual) => {
      if (accountId) {
        return (await actual.getTransactions(
          accountId,
          startDate ?? '1970-01-01',
          endDate ?? '2999-12-31',
        )) as unknown[];
      }
      let query = actual.q('transactions').select(['*']);
      if (startDate && endDate) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = query.filter({ date: { $gte: startDate, $lte: endDate } } as any);
      }
      const { data } = (await actual.aqlQuery(query)) as { data: unknown[] };
      return data;
    });

    res.json({
      data: transactions.slice(offset, offset + limit),
      meta: { total: transactions.length, limit, offset },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { accountId, mode, transactions } = createSchema.parse(req.body);
    const result = await createTransactions(
      transactions.map((t) => ({
        accountId,
        date: t.date,
        amount: decimalToCents(t.amount),
        payeeId: t.payee,
        payeeName: t.payee_name,
        categoryId: t.category,
        notes: t.notes,
        cleared: t.cleared,
      })),
      mode,
    );
    res.json({ mode, result });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const update = patchSchema.parse(req.body);
    const fields = {
      ...update,
      ...(update.amount !== undefined && { amount: decimalToCents(update.amount) }),
    };
    await withActual((actual) => actual.updateTransaction(id, fields), { write: true });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await withActual((actual) => actual.deleteTransaction(id), { write: true });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
