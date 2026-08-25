import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';

/** Campaign bodies are HTML and can be large; the 100kb default is too tight. */
const JSON_BODY_LIMIT = '1mb';

export function createApp(): Express {
  const app = express();

  // Behind a reverse proxy this keeps req.ip and rate limiting honest.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

  if (process.env['NODE_ENV'] !== 'test') {
    app.use(morgan(process.env['NODE_ENV'] === 'production' ? 'combined' : 'dev'));
  }

  app.use('/api', apiRouter);

  // Must come last: the 404 catches unmatched routes, and the error handler
  // is registered after all routes so every thrown failure reaches it.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
