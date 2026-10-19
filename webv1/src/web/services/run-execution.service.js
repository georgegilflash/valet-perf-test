import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import {
  validatePerformanceScript,
  parseDurationToSeconds,
  extractNormalizedScenariosAndEndpoints
} from '../../validator/script-validator.js';

export function createRunExecutionService({ rootDir, reportsDir }) {
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
    metricsHistory: [],
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

  function calcPercentile(sortedArr, p) {
    if (!sortedArr || sortedArr.length === 0) return 0;
    const idx = Math.min(sortedArr.length - 1, Math.floor((p / 100) * sortedArr.length));
    return Number(sortedArr[idx].toFixed(2));
  }

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

  function getStatus() {
    return {
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
    };
  }

  function registerSseClient(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

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
    return () => {
      sseClients.delete(res);
    };
  }

  function stopRun() {
    if (currentRun.status !== 'running' || !currentRun.process) {
      return { stopped: false, message: 'No performance test is currently running.' };
    }
    currentRun.status = 'stopped';
    try {
      currentRun.process.kill('SIGINT');
      return { stopped: true, runId: currentRun.runId };
    } catch (err) {
      return { stopped: false, message: err.message };
    }
  }

  function startRun(scriptConfig) {
    if (currentRun.status === 'running') {
      return {
        status: 409,
        body: {
          valid: false,
          errors: ['A performance test is already running. Please wait for it to finish or stop it first.']
        }
      };
    }

    const validation = validatePerformanceScript(scriptConfig);
    if (!validation.valid) {
      return { status: 400, body: validation };
    }

    const { distinctEndpoints: enabledEndpoints } = extractNormalizedScenariosAndEndpoints(scriptConfig);
    scriptConfig.endpoints = enabledEndpoints;

    const { folderName, displayTime } = formatTimestampFolder(new Date());
    const runReportDir = path.join(reportsDir, folderName);
    fs.mkdirSync(runReportDir, { recursive: true });

    const savedScriptPath = path.join(runReportDir, 'test-performance-script.json');
    fs.writeFileSync(savedScriptPath, JSON.stringify(scriptConfig, null, 2), 'utf-8');

    // Also mirror to reports/latest so fallback or external tools find it reliably
    try {
      const latestDir = path.join(reportsDir, 'latest');
      if (!fs.existsSync(latestDir)) fs.mkdirSync(latestDir, { recursive: true });
      fs.writeFileSync(path.join(latestDir, 'test-performance-script.json'), JSON.stringify(scriptConfig, null, 2), 'utf-8');
    } catch (_) {}

    const globalStages = scriptConfig.globalConfig?.stages || scriptConfig.stages || [];
    const totalPlannedDurationSec = globalStages.reduce(
      (acc, s) => acc + parseDurationToSeconds(s.duration),
      0
    );

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

    const metricInterval = setInterval(() => {
      if (currentRun.status !== 'running') {
        clearInterval(metricInterval);
        return;
      }
      emitBucketPoint();
    }, 1000);

    const runnerScriptPath = path.join(rootDir, 'src/k6/runner.js');
    const childEnv = {
      ...process.env,
      PERF_SCRIPT_PATH: savedScriptPath,
      SCRIPT_CONFIG_PATH: savedScriptPath,
      REPORT_DIR: runReportDir,
      REPORT_OUTPUT_DIR: runReportDir
    };

    appendLog(`[Valet Perf Runner] Starting performance test run: ${folderName}`, 'info');
    appendLog(`[Valet Perf Runner] Saved script config: ${savedScriptPath}`, 'info');
    appendLog(`[Valet Perf Runner] Total planned duration: ${totalPlannedDurationSec}s across stages`, 'info');

    broadcastSSE('start', {
      runId: folderName,
      timestamp: displayTime,
      totalPlannedDurationSec
    });

    const isWindows = process.platform === 'win32';
    const k6Child = isWindows
      ? spawn('cmd.exe', ['/c', 'k6', 'run', runnerScriptPath], {
          env: childEnv,
          cwd: rootDir,
          stdio: ['ignore', 'pipe', 'pipe']
        })
      : spawn('k6', ['run', runnerScriptPath], {
          env: childEnv,
          cwd: rootDir,
          stdio: ['ignore', 'pipe', 'pipe']
        });

    currentRun.process = k6Child;

    const handleStreamOutput = (chunk, isStderr = false) => {
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const metric = parseLiveMetricLine(trimmed);
        if (metric) {
          recordMetricSample(metric);
          continue;
        }

        const level = isStderr ? 'error' : 'info';
        appendLog(trimmed, level);
      }
    };

    k6Child.stdout.on('data', (c) => handleStreamOutput(c, false));
    k6Child.stderr.on('data', (c) => handleStreamOutput(c, true));

    k6Child.on('error', (err) => {
      appendLog(`[k6 Spawn Error] ${err.message}`, 'error');
      currentRun.status = 'failed';
      currentRun.exitCode = -1;
      clearInterval(metricInterval);
      broadcastSSE('complete', {
        status: 'failed',
        runId: currentRun.runId,
        exitCode: -1,
        totals: currentRun.totals
      });
    });

    k6Child.on('close', (code) => {
      clearInterval(metricInterval);
      emitBucketPoint();

      currentRun.finishedAt = Date.now();
      currentRun.exitCode = code;

      const rawSummaryFile = path.join(runReportDir, 'raw-summary.json');
      if (fs.existsSync(rawSummaryFile)) {
        try {
          const rawSummary = JSON.parse(fs.readFileSync(rawSummaryFile, 'utf-8'));
          const epSummaries = rawSummary.endpointsSummary;
          if (Array.isArray(epSummaries) && epSummaries.length > 0) {
            let totalReqsFromSummary = 0;
            let totalErrorsFromSummary = 0;

            epSummaries.forEach((epSum) => {
              const reqs = epSum.totalRequests ?? epSum.totalReqs ?? 0;
              const errs = epSum.totalErrors ?? epSum.errors ?? 0;
              totalReqsFromSummary += reqs;
              totalErrorsFromSummary += errs;

              const existingEp = currentRun.totals.byEndpoint[epSum.id] || {
                id: epSum.id,
                name: epSum.name || epSum.id
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

      try {
        const logContent = currentRun.logs.map((l) => `[${l.ts}] [${l.level.toUpperCase()}] ${l.text}`).join('\n');
        fs.writeFileSync(path.join(runReportDir, 'execution.log'), logContent, 'utf-8');
      } catch (_) {}

      broadcastSSE('complete', {
        status: currentRun.status,
        runId: currentRun.runId,
        exitCode: code,
        reports: reportLinks,
        totals: currentRun.totals
      });
    });

    return {
      status: 200,
      body: {
        started: true,
        runId: folderName,
        timestamp: displayTime,
        totalPlannedDurationSec,
        warnings: validation.warnings
      }
    };
  }

  return {
    getStatus,
    registerSseClient,
    startRun,
    stopRun
  };
}
