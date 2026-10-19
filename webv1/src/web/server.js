import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { ENDPOINT_CATALOG } from '../catalog/index.js';
import {
  validatePerformanceScript,
  parseDurationToSeconds,
  extractNormalizedScenariosAndEndpoints
} from '../validator/script-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(PUBLIC_DIR));
app.use('/reports', express.static(REPORTS_DIR));

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

/**
 * Helper to load JSON pool files from data/ directory.
 */
function loadDataPools() {
  const readPool = (filename) => {
    const filePath = path.join(DATA_DIR, filename);
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (err) {
      console.error(`Error reading pool ${filename}:`, err.message);
    }
    return [];
  };

  return {
    locationIds: readPool('location-ids.json'),
    kioskIds: readPool('kiosk-ids.json'),
    userGuids: readPool('user-guids.json')
  };
}

// ============================================================================
// Live Execution State & SSE Clients
// ============================================================================
let currentRun = {
  status: 'idle', // 'idle' | 'running' | 'completed' | 'failed' | 'stopped'
  runId: null,
  timestamp: null,
  startedAt: null,
  finishedAt: null,
  totalPlannedDurationSec: 0,
  scriptConfig: null,
  process: null,
  logs: [],
  metricsHistory: [], // 1-second aggregated buckets for Chart.js
  totals: {
    requests: 0,
    errors: 0,
    activeVUs: 0,
    currentRps: 0,
    byEndpoint: {}
  },
  reports: null,
  exitCode: null
};

const sseClients = new Set();

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

function appendLog(line, level = 'info') {
  const entry = {
    ts: new Date().toISOString(),
    level,
    text: line
  };
  currentRun.logs.push(entry);
  if (currentRun.logs.length > 500) {
    currentRun.logs.shift();
  }
  broadcastSSE('log', entry);
}

/**
 * Formats current date as YYYY-MM-DD_HH-mm-ss for unique report folders.
 */
function formatTimestampFolder(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return {
    folderName: `run-${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`,
    displayTime: `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`
  };
}

/**
 * Calculates percentile from a sorted numeric array.
 */
function calcPercentile(sortedArr, p) {
  if (!sortedArr || sortedArr.length === 0) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.floor((p / 100) * sortedArr.length));
  return Number(sortedArr[idx].toFixed(2));
}

/**
 * Parses a live metric line emitted by runner.js (`@@LIVE_METRIC@@...@@END_METRIC@@`)
 */
function parseLiveMetricLine(trimmedLine) {
  const markerIdx = trimmedLine.indexOf('@@LIVE_METRIC@@');
  if (markerIdx === -1) return null;

  const afterStart = trimmedLine.slice(markerIdx + '@@LIVE_METRIC@@'.length);
  const endIdx = afterStart.indexOf('@@END_METRIC@@');

  try {
    if (endIdx !== -1) {
      const encoded = afterStart.slice(0, endIdx).trim();
      return JSON.parse(decodeURIComponent(encoded));
    }
    // Fallback for legacy unencoded format
    const braceStart = afterStart.indexOf('{');
    const braceEnd = afterStart.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd !== -1) {
      const rawJson = afterStart.slice(braceStart, braceEnd + 1).replace(/\\"/g, '"');
      return JSON.parse(rawJson);
    }
  } catch (_) {
    return null;
  }
  return null;
}

// ============================================================================
// API Routes
// ============================================================================

/**
 * GET /api/catalog
 * Returns developer endpoint templates and default ID pools from data/*.json
 */
app.get('/api/catalog', (req, res) => {
  const pools = loadDataPools();
  res.json({
    catalog: ENDPOINT_CATALOG,
    pools
  });
});

/**
 * GET /api/pools
 * Returns only the default ID pools
 */
app.get('/api/pools', (req, res) => {
  res.json(loadDataPools());
});

/**
 * POST /api/validate
 * Validates a test-performance-script JSON object before execution
 */
app.post('/api/validate', (req, res) => {
  const scriptObj = req.body;
  const result = validatePerformanceScript(scriptObj);
  res.json(result);
});

/**
 * GET /api/run/status
 * Returns current or last test run state
 */
