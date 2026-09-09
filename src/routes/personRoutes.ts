import { Router } from 'express';
import * as personController from '../controllers/personController.js';
import * as repaymentController from '../controllers/repaymentController.js';
import * as transactionController from '../controllers/transactionController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/requireRole.js';
import { validate } from '../middlewares/validate.js';
import { personIdParamsSchema, upsertPersonSchema } from '../validators/personValidators.js';
import { createRepaymentSchema } from '../validators/repaymentValidators.js';

export const personRouter = Router();

personRouter.use(authenticate, requireRole('user'));

personRouter.get('/', personController.listPeopleHandler);
personRouter.post('/', validate(upsertPersonSchema), personController.createPersonHandler);
personRouter.get(
  '/:personId',
  validate(personIdParamsSchema, 'params'),
  personController.getPersonHandler,
);
personRouter.put(
  '/:personId',
  validate(personIdParamsSchema, 'params'),
  validate(upsertPersonSchema),
  personController.updatePersonHandler,
);
personRouter.delete(
  '/:personId',
  validate(personIdParamsSchema, 'params'),
  personController.deletePersonHandler,
);
personRouter.get(
  '/:personId/ledger',
  validate(personIdParamsSchema, 'params'),
  transactionController.getPersonLedgerHandler,
);
personRouter.post(
  '/:personId/repayments',
  validate(personIdParamsSchema, 'params'),
  validate(createRepaymentSchema),
  repaymentController.createPersonRepaymentHandler,
);
