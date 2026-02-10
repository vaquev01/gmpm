import { Router } from 'express';
import { getMacro } from '../controllers/macro.controller';

export const macroRouter = Router();

macroRouter.get('/', getMacro);
