import { Router } from 'express';
import * as tableController from '../controllers/tableController';
const router = Router();
router.get('/', tableController.getTableSessions);
router.post('/', tableController.saveTableSession);
router.post('/transfer', tableController.transferTableSession);
router.delete('/:tableNumber', tableController.deleteTableSession);
export default router;
