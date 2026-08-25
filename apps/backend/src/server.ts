import cors from 'cors';
import express from 'express';

import { env } from './config/env.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api', uptime: process.uptime() });
});

// Routes are registered in a later phase.

const server = app.listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${env.PORT}`);
});

const shutdown = (signal: string) => {
  console.log(`[api] ${signal} received, closing server`);
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
