import express from 'express';
import cors from 'cors';
import { organizationsRouter } from './routes/organizations.routes.js';
import { campaignRouter } from './routes/campaign.routes.js';

const app = express();
const port = Number(process.env.PORT ?? 8080);

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

app.get('/health', (_request, response) => {
  response.json({ ok: true });
});

app.use('/api', organizationsRouter);
app.use('/api', campaignRouter);

app.listen(port, () => {
  console.log(`CloudSuite server listening on port ${port}`);
});
