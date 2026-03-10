import { loginClient, registerClient, recoverPassword, updateClientProfile, googleLoginClient } from '../controllers/clientAuthController';

const router = Router();

router.post('/login', loginClient);
router.post('/google', googleLoginClient);
router.post('/register', registerClient);
router.post('/recover', recoverPassword);
router.put('/profile/:id', updateClientProfile);

export default router;
