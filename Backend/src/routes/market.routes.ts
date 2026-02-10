import { Router } from 'express';
import { marketController } from '../controllers/market.controller';

const router = Router();
router.get('/', marketController);

export default router;
