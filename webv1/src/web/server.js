import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { createCatalogRouter } from './routes/catalog.routes.js';
import { createReportsRouter } from './routes/reports.routes.js';
import { createRunRouter } from './routes/run.routes.js';
import { createRunExecutionService } from './services/run-execution.service.js';
import { initDatabase } from './services/db.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(PUBLIC_DIR));
app.use('/reports', express.static(REPORTS_DIR));

// Ensure required directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

// Initialize execution service
const runService = createRunExecutionService({
  rootDir: ROOT_DIR,
  reportsDir: REPORTS_DIR
});

// Mount modular routers
app.use('/api', createCatalogRouter(DATA_DIR));
app.use('/api', createReportsRouter(REPORTS_DIR));
app.use('/api', createRunRouter(runService));

initDatabase().catch(err => console.warn('[DB] Init warning:', err.message));

app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`Valet Performance Testing Webview v1 running at:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`Data directory:    ${DATA_DIR}`);
  console.log(`Reports directory: ${REPORTS_DIR}`);
  console.log(`================================================================`);
});
