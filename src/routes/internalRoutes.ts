import { Router } from 'express';
import * as accrualController from '../controllers/accrualController.js';
import * as dueReminderController from '../controllers/dueReminderController.js';
import * as interestReminderController from '../controllers/interestReminderController.js';

/**
 * Internal job triggers. Authenticated with x-cron-secret, not JWT.
 */
export const internalRouter = Router();

internalRouter.post('/due-reminders', dueReminderController.runDueRemindersHandler);
internalRouter.post('/interest-reminders', interestReminderController.runInterestRemindersHandler);
internalRouter.post('/accrue-interest', accrualController.runAccrualHandler);
