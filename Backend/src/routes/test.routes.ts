import { Router } from 'express';
import { getSelfTest } from '../controllers/selfTest.controller';

export const testRouter = Router();

testRouter.get('/', getSelfTest);
