import { Router } from 'express';
import * as productController from '../controllers/productController';
const router = Router();
router.get('/', productController.getAllProducts);
router.post('/', productController.saveProduct);
router.delete('/:id', productController.deleteProduct);
export default router;
