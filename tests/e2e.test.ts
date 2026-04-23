import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';

// Set test environment variable required for authorization
process.env.API_KEY = 'test_api_key_123456'; // Ensure length > 16

const mockApi = {
  getAccounts: vi.fn(),
  getCategories: vi.fn(),
  getTransactions: vi.fn(),
  runQuery: vi.fn(),
  importTransactions: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  getBudgetMonth: vi.fn(),
  setBudgetAmount: vi.fn(),
  utils: {
    amountToInteger: vi.fn((amt) => Math.round(amt * 100)),
  },
  q: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
  }),
};

vi.mock('../src/actual/client', () => ({
  getActualApi: vi.fn(() => mockApi),
  reloadActual: vi.fn(),
}));

describe('E2E API Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should reject requests without X-API-Key', async () => {
      const res = await request(app).get('/accounts');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Missing X-API-Key/);
    });

    it('should reject invalid X-API-Key', async () => {
      const res = await request(app).get('/accounts').set('X-API-Key', 'wrong_key');
      expect(res.status).toBe(401);
    });
  });

  describe('Accounts API', () => {
    const authHeaders = { 'X-API-Key': process.env.API_KEY };

    it('GET /accounts should retrieve accounts', async () => {
      mockApi.getAccounts.mockResolvedValueOnce([{ id: 'acct-1', name: 'Checking' }]);
      const res = await request(app).get('/accounts').set(authHeaders);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Checking');
    });

    it('GET /accounts/:id should retrieve specific account', async () => {
      mockApi.getAccounts.mockResolvedValueOnce([
        { id: 'acct-1', name: 'Checking' },
        { id: 'acct-2', name: 'Savings' }
      ]);
      const res = await request(app).get('/accounts/acct-2').set(authHeaders);
      
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Savings');
    });

    it('GET /accounts/:id should return 404 if not found', async () => {
      mockApi.getAccounts.mockResolvedValueOnce([]);
      const res = await request(app).get('/accounts/unknown').set(authHeaders);
      expect(res.status).toBe(404);
    });
  });

  describe('Categories API', () => {
    const authHeaders = { 'X-API-Key': process.env.API_KEY };

    it('GET /categories should retrieve categories', async () => {
      mockApi.getCategories.mockResolvedValueOnce([{ id: 'cat-1', name: 'Food' }]);
      const res = await request(app).get('/categories').set(authHeaders);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('Transactions API', () => {
    const authHeaders = { 'X-API-Key': process.env.API_KEY };

    it('GET /transactions should fetch matching elements and paginate', async () => {
      mockApi.getTransactions.mockResolvedValueOnce([
        { id: 'test', date: '2023-01-01', amount: 1500 },
        { id: 'test2', date: '2023-01-02', amount: 2500 }
      ]);

      const res = await request(app).get('/transactions?accountId=acct-1&limit=1&offset=1').set(authHeaders);
      
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1); // offset 1, limit 1 limits 2 elem array
      expect(res.body.data[0].id).toBe('test2');
      expect(res.body.meta.total).toBe(2);
    });

    it('POST /transactions should require proper validation body', async () => {
      const res = await request(app)
        .post('/transactions')
        .set(authHeaders)
        .send({ accountId: 'acct-1' }); // missing transactions array

      expect(res.status).toBe(400); // 400 Bad Request
      expect(res.body.error).toBe('Validation Error');
    });

    it('POST /transactions should convert float to integer and save', async () => {
      mockApi.importTransactions.mockResolvedValueOnce({ added: ['t-1'] });

      const res = await request(app)
        .post('/transactions')
        .set(authHeaders)
        .send({
          accountId: 'acct-1',
          transactions: [{
            date: '2024-01-01',
            amount: 15.22,
            payee_name: 'Store'
          }]
        });

      expect(res.status).toBe(200);
      expect(mockApi.importTransactions).toHaveBeenCalledWith('acct-1', [{
        date: '2024-01-01',
        amount: 1522, // verified float to int conversion logic
        payee_name: 'Store',
        cleared: false
      }]);
    });

    it('PATCH /transactions/:id should successfully patch', async () => {
      mockApi.updateTransaction.mockResolvedValueOnce({});
      const res = await request(app).patch('/transactions/tx-1').set(authHeaders).send({ notes: 'hello' });
      expect(res.status).toBe(200);
      expect(mockApi.updateTransaction).toHaveBeenCalledWith('tx-1', { notes: 'hello' });
    });

    it('DELETE /transactions/:id should successfully delete', async () => {
      mockApi.deleteTransaction.mockResolvedValueOnce({});
      const res = await request(app).delete('/transactions/tx-1').set(authHeaders);
      expect(res.status).toBe(200);
      expect(mockApi.deleteTransaction).toHaveBeenCalledWith('tx-1');
    });
  });

  describe('Budgets API', () => {
    const authHeaders = { 'X-API-Key': process.env.API_KEY };

    it('GET /budgets/:month should return budget config', async () => {
      mockApi.getBudgetMonth.mockResolvedValueOnce({ month: '2024-02', categories: [] });
      const res = await request(app).get('/budgets/2024-02').set(authHeaders);
      
      expect(res.status).toBe(200);
      expect(res.body.month).toBe('2024-02');
    });

    it('PATCH /budgets/:month/categories/:id should convert amount and update', async () => {
      mockApi.setBudgetAmount.mockResolvedValueOnce(null);
      const res = await request(app).patch('/budgets/2024-02/categories/cat-1').set(authHeaders).send({ amount: 50.00 });
      
      expect(res.status).toBe(200);
      // Validates mock converts 50 -> 5000
      expect(mockApi.setBudgetAmount).toHaveBeenCalledWith('2024-02', 'cat-1', 5000);
    });
  });
});
