import { Router } from 'express';
import { getProducts, verifyTable, createOrder } from '../controllers/publicController';

const router = Router();

router.get('/products', getProducts);
router.get('/tables/:id/verify', verifyTable);
router.post('/orders', createOrder);

export default router;
