import { Router } from 'express';
import { createPreference, receiveWebhook } from '../controllers/paymentController';

const router = Router();

// /api/payments/create-preference
router.post('/create-preference', createPreference);

// /api/payments/webhook -> Receives MP IPN (Instant Payment Notification)
router.post('/webhook', receiveWebhook);

export default router;
