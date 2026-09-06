import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { acceptInvitationSchema, loginSchema } from '../validators/authValidators.js';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export const authRouter = Router();

authRouter.post('/login', authLimiter, validate(loginSchema), authController.loginHandler);
authRouter.post('/refresh', authLimiter, authController.refreshHandler);
authRouter.post('/logout', authController.logoutHandler);
authRouter.get('/me', authenticate, authController.meHandler);
authRouter.post(
  '/accept-invite',
  authLimiter,
  validate(acceptInvitationSchema),
  authController.acceptInviteHandler,
);
