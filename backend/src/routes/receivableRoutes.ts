import express from 'express';
import { getReceivables, createReceivable, updateReceivable, deleteReceivable, receivePayment } from '../controllers/receivableController';

const router = express.Router();

router.get('/', getReceivables);
router.post('/', createReceivable);
router.put('/:id', updateReceivable);
router.delete('/:id', deleteReceivable);
router.post('/:id/pay', receivePayment);

export default router;
