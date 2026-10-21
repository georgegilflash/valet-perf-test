import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from project root if exists
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user: process.env.POSTGRES_USER || 'valet',
  password: process.env.POSTGRES_PASSWORD || 'valet_password',
  database: process.env.POSTGRES_DB || 'valet_db',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err);
});

export async function initDatabase() {
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS test_runs (
          id SERIAL PRIMARY KEY,
          run_id VARCHAR(100) UNIQUE NOT NULL,
          test_name VARCHAR(255),
          environment VARCHAR(50),
          status VARCHAR(50) NOT NULL,
          started_at TIMESTAMP WITH TIME ZONE,
          finished_at TIMESTAMP WITH TIME ZONE,
          duration_seconds INT,
          total_requests INT DEFAULT 0,
          total_errors INT DEFAULT 0,
          scenarios_count INT DEFAULT 0,
          total_steps INT DEFAULT 0,
          script_json JSONB,
          summary_json JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_test_runs_created_at ON test_runs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_test_runs_run_id ON test_runs(run_id);
      `);
      console.log('✓ [DB] PostgreSQL schema initialized (test_runs table ready).');
    } finally {
      client.release();
    }
    return true;
  } catch (err) {
    console.warn('⚠️ [DB] Warning: PostgreSQL not reachable, running with filesystem storage:', err.message);
    return false;
  }
}

export async function saveTestRunToDb(runData) {
  try {
    const query = `
      INSERT INTO test_runs (
        run_id, test_name, environment, status, started_at, finished_at,
        duration_seconds, total_requests, total_errors, scenarios_count,
        total_steps, script_json, summary_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (run_id) DO UPDATE SET
        status = EXCLUDED.status,
        finished_at = EXCLUDED.finished_at,
        duration_seconds = EXCLUDED.duration_seconds,
        total_requests = EXCLUDED.total_requests,
        total_errors = EXCLUDED.total_errors,
        summary_json = EXCLUDED.summary_json;
    `;
    const values = [
      runData.runId,
      runData.testName || null,
      runData.environment || null,
      runData.status,
      runData.startedAt ? new Date(runData.startedAt) : null,
      runData.finishedAt ? new Date(runData.finishedAt) : null,
      runData.durationSeconds || null,
      runData.totalRequests || 0,
      runData.totalErrors || 0,
      runData.scenariosCount || 0,
      runData.totalSteps || 0,
      runData.scriptJson ? JSON.stringify(runData.scriptJson) : null,
      runData.summaryJson ? JSON.stringify(runData.summaryJson) : null
    ];
    await pool.query(query, values);
    console.log(`✓ [DB] Run ${runData.runId} saved/updated in PostgreSQL.`);
  } catch (err) {
    console.warn(`⚠️ [DB] Failed to save run ${runData.runId} to database:`, err.message);
  }
}

export async function getRecentRunsFromDb(limit = 50) {
  try {
    const res = await pool.query(
      `SELECT run_id, test_name, environment, status, started_at, finished_at,
              duration_seconds, total_requests, total_errors, scenarios_count, total_steps,
              created_at
       FROM test_runs
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return res.rows;
  } catch (err) {
    console.warn('⚠️ [DB] Failed to read runs from database:', err.message);
    return null;
  }
}

export default pool;
