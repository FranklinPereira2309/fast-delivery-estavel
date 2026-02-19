import { Router } from 'express';
import * as auditController from '../controllers/auditController';
const router = Router();
router.get('/', auditController.getAuditLogs);
router.post('/', auditController.logAction);
export default router;
