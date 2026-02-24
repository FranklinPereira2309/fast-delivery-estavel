import { Router } from 'express';
import * as chatController from '../controllers/chatController';

const router = Router();

router.get('/:driverId', chatController.getMessages);
router.post('/', chatController.saveMessage);

export default router;
