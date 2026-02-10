import { Router } from 'express';
import { getFred } from '../controllers/fred.controller';

export const fredRouter = Router();

fredRouter.get('/', getFred);
