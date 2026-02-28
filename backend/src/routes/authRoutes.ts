import { Router } from 'express';
import * as authController from '../controllers/authController';

const router = Router();

router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/verify-admin', authController.verifyAdminPassword);
router.post('/recovery/verify', authController.verifyRecoveryCode);
router.post('/reset-password', authController.resetPassword);

export default router;
