export interface ActualInitConfig {
  dataDir?: string;
  serverURL?: string;
  password?: string;
}

export interface ActualQuery {
  filter(expr: unknown): ActualQuery;
  unfilter(exprs?: unknown): ActualQuery;
  select(exprs?: unknown[]): ActualQuery;
  calculate(expr: unknown): ActualQuery;
  groupBy(exprs: unknown): ActualQuery;
  orderBy(exprs: unknown): ActualQuery;
  limit(num: number): ActualQuery;
  offset(num: number): ActualQuery;
  raw(): ActualQuery;
  withDead(): ActualQuery;
  withoutValidatedRefs(): ActualQuery;
  options(opts: Record<string, unknown>): ActualQuery;
  serialize(): unknown;
  reset(): ActualQuery;
  serializeAsString(): string;
}

export interface ActualTransactionInput {
  date: string;
  amount: number;
  payee?: string;
  payee_name?: string;
  imported_payee?: string;
  category?: string;
  notes?: string;
  cleared?: boolean;
  imported_id?: string;
  subtransactions?: ActualTransactionInput[];
}

export interface ActualImportTransactionInput extends ActualTransactionInput {
  account: string;
}

export declare function init(config?: ActualInitConfig): Promise<void>;
export declare function shutdown(): Promise<void>;
export declare function sync(): Promise<void>;
export declare function downloadBudget(syncId: string, opts?: { password?: string }): Promise<void>;

export declare function getAccounts(): Promise<unknown[]>;
export declare function getAccountBalance(id: string, cutoff?: Date): Promise<number>;
export declare function getCategories(): Promise<unknown[]>;
export declare function getCategoryGroups(): Promise<unknown[]>;
export declare function getPayees(): Promise<unknown[]>;
export declare function getTransactions(
  accountId: string,
  startDate: string,
  endDate: string,
): Promise<unknown[]>;

export declare function addTransactions(
  accountId: string,
  transactions: ActualTransactionInput[],
  opts?: { learnCategories?: boolean; runTransfers?: boolean },
): Promise<unknown>;

export declare function importTransactions(
  accountId: string,
  transactions: ActualImportTransactionInput[],
  opts?: { defaultCleared?: boolean },
): Promise<unknown>;

export declare function updateTransaction(
  id: string,
  fields: Record<string, unknown>,
): Promise<unknown>;
export declare function deleteTransaction(id: string): Promise<unknown>;

export declare function getBudgetMonth(month: string): Promise<unknown>;
export declare function setBudgetAmount(
  month: string,
  categoryId: string,
  value: number,
): Promise<unknown>;

export declare function q(table: string): ActualQuery;
export declare function aqlQuery(
  query: ActualQuery,
): Promise<{ data: unknown[]; dependencies?: string[] }>;

export declare const utils: {
  amountToInteger(n: number): number;
  integerToAmount(n: number): number;
};
