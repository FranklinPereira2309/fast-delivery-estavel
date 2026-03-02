import { Router } from 'express';
import * as waiterController from '../controllers/waiterController';
const router = Router();
router.get('/', waiterController.getWaiters);
router.post('/', waiterController.saveWaiter);
router.post('/toggle-status', waiterController.toggleWaiterStatus);
router.post('/reset', waiterController.resetWaiter);
router.delete('/:id', waiterController.deleteWaiter);
export default router;
