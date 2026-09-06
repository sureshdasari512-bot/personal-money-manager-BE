import { Router } from 'express';
import { authRouter } from './authRoutes.js';
import { dashboardRouter } from './dashboardRoutes.js';
import { invitationRouter } from './invitationRoutes.js';
import { personRouter } from './personRoutes.js';
import { transactionRouter } from './transactionRoutes.js';
import { userRouter } from './userRoutes.js';

/**
 * Wires feature routers to their URL prefixes. No business logic here.
 */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/invitations', invitationRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/people', personRouter);
apiRouter.use('/transactions', transactionRouter);
apiRouter.use('/dashboard', dashboardRouter);
