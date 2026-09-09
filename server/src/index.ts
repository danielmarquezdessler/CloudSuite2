import express from 'express';
import cors from 'cors';
import { organizationsRouter } from './routes/organizations.routes.js';
import { campaignRouter } from './routes/campaign.routes.js';
import { votersRouter } from './routes/voters.routes.js';
import { systemRouter } from './routes/system.routes.js';
import { planningRouter } from './routes/planning.routes.js';

const app = express();
const port = Number(process.env.PORT ?? 8080);

const localDevOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
const configuredOrigins = (process.env.WEB_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors({ origin(origin, callback) {
  if (!origin || localDevOrigin.test(origin) || configuredOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin no permitido por CORS.'));
} }));
app.use(express.json());

app.get('/health', (_request, response) => {
  response.json({ ok: true });
});

app.use('/api', organizationsRouter);
app.use('/api', campaignRouter);
app.use('/api', votersRouter);
app.use('/api', systemRouter);
app.use('/api', planningRouter);

app.listen(port, () => {
  console.log(`CloudSuite server listening on port ${port}`);
});
