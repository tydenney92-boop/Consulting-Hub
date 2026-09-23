import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT) || 3000;
const directory = path.dirname(fileURLToPath(import.meta.url));

app.use(express.static(path.join(directory, '..', 'public')));

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/{*path}', (_request, response) => {
  response.sendFile(path.join(directory, '..', 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Consulting Hub is running on port ${port}`);
});
