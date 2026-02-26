import { Router } from 'express';
import { getProducts, verifyTable, createOrder, getStoreStatusEndpoint, validatePin } from '../controllers/publicController';

const router = Router();

router.get('/products', getProducts);
router.get('/tables/:id/verify', verifyTable);
router.post('/tables/validate-pin', validatePin);
router.get('/store-status', getStoreStatusEndpoint);
router.post('/orders', createOrder);

export default router;
