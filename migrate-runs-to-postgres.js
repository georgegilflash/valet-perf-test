import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { syncRunToPostgres } from './webv1/src/web/services/run-db-sync.js';
import pool from './webv1/src/web/services/db.service.js';

const reportsDir = path.resolve('webv1/reports');
const folders = fs.readdirSync(reportsDir).filter((f) => f.startsWith('run-'));

console.log(`Found ${folders.length} runs to migrate to PostgreSQL...`);

for (const folder of folders) {
  await syncRunToPostgres(folder, reportsDir, 'completed');
}

const res = await pool.query('SELECT count(*) FROM test_runs;');
console.log(`Migration complete! test_runs in Postgres: ${res.rows[0].count}`);
await pool.end();
process.exit(0);
