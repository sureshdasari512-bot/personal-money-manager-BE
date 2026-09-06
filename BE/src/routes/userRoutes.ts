import { Router } from 'express';
import * as userController from '../controllers/userController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/requireRole.js';
import { validate } from '../middlewares/validate.js';
import {
  createUserSchema,
  setUserAccessSchema,
  updateUserSchema,
  userIdParamsSchema,
} from '../validators/userValidators.js';

export const userRouter = Router();

userRouter.use(authenticate, requireRole('admin'));

userRouter.get('/', userController.listUsersHandler);
userRouter.post('/', validate(createUserSchema), userController.createUserHandler);
userRouter.get(
  '/:userId',
  validate(userIdParamsSchema, 'params'),
  userController.getUserHandler,
);
userRouter.put(
  '/:userId',
  validate(userIdParamsSchema, 'params'),
  validate(updateUserSchema),
  userController.updateUserHandler,
);
userRouter.patch(
  '/:userId/access',
  validate(userIdParamsSchema, 'params'),
  validate(setUserAccessSchema),
  userController.setUserAccessHandler,
);
userRouter.delete(
  '/:userId',
  validate(userIdParamsSchema, 'params'),
  userController.deleteUserHandler,
);
