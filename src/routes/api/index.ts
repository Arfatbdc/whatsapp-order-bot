import { Router } from 'express';
import authRouter from './auth';
import productsRouter from './products';
import categoriesRouter from './categories';
import ordersRouter from './orders';
import customersRouter from './customers';
import promotionsRouter from './promotions';
import analyticsRouter from './analytics';
import storeRouter from './store';

const router = Router();

router.use('/auth', authRouter);
router.use('/products', productsRouter);
router.use('/categories', categoriesRouter);
router.use('/orders', ordersRouter);
router.use('/customers', customersRouter);
router.use('/promotions', promotionsRouter);
router.use('/analytics', analyticsRouter);
router.use('/store', storeRouter);

// Health check for API layer
router.get('/health', (_req, res) => res.json({ ok: true }));

export default router;
