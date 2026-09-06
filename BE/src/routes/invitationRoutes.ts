import { Router } from 'express';
import * as invitationController from '../controllers/invitationController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/requireRole.js';
import { validate } from '../middlewares/validate.js';
import {
  createInvitationSchema,
  invitationIdParamsSchema,
} from '../validators/invitationValidators.js';

export const invitationRouter = Router();

invitationRouter.use(authenticate, requireRole('admin'));

invitationRouter.get('/', invitationController.listInvitationsHandler);
invitationRouter.post(
  '/',
  validate(createInvitationSchema),
  invitationController.createInvitationHandler,
);
invitationRouter.get(
  '/:invitationId',
  validate(invitationIdParamsSchema, 'params'),
  invitationController.getInvitationHandler,
);
invitationRouter.post(
  '/:invitationId/revoke',
  validate(invitationIdParamsSchema, 'params'),
  invitationController.revokeInvitationHandler,
);
