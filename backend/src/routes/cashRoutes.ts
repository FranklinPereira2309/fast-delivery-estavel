import { Router } from 'express';
import * as cashController from '../controllers/cashController';

const router = Router();

router.get('/status', cashController.getActiveCashSession);
router.get('/list', cashController.getCashSessions);
router.get('/preview', cashController.getClosurePreview);
router.post('/open', cashController.openCashSession);
router.post('/reopen', cashController.reopenCashSession);
router.post('/close', cashController.closeCashSession);
router.patch('/update', cashController.updateCashSession);

export default router;
