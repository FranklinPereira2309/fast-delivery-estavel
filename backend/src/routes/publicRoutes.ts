import { Router } from 'express';
import { getProducts, verifyTable, createOrder, getStoreStatusEndpoint, validatePin, submitFeedback, getTableConsumption, getFeedbacks, acknowledgeRejection } from '../controllers/publicController';
import { getAllCoupons } from '../controllers/promotionController';

const router = Router();

router.get('/products', getProducts);
router.get('/tables/:id/verify', verifyTable);
router.get('/tables/:id/consumption', getTableConsumption);
router.get('/feedback', getFeedbacks);
router.post('/tables/validate-pin', validatePin);
router.post('/feedback', submitFeedback);
router.get('/store-status', getStoreStatusEndpoint);
router.post('/orders', createOrder);
router.post('/tables/:id/acknowledge-rejection', acknowledgeRejection);
router.get('/promotions', getAllCoupons);

export default router;
