import { Router } from 'express';
import * as maintenanceController from '../controllers/maintenanceController';

const router = Router();

// In a real environment, we would protect this route with a high-level admin check
router.post('/reset', maintenanceController.resetSystem);

export default router;
