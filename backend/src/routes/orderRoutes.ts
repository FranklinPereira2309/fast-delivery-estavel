import { Router } from 'express';
import * as orderController from '../controllers/orderController';
const router = Router();
router.get('/', orderController.getAllOrders);
router.post('/', orderController.saveOrder);
router.delete('/:id', orderController.deleteOrder);
router.patch('/:id/status', orderController.updateOrderStatus);
router.patch('/:id/payment', orderController.updateOrderPaymentMethod);
export default router;
