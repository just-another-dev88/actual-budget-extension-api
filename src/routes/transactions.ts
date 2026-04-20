import { Router } from 'express';
import { getActualApi } from '../actual/client';
import { z } from 'zod';

const router = Router();

const transactionSchema = z.object({
  accountId: z.string(),
  transactions: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amount: z.number(), // Input is standard float format (e.g. 12.34), Actual works internally in cents.
      payee: z.string().optional(),
      payee_name: z.string().optional(),
      notes: z.string().optional(),
      cleared: z.boolean().default(false),
    }),
  ),
});

router.get('/', async (req, res, next) => {
  try {
    const accountId = req.query.accountId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // Pagination (defaults if not provided)
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;


    const api = getActualApi();

    // In @actual-app/api, transactions are typically retrieved via ActualQL or by getTransactions() if unpaginated.
    // getTransactions currently just returns an array but actual QL lets us paginate.
    // For simplicity of wrapper, if using `getTransactions(accountId, startDate, endDate)` we do pagination in-memory, or use q().

    let transactions: any[] = [];
    if (accountId) {
      if (startDate && endDate) {
        transactions = await api.getTransactions(accountId, startDate as string, endDate as string);
      } else {
        // If not provided, either require it or provide default wide ranges. Actual requires it.
        transactions = await api.getTransactions(accountId, '1970-01-01', '2099-12-31');
      }
    } else {
      // Using ActualQL to query all transactions
      let query = api.q('transactions').select(['*']);
      if (startDate && endDate) {
        query = query.filter({ date: { $gte: startDate as string, $lte: endDate as string } } as any);
      }
      const { data } = await api.runQuery(query);
      transactions = data;
    }

    // Apply offset/limit locally since getTransactions returns everything
    const total = transactions.length;
    const paginated = transactions.slice(offset, offset + limit);

    res.json({
      data: paginated,
      meta: {
        total,
        limit,
        offset,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { accountId, transactions } = transactionSchema.parse(req.body);
    const api = getActualApi();

    // Actual expects integer amounts
    const formattedTransactions = transactions.map((t: any) => ({
      ...t,
      amount: api.utils.amountToInteger(t.amount),
    }));

    // importTransactions does reconciliation, addTransactions just dumps them
    // Let's use importTransactions as it's safer for normal day-to-day scripting unless explicitly requested
    const result = await api.importTransactions(accountId, formattedTransactions);

    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    // Requires accountId usually for Actual transactions API or actualQL update
    const { id } = req.params;
    const api = getActualApi();

    // If user passes amount, we need to convert it
    const updateData = { ...req.body };
    if (updateData.amount !== undefined) {
      updateData.amount = api.utils.amountToInteger(updateData.amount);
    }

    await api.updateTransaction(id, updateData);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const api = getActualApi();
    await api.deleteTransaction(id);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
