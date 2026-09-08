import express from 'express';

const app = express();
const port = Number(process.env.PORT ?? 8080);

app.get('/health', (_request, response) => {
  response.json({ ok: true });
});

app.listen(port, () => {
  console.log(`CloudSuite server listening on port ${port}`);
});
