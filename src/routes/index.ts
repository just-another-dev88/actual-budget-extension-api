import { Router } from 'express';
import systemRoutes from './system';
import accountsRoutes from './accounts';
import transactionsRoutes from './transactions';
import budgetsRoutes from './budgets';
import categoriesRoutes from './categories';

import { authMiddleware } from '../middleware/auth';

const router = Router();

// Unauthenticated health checks
router.use('/', systemRoutes);

// Everything else requires auth
router.use(authMiddleware);

router.use('/accounts', accountsRoutes);
router.use('/transactions', transactionsRoutes);
router.use('/budgets', budgetsRoutes);
router.use('/categories', categoriesRoutes);

export default router;
