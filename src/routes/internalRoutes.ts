import { Router } from 'express';
import * as dueReminderController from '../controllers/dueReminderController.js';

/**
 * Internal job triggers. Authenticated with x-cron-secret, not JWT.
 */
export const internalRouter = Router();

internalRouter.post('/due-reminders', dueReminderController.runDueRemindersHandler);
