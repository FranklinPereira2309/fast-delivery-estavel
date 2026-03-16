import { Router } from 'express';
import * as campaignController from '../controllers/campaignController';

const router = Router();

router.get('/', campaignController.getAllCampaigns);
router.post('/', campaignController.saveCampaign);
router.delete('/:id', campaignController.deleteCampaign);
router.post('/:id/send', campaignController.sendCampaign);

export default router;
