import { Router } from 'express';
import { getProducts, verifyTable, createOrder, getStoreStatusEndpoint } from '../controllers/publicController';

const router = Router();

router.get('/products', getProducts);
router.get('/tables/:id/verify', verifyTable);
router.get('/store-status', getStoreStatusEndpoint);
router.post('/orders', createOrder);

export default router;
