import { Router } from 'express';
import * as inventoryController from '../controllers/inventoryController';
const router = Router();
router.get('/', inventoryController.getAllInventory);
router.post('/', inventoryController.saveInventoryItem);
router.delete('/:id', inventoryController.deleteInventoryItem);
export default router;