app.get('/api/run/status', (req, res) => {
  res.json({
    status: currentRun.status,
    runId: currentRun.runId,
    timestamp: currentRun.timestamp,
    startedAt: currentRun.startedAt,
    finishedAt: currentRun.finishedAt,
    totalPlannedDurationSec: currentRun.totalPlannedDurationSec,
    totals: currentRun.totals,
    metricsHistory: currentRun.metricsHistory,
    logs: currentRun.logs.slice(-150),
    reports: currentRun.reports,
    exitCode: currentRun.exitCode
  });
});

/**
 * GET /api/run/stream
 * Server-Sent Events stream for live charts and logs
 */
app.get('/api/run/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial snapshot
  res.write(`event: init\ndata: ${JSON.stringify({
    status: currentRun.status,
    runId: currentRun.runId,
    timestamp: currentRun.timestamp,
    startedAt: currentRun.startedAt,
    totalPlannedDurationSec: currentRun.totalPlannedDurationSec,
    totals: currentRun.totals,
    metricsHistory: currentRun.metricsHistory,
    logs: currentRun.logs.slice(-100),
    reports: currentRun.reports
  })}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

/**
 * POST /api/run
 * Validates the test-performance-script JSON, creates timestamped folder in reports/,
 * saves the configuration snapshot, and spawns k6.
 */
app.post('/api/run', (req, res) => {
  if (currentRun.status === 'running') {
    return res.status(409).json({
      valid: false,
      errors: ['A performance test is already running. Please wait for it to finish or stop it first.']
    });
  }

  const scriptConfig = req.body;
  const validation = validatePerformanceScript(scriptConfig);
  if (!validation.valid) {
    return res.status(400).json(validation);
  }

  const { distinctEndpoints: enabledEndpoints } = extractNormalizedScenariosAndEndpoints(scriptConfig);
  // Ensure scriptConfig.endpoints is also populated for backward compatibility
  scriptConfig.endpoints = enabledEndpoints;

  const { folderName, displayTime } = formatTimestampFolder(new Date());
  const runReportDir = path.join(REPORTS_DIR, folderName);
  fs.mkdirSync(runReportDir, { recursive: true });

  // Save the exact test-performance-script.json used for this run
  const savedScriptPath = path.join(runReportDir, 'test-performance-script.json');
  fs.writeFileSync(savedScriptPath, JSON.stringify(scriptConfig, null, 2), 'utf-8');

  const globalStages = scriptConfig.globalConfig?.stages || scriptConfig.stages || [];
  const totalPlannedDurationSec = globalStages.reduce(
    (acc, s) => acc + parseDurationToSeconds(s.duration),
    0
  );

  // Initialize run state
  const byEndpointTotals = {};
  for (const ep of enabledEndpoints) {
    byEndpointTotals[ep.id] = {
      id: ep.id,
      name: ep.name || ep.id,
      requests: 0,
      errors: 0,
      avgDurationMs: 0,
      p50DurationMs: 0,
      p90DurationMs: 0,
      p95DurationMs: 0,
      p99DurationMs: 0,
      maxVUs: 0
    };
  }

  currentRun = {
    status: 'running',
    runId: folderName,
    timestamp: displayTime,
    startedAt: Date.now(),
    finishedAt: null,
    totalPlannedDurationSec,
    scriptConfig,
    process: null,
    logs: [],
    metricsHistory: [],
    totals: {
      requests: 0,
      errors: 0,
      activeVUs: 0,
      currentRps: 0,
      byEndpoint: byEndpointTotals
    },
    reports: null,
    exitCode: null
  };

  // Bucket accumulator for 1-second live chart updates
  let currentSecondBucket = {
    durations: [],
    errors: 0,
    requests: 0,
    vusSeen: new Set(),
    byEndpoint: {}
  };
  const allEndpointDurations = {};
  for (const ep of enabledEndpoints) {
    allEndpointDurations[ep.id] = [];
  }

  const recordMetricSample = (m) => {
    currentSecondBucket.requests += 1;
    currentSecondBucket.durations.push(m.durationMs);
    currentSecondBucket.vusSeen.add(`${m.scenarioId || m.endpointId}_${m.vu}`);
    if (!m.ok) currentSecondBucket.errors += 1;

    if (!currentSecondBucket.byEndpoint[m.endpointId]) {
      currentSecondBucket.byEndpoint[m.endpointId] = { durations: [], requests: 0, errors: 0 };
    }
    currentSecondBucket.byEndpoint[m.endpointId].requests += 1;
    currentSecondBucket.byEndpoint[m.endpointId].durations.push(m.durationMs);
    if (!m.ok) currentSecondBucket.byEndpoint[m.endpointId].errors += 1;

    // Update cumulative totals
    currentRun.totals.requests += 1;
    if (!m.ok) currentRun.totals.errors += 1;

    if (!currentRun.totals.byEndpoint[m.endpointId]) {
      currentRun.totals.byEndpoint[m.endpointId] = {
        id: m.endpointId,
        name: m.endpointName || m.endpointId,
        requests: 0,
        errors: 0,
        avgDurationMs: 0,
        p50DurationMs: 0,
        p90DurationMs: 0,
        p95DurationMs: 0,
        p99DurationMs: 0,
        maxVUs: 0
      };
      allEndpointDurations[m.endpointId] = [];
    }

    const epTotal = currentRun.totals.byEndpoint[m.endpointId];
    epTotal.requests += 1;
    if (!m.ok) epTotal.errors += 1;
    if (m.vu > epTotal.maxVUs) epTotal.maxVUs = m.vu;

    const epDurs = allEndpointDurations[m.endpointId];
    if (epDurs && epDurs.length < 25000) {
      epDurs.push(m.durationMs);
      const sortedEp = [...epDurs].sort((a, b) => a - b);
      epTotal.avgDurationMs = Number(
        (sortedEp.reduce((a, b) => a + b, 0) / sortedEp.length).toFixed(2)
      );
      epTotal.p50DurationMs = calcPercentile(sortedEp, 50);
      epTotal.p90DurationMs = calcPercentile(sortedEp, 90);
      epTotal.p95DurationMs = calcPercentile(sortedEp, 95);
      epTotal.p99DurationMs = calcPercentile(sortedEp, 99);
    }
  };

  const emitBucketPoint = () => {
    const elapsedSec = Math.round((Date.now() - currentRun.startedAt) / 1000);
    const sorted = [...currentSecondBucket.durations].sort((a, b) => a - b);
    const avgMs = sorted.length > 0
      ? Number((sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2))
      : 0;
    const p50Ms = calcPercentile(sorted, 50);
    const p90Ms = calcPercentile(sorted, 90);
    const p95Ms = calcPercentile(sorted, 95);
    const p99Ms = calcPercentile(sorted, 99);

    const activeVUs = currentSecondBucket.vusSeen.size;
    currentRun.totals.activeVUs = activeVUs;
    currentRun.totals.currentRps = currentSecondBucket.requests;

    const epSnapshot = {};
    for (const ep of enabledEndpoints) {
      const epBucket = currentSecondBucket.byEndpoint[ep.id] || { durations: [], requests: 0, errors: 0 };
      const epSorted = [...epBucket.durations].sort((a, b) => a - b);
      epSnapshot[ep.id] = {
        name: ep.name || ep.id,
        rps: epBucket.requests,
        errors: epBucket.errors,
        avgMs: epSorted.length > 0
          ? Number((epSorted.reduce((a, b) => a + b, 0) / epSorted.length).toFixed(2))
          : 0,
        p50Ms: calcPercentile(epSorted, 50),
        p90Ms: calcPercentile(epSorted, 90),
        p95Ms: calcPercentile(epSorted, 95),
        p99Ms: calcPercentile(epSorted, 99)
      };
    }

    const point = {
      elapsedSec,
      label: `${elapsedSec}s`,
      rps: currentSecondBucket.requests,
      errors: currentSecondBucket.errors,
      activeVUs,
      avgMs,
      p50Ms,
      p90Ms,
      p95Ms,
      p99Ms,
      byEndpoint: epSnapshot
    };

    currentRun.metricsHistory.push(point);
    if (currentRun.metricsHistory.length > 300) {
      currentRun.metricsHistory.shift();
    }

    currentSecondBucket = {
      durations: [],
      errors: 0,
      requests: 0,
      vusSeen: new Set(),
      byEndpoint: {}
    };

    broadcastSSE('metric', {
      point,
      totals: currentRun.totals
    });
  };

  const runnerScriptPath = path.join(ROOT_DIR, 'src', 'k6', 'runner.js');
  const relativeReportDir = path.posix.join('reports', folderName);
  const normalizedScriptPath = savedScriptPath.replace(/\\/g, '/');

  appendLog(`[Valet Perf Runner] Starting test execution ${folderName}`, 'info');
  appendLog(`[Valet Perf Runner] Configuration saved at: ${relativeReportDir}/test-performance-script.json`, 'info');
  appendLog(`[Valet Perf Runner] Enabled endpoints: ${enabledEndpoints.map((e) => e.id).join(', ')}`, 'info');

  const k6Env = {
    ...process.env,
    SCRIPT_CONFIG_PATH: normalizedScriptPath,
    REPORT_OUTPUT_DIR: relativeReportDir,
    RUN_TIMESTAMP: displayTime
  };

  const k6Args = ['run', runnerScriptPath];
  const child = spawn('k6', k6Args, {
    cwd: ROOT_DIR,
    env: k6Env
  });

  currentRun.process = child;

  // Periodic 1-second ticker to emit live metrics to Chart.js
  const metricInterval = setInterval(() => {
    if (currentRun.status !== 'running') return;
    emitBucketPoint();
  }, 1000);

  const handleOutputChunk = (chunk, bufferRef) => {
    bufferRef.value += chunk.toString();
    const lines = bufferRef.value.split(/\r?\n/);
    bufferRef.value = lines.pop() || '';

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      const metricObj = parseLiveMetricLine(trimmed);
      if (metricObj) {
        recordMetricSample(metricObj);
      } else {
        appendLog(trimmed, 'info');
      }
    }
  };

  const stdoutBuf = { value: '' };
  const stderrBuf = { value: '' };

  child.stdout.on('data', (chunk) => handleOutputChunk(chunk, stdoutBuf));
  child.stderr.on('data', (chunk) => handleOutputChunk(chunk, stderrBuf));

  child.on('error', (err) => {
    clearInterval(metricInterval);
    currentRun.status = 'failed';
    currentRun.finishedAt = Date.now();
    appendLog(`Error starting k6 (${err.message}). Verify that k6 is installed or run inside Docker.`, 'error');
    broadcastSSE('complete', {
      status: currentRun.status,
      runId: currentRun.runId,
      error: err.message
    });
  });

  child.on('close', (code) => {
    clearInterval(metricInterval);

    // Flush any remaining partial bucket if requests were recorded in the last second
    if (currentSecondBucket.requests > 0) {
      emitBucketPoint();
    }

    currentRun.finishedAt = Date.now();
    currentRun.exitCode = code;
    currentRun.process = null;
    currentRun.totals.activeVUs = 0;
    currentRun.totals.currentRps = 0;

    // Synchronize final totals from raw-summary.json generated by k6 handleSummary
    const rawSummaryPath = path.join(runReportDir, 'raw-summary.json');
    if (fs.existsSync(rawSummaryPath)) {
      try {
        const rawSummary = JSON.parse(fs.readFileSync(rawSummaryPath, 'utf-8'));
        if (Array.isArray(rawSummary.endpointsSummary) && rawSummary.endpointsSummary.length > 0) {
          let totalReqsFromSummary = 0;
          let totalErrorsFromSummary = 0;

          rawSummary.endpointsSummary.forEach((epSum) => {
            const reqs = epSum.totalReqs ?? epSum.totalRequests ?? 0;
            const errs = epSum.failedReqs ?? 0;
            totalReqsFromSummary += reqs;
            totalErrorsFromSummary += errs;

            const existingEp = currentRun.totals.byEndpoint[epSum.id] || {
              id: epSum.id,
              name: epSum.name || epSum.id,
              maxVUs: epSum.peakVUs || 0
            };

            currentRun.totals.byEndpoint[epSum.id] = {
              id: epSum.id,
              name: epSum.name || existingEp.name || epSum.id,
              requests: reqs,
              errors: errs,
              maxVUs: Math.max(existingEp.maxVUs || 0, epSum.peakVUs || 0),
              p50DurationMs: Number((epSum.p50 ?? epSum.duration?.p50 ?? existingEp.p50DurationMs ?? 0).toFixed(2)),
              p90DurationMs: Number((epSum.p90 ?? epSum.duration?.p90 ?? existingEp.p90DurationMs ?? 0).toFixed(2)),
              p95DurationMs: Number((epSum.p95 ?? epSum.duration?.p95 ?? existingEp.p95DurationMs ?? 0).toFixed(2)),
              p99DurationMs: Number((epSum.p99 ?? epSum.duration?.p99 ?? existingEp.p99DurationMs ?? 0).toFixed(2)),
              avgDurationMs: Number((epSum.avg ?? epSum.duration?.avg ?? existingEp.avgDurationMs ?? 0).toFixed(2))
            };
          });

          if (totalReqsFromSummary > 0) {
            currentRun.totals.requests = totalReqsFromSummary;
            currentRun.totals.errors = totalErrorsFromSummary;
          }
        }
      } catch (err) {
        console.error('Error syncing final totals from raw-summary.json:', err.message);
      }
    }

    if (currentRun.status === 'stopped') {
      appendLog(`[Valet Perf Runner] Test execution stopped by user (exit code ${code}).`, 'warn');
    } else if (code === 0 || code === 99) {
      currentRun.status = 'completed';
      appendLog(`[Valet Perf Runner] Test execution finished successfully. HTML reports generated in /reports/${folderName}/`, 'success');
    } else {
      currentRun.status = 'failed';
      appendLog(`[Valet Perf Runner] k6 exited with code ${code}.`, 'error');
    }

    // Build report URLs
    const reportLinks = {
      generalHtml: `/reports/${folderName}/report-general.html`,
      scriptJson: `/reports/${folderName}/test-performance-script.json`,
      rawSummaryJson: `/reports/${folderName}/raw-summary.json`,
      endpoints: enabledEndpoints.map((ep) => ({
        id: ep.id,
        name: ep.name || ep.id,
        url: `/reports/${folderName}/report-${ep.id}.html`
      }))
    };
    currentRun.reports = reportLinks;

    // Save execution log file
    try {
      const logContent = currentRun.logs.map((l) => `[${l.ts}] [${l.level.toUpperCase()}] ${l.text}`).join('\n');
      fs.writeFileSync(path.join(runReportDir, 'execution.log'), logContent, 'utf-8');
    } catch (_) {
      // Ignore log write error
    }

    broadcastSSE('complete', {
      status: currentRun.status,
      runId: currentRun.runId,
      exitCode: code,
      reports: reportLinks,
      totals: currentRun.totals
    });
  });

  res.json({
    started: true,
    runId: folderName,
    timestamp: displayTime,
    totalPlannedDurationSec,
    warnings: validation.warnings
  });
});

/**
 * POST /api/run/stop
 * Stops the currently running k6 process
 */
app.post('/api/run/stop', (req, res) => {
  if (currentRun.status !== 'running' || !currentRun.process) {
    return res.status(400).json({ stopped: false, message: 'No performance test is currently running.' });
  }

  currentRun.status = 'stopped';
  try {
    currentRun.process.kill('SIGINT');
  } catch (err) {
    return res.status(500).json({ stopped: false, message: err.message });
  }

  res.json({ stopped: true, runId: currentRun.runId });
});

/**
 * GET /api/reports
 * Lists all historical test run folders inside reports/
 */
app.get('/api/reports', (req, res) => {
  try {
    if (!fs.existsSync(REPORTS_DIR)) {
      return res.json({ runs: [] });
    }

    const entries = fs.readdirSync(REPORTS_DIR, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .sort((a, b) => b.localeCompare(a)); // Newest first

    const runs = entries.map((folderName) => {
      const folderPath = path.join(REPORTS_DIR, folderName);
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
          avg: Number(avgDur.toFixed(2))
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
          avg: httpDurValues.avg ? Number(httpDurValues.avg.toFixed(2)) : null
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
        summaryStats
      };
    });

    res.json({ runs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reports/:runId/script
 * Returns the saved test-performance-script.json for a specific historical run
 */
app.get('/api/reports/:runId/script', (req, res) => {
  const safeRunId = path.basename(req.params.runId);
  const scriptFile = path.join(REPORTS_DIR, safeRunId, 'test-performance-script.json');
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

app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`Valet Performance Testing Webview v1 running at:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`Data directory:    ${DATA_DIR}`);
  console.log(`Reports directory: ${REPORTS_DIR}`);
  console.log(`================================================================`);
});
