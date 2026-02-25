import { Router } from 'express';
import * as driverController from '../controllers/driverController';
const router = Router();
router.get('/', driverController.getDrivers);
router.post('/', driverController.saveDriver);
router.delete('/:id', driverController.deleteDriver);
router.get('/rejections', driverController.getRejections);
export default router;
