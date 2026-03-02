import { Router } from 'express';
import * as backupController from '../controllers/backupController';

const router = Router();

router.get('/generate', backupController.generateBackup);

export default router;
