import { Router } from 'express';
import * as userController from '../controllers/userController';

const router = Router();

router.get('/', userController.getAllUsers);
router.post('/', userController.saveUser);
router.delete('/:id', userController.deleteUser);
router.post('/toggle-status', userController.toggleUserStatus);
router.post('/reset', userController.resetUser);

export default router;
