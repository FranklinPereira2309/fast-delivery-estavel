import { Router } from 'express';
import * as waiterController from '../controllers/waiterController';
const router = Router();
router.get('/', waiterController.getWaiters);
router.post('/', waiterController.saveWaiter);
router.delete('/:id', waiterController.deleteWaiter);
export default router;
