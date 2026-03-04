import { Router } from 'express';
import { loginClient, registerClient, recoverPassword } from '../controllers/clientAuthController';

const router = Router();

router.post('/login', loginClient);
router.post('/register', registerClient);
router.post('/recover', recoverPassword);

export default router;
