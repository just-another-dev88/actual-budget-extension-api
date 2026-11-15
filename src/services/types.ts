/** Minimal shapes of the Actual entities this app relies on. */

export interface ActualAccount {
  id: string;
  name: string;
  offbudget?: boolean | number;
  closed?: boolean | number;
}

export interface ActualCategory {
  id: string;
  name: string;
  group_id?: string;
  is_income?: boolean | number;
  hidden?: boolean | number;
}

export interface ActualCategoryGroup {
  id: string;
  name: string;
  is_income?: boolean | number;
  hidden?: boolean | number;
  categories?: ActualCategory[];
}

export interface ActualPayee {
  id: string;
  name: string;
  transfer_acct?: string | null;
}

export interface ActualTransaction {
  id: string;
  account: string;
  date: string;
  amount: number;
  payee?: string | null;
  category?: string | null;
  notes?: string | null;
  imported_payee?: string | null;
  transfer_id?: string | null;
}

export interface ActualBudgetCategory extends ActualCategory {
  budgeted: number;
  spent: number;
  balance: number;
}

export interface ActualBudgetGroup extends ActualCategoryGroup {
  budgeted?: number;
  spent?: number;
  balance?: number;
  categories?: ActualBudgetCategory[];
}

export interface ActualBudgetMonth {
  month: string;
  toBudget?: number;
  totalBudgeted?: number;
  totalSpent?: number;
  totalBalance?: number;
  totalIncome?: number;
  categoryGroups?: ActualBudgetGroup[];
}
