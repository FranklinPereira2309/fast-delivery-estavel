import { Router } from 'express';
import { loginClient, registerClient, recoverPassword, updateClientProfile, googleLoginClient, checkPhoneAvailability, checkGoogleAccount } from '../controllers/clientAuthController';

const router = Router();

router.post('/login', loginClient);
router.post('/google', googleLoginClient);
router.post('/register', registerClient);
router.post('/recover', recoverPassword);
router.put('/profile/:id', updateClientProfile);
router.get('/check-phone/:phone', checkPhoneAvailability);
router.get('/check-google-account', checkGoogleAccount);

export default router;
