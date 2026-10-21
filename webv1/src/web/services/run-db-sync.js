import fs from 'fs';
import path from 'path';

let dbModule = null;
try {
  dbModule = await import('./db.service.js');
} catch (_) {}

export async function syncRunToPostgres(folderName, reportsDir, status = 'completed', durationSec = null) {
  if (!dbModule || !dbModule.saveTestRunToDb) return;
  try {
    const runDir = path.join(reportsDir, folderName);
    const summaryFile = path.join(runDir, 'raw-summary.json');
    const scriptFile = path.join(runDir, 'test-performance-script.json');

    let summaryJson = null;
    let scriptJson = null;

    if (fs.existsSync(summaryFile)) {
      try {
        summaryJson = JSON.parse(fs.readFileSync(summaryFile, 'utf-8'));
      } catch (_) {}
    }

    if (fs.existsSync(scriptFile)) {
      try {
        scriptJson = JSON.parse(fs.readFileSync(scriptFile, 'utf-8'));
      } catch (_) {}
    }

    const testName = scriptJson?.globalConfig?.testName || summaryJson?.testName || 'Performance Run';
    const environment = scriptJson?.globalConfig?.environment || summaryJson?.environment || 'QA3';
    const totalRequests = summaryJson?.totals?.requests || summaryJson?.totalRequests || 0;
    const totalErrors = summaryJson?.totals?.errors || summaryJson?.totalErrors || 0;
    const scenariosCount = scriptJson?.scenarios ? Object.keys(scriptJson.scenarios).length : 0;
    let totalSteps = 0;
    if (scriptJson?.scenarios) {
      Object.values(scriptJson.scenarios).forEach((sc) => {
        if (Array.isArray(sc.steps)) totalSteps += sc.steps.length;
      });
    }

    await dbModule.saveTestRunToDb({
      runId: folderName,
      testName,
      environment,
      status,
      startedAt: new Date(),
      finishedAt: new Date(),
      durationSeconds: durationSec,
      totalRequests,
      totalErrors,
      scenariosCount,
      totalSteps,
      scriptJson,
      summaryJson
    });
  } catch (err) {
    console.warn(`[DB Sync] Error syncing run ${folderName} to Postgres:`, err.message);
  }
}
