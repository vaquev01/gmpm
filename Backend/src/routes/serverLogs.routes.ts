import { Router } from 'express';
import { deleteServerLogs, getServerLogs } from '../controllers/serverLogs.controller';

export const serverLogsRouter = Router();

serverLogsRouter.get('/', getServerLogs);
serverLogsRouter.delete('/', deleteServerLogs);
