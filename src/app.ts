import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { verifyCsrf } from './middlewares/csrf.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { apiRouter } from './routes/index.js';
import { logger } from './utils/logger.js';

/**
 * Builds the Express application with security, CORS, and layered routing.
 *
 * @returns Configured Express app (listen happens in `index.ts`)
 */
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.frontendOrigin,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      verifyCsrf(req, res, next);
      return;
    }
    next();
  });
  app.use('/api', apiRouter);
  app.use(errorHandler);

  return app;
}
