import { Router } from 'express';
import * as driverController from '../controllers/driverController';
const router = Router();
router.get('/', driverController.getDrivers);
router.post('/', driverController.saveDriver);
router.delete('/:id', driverController.deleteDriver);
export default router;
