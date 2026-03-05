import { Router } from 'express';
import * as clientController from '../controllers/clientController';
const router = Router();
router.get('/', clientController.getAllClients);
router.post('/', clientController.saveClient);
router.delete('/:id', clientController.deleteClient);
router.put('/:id/reset-pin', clientController.resetClientPin);
export default router;
