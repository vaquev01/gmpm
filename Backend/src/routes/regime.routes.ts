import { Router } from 'express';
import { regimeController } from '../controllers/regime.controller';

const router = Router();
router.get('/', regimeController);

export default router;
