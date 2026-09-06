import { Router } from 'express';
import * as repaymentController from '../controllers/repaymentController.js';
import * as transactionController from '../controllers/transactionController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/requireRole.js';
import { validate } from '../middlewares/validate.js';
import {
  createRepaymentSchema,
  repaymentParamsSchema,
  transactionIdParamsSchema as repaymentTransactionParamsSchema,
} from '../validators/repaymentValidators.js';
import {
  deleteTransactionQuerySchema,
  transactionIdParamsSchema,
  upsertTransactionSchema,
} from '../validators/transactionValidators.js';

export const transactionRouter = Router();

transactionRouter.use(authenticate, requireRole('user'));

transactionRouter.post(
  '/',
  validate(upsertTransactionSchema),
  transactionController.createTransactionHandler,
);
transactionRouter.get(
  '/:transactionId',
  validate(transactionIdParamsSchema, 'params'),
  transactionController.getTransactionHandler,
);
transactionRouter.put(
  '/:transactionId',
  validate(transactionIdParamsSchema, 'params'),
  validate(upsertTransactionSchema),
  transactionController.updateTransactionHandler,
);
transactionRouter.delete(
  '/:transactionId',
  validate(transactionIdParamsSchema, 'params'),
  validate(deleteTransactionQuerySchema, 'query'),
  transactionController.deleteTransactionHandler,
);
transactionRouter.get(
  '/:transactionId/repayments',
  validate(repaymentTransactionParamsSchema, 'params'),
  repaymentController.listRepaymentsHandler,
);
transactionRouter.post(
  '/:transactionId/repayments',
  validate(repaymentTransactionParamsSchema, 'params'),
  validate(createRepaymentSchema),
  repaymentController.createRepaymentHandler,
);
transactionRouter.delete(
  '/:transactionId/repayments/:repaymentId',
  validate(repaymentParamsSchema, 'params'),
  repaymentController.deleteRepaymentHandler,
);
