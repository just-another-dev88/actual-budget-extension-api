import { withActual } from '../actual/client';
import type { ActualBudgetMonth } from './types';

export interface BudgetCategoryLine {
  id: string;
  name: string;
  budgeted: number;
  spent: number;
  balance: number;
}

export interface BudgetGroupLine {
  id: string;
  name: string;
  budgeted: number;
  spent: number;
  balance: number;
  categories: BudgetCategoryLine[];
}

export interface BudgetMonthView {
  month: string;
  toBudget: number;
  totalBudgeted: number;
  totalSpent: number;
  totalBalance: number;
  /** Expense groups only, hidden groups/categories excluded. */
  groups: BudgetGroupLine[];
}

export function toBudgetMonthView(
  month: string,
  raw: ActualBudgetMonth | null | undefined,
): BudgetMonthView {
  const groups = (raw?.categoryGroups ?? [])
    .filter((g) => !g.is_income && !g.hidden)
    .map((g) => {
      const categories = (g.categories ?? [])
        .filter((c) => !c.hidden)
        .map((c) => ({
          id: c.id,
          name: c.name,
          budgeted: c.budgeted ?? 0,
          spent: c.spent ?? 0,
          balance: c.balance ?? 0,
        }));
      return {
        id: g.id,
        name: g.name,
        budgeted: g.budgeted ?? categories.reduce((s, c) => s + c.budgeted, 0),
        spent: g.spent ?? categories.reduce((s, c) => s + c.spent, 0),
        balance: g.balance ?? categories.reduce((s, c) => s + c.balance, 0),
        categories,
      };
    })
    .filter((g) => g.categories.length > 0);

  return {
    month,
    toBudget: raw?.toBudget ?? 0,
    totalBudgeted: raw?.totalBudgeted ?? 0,
    totalSpent: raw?.totalSpent ?? 0,
    totalBalance: raw?.totalBalance ?? 0,
    groups,
  };
}

export function getBudgetMonthRaw(month: string): Promise<ActualBudgetMonth> {
  return withActual(async (actual) => (await actual.getBudgetMonth(month)) as ActualBudgetMonth);
}

export async function getBudgetMonthView(month: string): Promise<BudgetMonthView> {
  return toBudgetMonthView(month, await getBudgetMonthRaw(month));
}

export function setCategoryBudget(month: string, categoryId: string, cents: number): Promise<void> {
  return withActual(
    async (actual) => {
      await actual.setBudgetAmount(month, categoryId, cents);
    },
    { write: true },
  );
}
