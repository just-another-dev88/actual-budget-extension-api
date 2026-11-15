import { withActual } from '../actual/client';
import type { ActualCategory, ActualPayee, ActualTransaction } from './types';

export interface TransactionView {
  id: string;
  date: string;
  /** Signed cents. */
  amount: number;
  payeeName: string;
  categoryName: string | null;
  notes: string | null;
  isTransfer: boolean;
}

export interface RecentTransactionsQuery {
  accountId: string;
  startDate: string;
  endDate: string;
  offset: number;
  limit: number;
}

export function listRecentTransactions(
  q: RecentTransactionsQuery,
): Promise<{ items: TransactionView[]; total: number }> {
  return withActual(async (actual) => {
    const [txns, payees, categories] = await Promise.all([
      actual.getTransactions(q.accountId, q.startDate, q.endDate) as Promise<ActualTransaction[]>,
      actual.getPayees() as Promise<ActualPayee[]>,
      actual.getCategories() as Promise<ActualCategory[]>,
    ]);

    const payeeNames = new Map((payees ?? []).map((p) => [p.id, p.name]));
    const categoryNames = new Map((categories ?? []).map((c) => [c.id, c.name]));

    const sorted = [...(txns ?? [])].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
    const items = sorted.slice(q.offset, q.offset + q.limit).map((t) => ({
      id: t.id,
      date: t.date,
      amount: t.amount,
      payeeName: (t.payee && payeeNames.get(t.payee)) || t.imported_payee || 'Unknown payee',
      categoryName: (t.category && categoryNames.get(t.category)) || null,
      notes: t.notes || null,
      isTransfer: Boolean(t.transfer_id),
    }));

    return { items, total: sorted.length };
  });
}

export interface NewTransaction {
  accountId: string;
  date: string;
  /** Signed cents (negative = expense). */
  amount: number;
  payeeName?: string;
  payeeId?: string;
  categoryId?: string | null;
  notes?: string;
  cleared?: boolean;
}

export type WriteMode = 'add' | 'import';

/**
 * Persist transactions.
 * - `add` (default): writes exactly what was given. Use for manual entry.
 * - `import`: bank-import semantics (rules + fuzzy de-duplication). Identical
 *   entries on the same day may be merged, so never use it for manual entry.
 */
export async function createTransactions(
  txns: NewTransaction[],
  mode: WriteMode = 'add',
): Promise<unknown> {
  if (txns.length === 0) return null;
  const accountIds = new Set(txns.map((t) => t.accountId));
  if (accountIds.size !== 1) throw new Error('All transactions must belong to the same account');
  const [accountId] = accountIds;

  const payload = txns.map((t) => ({
    date: t.date,
    amount: t.amount,
    ...(t.payeeId ? { payee: t.payeeId } : {}),
    ...(t.payeeName && !t.payeeId ? { payee_name: t.payeeName } : {}),
    ...(t.categoryId ? { category: t.categoryId } : {}),
    ...(t.notes ? { notes: t.notes } : {}),
    cleared: t.cleared ?? false,
  }));

  return withActual(
    async (actual) => {
      if (mode === 'import') {
        return actual.importTransactions(
          accountId,
          payload.map((p) => ({ ...p, account: accountId })),
        );
      }
      return actual.addTransactions(accountId, payload, {
        learnCategories: true,
        runTransfers: true,
      });
    },
    { write: true },
  );
}
