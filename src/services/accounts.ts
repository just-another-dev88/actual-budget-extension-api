import { withActual } from '../actual/client';
import type { ActualAccount } from './types';

export interface AccountView {
  id: string;
  name: string;
  offBudget: boolean;
  closed: boolean;
  /** Balance in cents, present when requested. */
  balance?: number;
}

export interface ListAccountsOptions {
  includeClosed?: boolean;
  withBalances?: boolean;
}

export function listAccounts(opts: ListAccountsOptions = {}): Promise<AccountView[]> {
  const { includeClosed = false, withBalances = false } = opts;
  return withActual(async (actual) => {
    const raw = ((await actual.getAccounts()) ?? []) as ActualAccount[];
    const accounts = raw
      .map((a) => ({
        id: a.id,
        name: a.name,
        offBudget: Boolean(a.offbudget),
        closed: Boolean(a.closed),
      }))
      .filter((a) => includeClosed || !a.closed);

    if (!withBalances) return accounts;

    const result: AccountView[] = [];
    for (const account of accounts) {
      const balance = Number(await actual.getAccountBalance(account.id)) || 0;
      result.push({ ...account, balance });
    }
    return result;
  });
}

export async function getAccount(id: string): Promise<AccountView | undefined> {
  const accounts = await listAccounts({ includeClosed: true });
  return accounts.find((a) => a.id === id);
}
