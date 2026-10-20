import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { extractNormalizedScenariosAndEndpoints } from '../../validator/script-validator.js';

/**
 * Creates reports API router.
 * @param {string} reportsDir - Path to reports directory.
 */
export function createReportsRouter(reportsDir) {
  const router = Router();

  // GET /api/reports - Lists all historical test run folders inside reports/
  router.get('/reports', (req, res) => {
    try {
      if (!fs.existsSync(reportsDir)) {
        return res.json({ runs: [] });
      }

      const entries = fs.readdirSync(reportsDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort((a, b) => b.localeCompare(a)); // Newest first

      const runs = entries.map((folderName) => {
        const folderPath = path.join(reportsDir, folderName);
        const scriptFile = path.join(folderPath, 'test-performance-script.json');
        const summaryFile = path.join(folderPath, 'raw-summary.json');
        const generalReportFile = path.join(folderPath, 'report-general.html');

        let scriptConfig = null;
        let rawSummary = null;

        if (fs.existsSync(scriptFile)) {
          try {
            scriptConfig = JSON.parse(fs.readFileSync(scriptFile, 'utf-8'));
          } catch (_) {}
        }
        if (fs.existsSync(summaryFile)) {
          try {
            rawSummary = JSON.parse(fs.readFileSync(summaryFile, 'utf-8'));
          } catch (_) {}
        }

        const { distinctEndpoints: enabledEndpoints } = extractNormalizedScenariosAndEndpoints(scriptConfig || {});
        const endpointReports = enabledEndpoints.map((ep) => ({
          id: ep.id,
          name: ep.name || ep.id,
          usersPerStage: ep.usersPerStage || [],
          url: `/reports/${folderName}/report-${ep.id}.html`,
          exists: fs.existsSync(path.join(folderPath, `report-${ep.id}.html`))
        }));

        // Extract quick global stats from rawSummary if available
        let summaryStats = null;
        const epSummaries = rawSummary?.endpointsSummary;
        const thresholdResults = rawSummary?.thresholdResults ?? null;

        if (Array.isArray(epSummaries) && epSummaries.length > 0) {
          const totalReqs = epSummaries.reduce((acc, s) => acc + (s.totalRequests ?? s.totalReqs ?? 0), 0);
          const avgP50 = epSummaries.reduce((acc, s) => acc + (s.duration?.p50 ?? s.p50 ?? 0), 0) / epSummaries.length;
          const avgP90 = epSummaries.reduce((acc, s) => acc + (s.duration?.p90 ?? s.p90 ?? 0), 0) / epSummaries.length;
          const avgP95 = epSummaries.reduce((acc, s) => acc + (s.duration?.p95 ?? s.p95 ?? 0), 0) / epSummaries.length;
          const avgP99 = epSummaries.reduce((acc, s) => acc + (s.duration?.p99 ?? s.p99 ?? 0), 0) / epSummaries.length;
          const avgDur = epSummaries.reduce((acc, s) => acc + (s.duration?.avg ?? s.avg ?? 0), 0) / epSummaries.length;
          summaryStats = {
            totalRequests: totalReqs,
            p50: Number(avgP50.toFixed(2)),
            p90: Number(avgP90.toFixed(2)),
            p95: Number(avgP95.toFixed(2)),
            p99: Number(avgP99.toFixed(2)),
            avg: Number(avgDur.toFixed(2)),
            thresholdsPassed: thresholdResults ? thresholdResults.passed : null
          };
        } else if (rawSummary?.metrics?.http_req_duration?.values) {
          const httpReqs = rawSummary?.metrics?.http_reqs?.values?.count ?? null;
          const httpDurValues = rawSummary?.metrics?.http_req_duration?.values;
          summaryStats = {
            totalRequests: httpReqs,
            p50: httpDurValues.med ? Number(httpDurValues.med.toFixed(2)) : null,
            p90: httpDurValues['p(90)'] ? Number(httpDurValues['p(90)'].toFixed(2)) : null,
            p95: httpDurValues['p(95)'] ? Number(httpDurValues['p(95)'].toFixed(2)) : null,
            p99: httpDurValues['p(99)'] ? Number(httpDurValues['p(99)'].toFixed(2)) : null,
            avg: httpDurValues.avg ? Number(httpDurValues.avg.toFixed(2)) : null,
            thresholdsPassed: thresholdResults ? thresholdResults.passed : null
          };
        }

        return {
          runId: folderName,
          testName: scriptConfig?.globalConfig?.testName || scriptConfig?.testName || folderName,
          environment: scriptConfig?.globalConfig?.environment || scriptConfig?.environment || 'DEV',
          baseUrl: scriptConfig?.globalConfig?.baseUrl || scriptConfig?.baseUrl || 'N/A',
          stages: scriptConfig?.globalConfig?.stages || scriptConfig?.stages || [],
          scenariosCount: Array.isArray(scriptConfig?.scenarios) ? scriptConfig.scenarios.length : enabledEndpoints.length,
          hasGeneralReport: fs.existsSync(generalReportFile),
          generalReportUrl: `/reports/${folderName}/report-general.html`,
          scriptJsonUrl: `/reports/${folderName}/test-performance-script.json`,
          endpointReports,
          summaryStats,
          thresholdResults
        };
      });

      res.json({ runs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/reports/:runId/script - Specific run's JSON script
  router.get('/reports/:runId/script', (req, res) => {
    const safeRunId = path.basename(req.params.runId);
    const scriptFile = path.join(reportsDir, safeRunId, 'test-performance-script.json');
    if (!fs.existsSync(scriptFile)) {
      return res.status(404).json({ error: 'File test-performance-script.json not found for this run.' });
    }
    try {
      const content = JSON.parse(fs.readFileSync(scriptFile, 'utf-8'));
      res.json(content);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
