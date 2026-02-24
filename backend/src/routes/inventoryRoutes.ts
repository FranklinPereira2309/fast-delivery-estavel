import { Router } from 'express';
import * as inventoryController from '../controllers/inventoryController';
const router = Router();
router.get('/', inventoryController.getAllInventory);
router.get('/movements', inventoryController.getInventoryMovements);
router.post('/', inventoryController.saveInventoryItem);
router.delete('/:id', inventoryController.deleteInventoryItem);
export default router;
