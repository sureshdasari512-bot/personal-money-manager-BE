import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/requireRole.js';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  authenticate,
  requireRole('user'),
  dashboardController.getDashboardHandler,
);
