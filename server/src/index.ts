import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createApp } from './app.js';
import { Store } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3001);
const DATA_FILE =
  process.env.MACROFLOW_DATA_FILE ?? resolve(__dirname, '../../data/macroflow.json');

const store = new Store(DATA_FILE);
const app = createApp(store);

app.listen(PORT, () => {
  console.log(`[macroflow] API listening on http://localhost:${PORT}`);
  console.log(`[macroflow] data file: ${DATA_FILE}`);
});
