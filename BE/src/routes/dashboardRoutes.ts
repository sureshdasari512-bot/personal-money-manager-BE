import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { authenticate } from '../middlewares/authenticate.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', authenticate, dashboardController.getDashboardHandler);
