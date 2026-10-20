/**
 * Live View Module (Real-Time Chart.js, SSE Connection, KPIs, Execution Lifecycle)
 */

import { state, escapeHtml, showToast } from './state.js';
import { validateCurrentEditorJson } from './script.view.js';
import { recordRunInLocalStorage } from './scenarios.view.js';
import { loadReportsHistory } from './reports.view.js';

const ENDPOINT_COLORS = [
  '#38bdf8', // sky-400
  '#fbbf24', // amber-400
  '#a855f7', // purple-500
  '#ec4899', // pink-500
  '#34d399', // emerald-400
  '#f97316', // orange-500
  '#06b6d4', // cyan-500
  '#818cf8', // indigo-400
  '#e879f9', // fuchsia-400
  '#4ade80'  // green-400
];

function getDatasetColor(index) {
  return ENDPOINT_COLORS[index % ENDPOINT_COLORS.length];
}

export function initCharts() {
  const ctxReqNow = document.getElementById('chart-requests-now')?.getContext('2d');
  if (ctxReqNow) {
    state.charts.requestsNow = new Chart(ctxReqNow, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            id: '__total__',
            label: 'Total Requests Now (req/s)',
            data: [],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.16)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.25
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#64748b', maxTicksLimit: 12 }, grid: { color: '#1e293b' } },
          y: { beginAtZero: true, ticks: { color: '#94a3b8', precision: 0 }, grid: { color: '#1e293b' } }
        }
      }
    });
  }

  const ctxTp = document.getElementById('chart-throughput')?.getContext('2d');
  if (ctxTp) {
    state.charts.throughput = new Chart(ctxTp, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Requests / sec (RPS)',
            data: [],
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            fill: true,
            tension: 0.3
          },
          {
            label: 'Active VUs',
            data: [],
            borderColor: '#818cf8',
            backgroundColor: 'rgba(129, 140, 248, 0.1)',
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#64748b', maxTicksLimit: 10 }, grid: { color: '#1e293b' } },
          y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }
        }
      }
    });
  }

  const ctxLat = document.getElementById('chart-latency')?.getContext('2d');
  if (ctxLat) {
    state.charts.latency = new Chart(ctxLat, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'p50 Median (ms)',
            data: [],
            borderColor: '#38bdf8',
            backgroundColor: 'transparent',
            tension: 0.3
          },
          {
            label: 'p90 (ms)',
            data: [],
            borderColor: '#818cf8',
            backgroundColor: 'transparent',
            tension: 0.3
          },
          {
            label: 'p95 (ms)',
            data: [],
            borderColor: '#fbbf24',
            backgroundColor: 'rgba(251, 191, 36, 0.1)',
            fill: true,
            tension: 0.3
          },
          {
            label: 'p99 (ms)',
            data: [],
            borderColor: '#f43f5e',
            backgroundColor: 'rgba(244, 63, 94, 0.08)',
            fill: false,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#64748b', maxTicksLimit: 10 }, grid: { color: '#1e293b' } },
          y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }
        }
      }
    });
  }

  const ctxStatus = document.getElementById('chart-status-codes')?.getContext('2d');
  if (ctxStatus) {
    state.charts.statusCodes = new Chart(ctxStatus, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Error Rate (%)',
            data: [],
            yAxisID: 'yRate',
            borderColor: '#f43f5e',
            backgroundColor: 'rgba(244, 63, 94, 0.12)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.3
          },
          {
            label: '200 OK (req/s)',
            data: [],
            yAxisID: 'yCount',
            borderColor: '#10b981',
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            tension: 0.3
          },
          {
            label: '4xx Client Error (req/s)',
            data: [],
            yAxisID: 'yCount',
            borderColor: '#fbbf24',
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            tension: 0.3
          },
          {
            label: '5xx Server Error (req/s)',
            data: [],
            yAxisID: 'yCount',
            borderColor: '#ef4444',
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.3
          },
          {
            label: 'SOAP Fault / Other (req/s)',
            data: [],
            yAxisID: 'yCount',
            borderColor: '#a855f7',
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { labels: { color: '#cbd5e1', font: { size: 11 } } },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: { ticks: { color: '#64748b', maxTicksLimit: 12 }, grid: { color: '#1e293b' } },
          yCount: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            ticks: { color: '#94a3b8', precision: 0 },
            grid: { color: '#1e293b' },
            title: { display: true, text: 'Requests / s', color: '#64748b' }
          },
          yRate: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            max: 100,
            ticks: {
              color: '#f43f5e',
              callback: (val) => `${val}%`
            },
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Error Rate %', color: '#f43f5e' }
          }
        }
      }
    });
  }
}

export function resetLiveViewForNewRun(runId, totalPlannedDurationSec, endpoints = []) {
  const banner = document.getElementById('live-reports-ready-banner');
  if (banner) banner.classList.add('hidden');

  inMemoryLogs = [];
  const consoleEl = document.getElementById('live-console-output');
  if (consoleEl) consoleEl.textContent = '';
  const countEl = document.getElementById('live-console-count');
  if (countEl) countEl.textContent = '0 lines';

  document.getElementById('live-kpi-vus').textContent = '0';
  document.getElementById('live-kpi-reqs').textContent = '0';
  document.getElementById('live-kpi-rps').textContent = '0 req/s';
  document.getElementById('live-kpi-errors').textContent = '0';
  document.getElementById('run-elapsed-display').textContent = `0s / ${totalPlannedDurationSec || 0}s`;

  const reqNowBadge = document.getElementById('live-requests-now-badge');
  if (reqNowBadge) reqNowBadge.textContent = '0 req/s right now';

  if (state.charts.requestsNow) {
    state.charts.requestsNow.data.labels = [];
    const baseDatasets = [
      {
        id: '__total__',
        label: 'Total Requests Now (req/s)',
        data: [],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.16)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.25
      }
    ];

    if (Array.isArray(endpoints)) {
      endpoints.forEach((ep, idx) => {
        const epId = ep.id || ep;
        const epName = ep.name || epId;
        baseDatasets.push({
          id: epId,
          label: `${epName} (req/s)`,
          data: [],
          borderColor: getDatasetColor(idx),
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.25
        });
      });
    }

    state.charts.requestsNow.data.datasets = baseDatasets;
    state.charts.requestsNow.update();
  }
  if (state.charts.throughput) {
    state.charts.throughput.data.labels = [];
    state.charts.throughput.data.datasets[0].data = [];
    state.charts.throughput.data.datasets[1].data = [];
    state.charts.throughput.update();
  }
  if (state.charts.latency) {
    state.charts.latency.data.labels = [];
    state.charts.latency.data.datasets.forEach((ds) => {
      ds.data = [];
    });
    state.charts.latency.update();
  }
  if (state.charts.statusCodes) {
    state.charts.statusCodes.data.labels = [];
    state.charts.statusCodes.data.datasets.forEach((ds) => {
      ds.data = [];
    });
    state.charts.statusCodes.update();
  }

  updateLiveHeaderState('running', runId);
}

export function updateLiveHeaderState(status, runId) {
  const badge = document.getElementById('run-status-badge');
  const title = document.getElementById('run-title-display');
  const subtitle = document.getElementById('run-subtitle-display');
  const stopBtn = document.getElementById('btn-stop-test');
  const liveDot = document.getElementById('live-indicator');

  if (status === 'running') {
    if (badge) {
      badge.textContent = 'RUNNING';
      badge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/40 animate-pulse';
    }
    if (title) title.textContent = runId || 'Active Execution';
    if (subtitle) subtitle.textContent = 'Receiving real-time telemetry from k6 scenarios...';
    if (stopBtn) stopBtn.disabled = false;
    if (liveDot) liveDot.classList.remove('hidden');
  } else if (status === 'completed') {
    if (badge) {
      badge.textContent = 'COMPLETED';
      badge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    }
    if (title) title.textContent = `${runId || 'Run'} — Finished`;
    if (subtitle) subtitle.textContent = 'HTML reports (General & Per-Endpoint with p50, p90, p95, p99) are ready below.';
    if (stopBtn) stopBtn.disabled = true;
    if (liveDot) liveDot.classList.add('hidden');
  } else if (status === 'stopped' || status === 'failed') {
    if (badge) {
      badge.textContent = status.toUpperCase();
      badge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40';
    }
    if (title) title.textContent = `${runId || 'Run'} — ${status.toUpperCase()}`;
    if (stopBtn) stopBtn.disabled = true;
    if (liveDot) liveDot.classList.add('hidden');
  } else {
    if (badge) {
      badge.textContent = 'IDLE';
      badge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-800 text-slate-300';
    }
    if (stopBtn) stopBtn.disabled = true;
    if (liveDot) liveDot.classList.add('hidden');
  }
}

export async function startPerformanceTest(switchTabFn) {
  const valid = await validateCurrentEditorJson();
  if (!valid || !state.lastValidatedScript) {
    showToast('Please fix validation errors before starting the test.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.lastValidatedScript)
    });
    const data = await res.json();

    if (!res.ok || !data.started) {
      const errMsg = data.errors ? data.errors.join(', ') : 'Could not start test';
      showToast(errMsg, 'error');
      return;
    }

    state.totalPlannedSec = data.totalPlannedDurationSec || 0;
    recordRunInLocalStorage(state.lastValidatedScript, data.runId);
    resetLiveViewForNewRun(data.runId, state.totalPlannedSec, state.lastValidatedScript?.endpoints || []);
    if (typeof switchTabFn === 'function') {
      switchTabFn('live');
    }
    showToast(`Started performance test: ${data.runId}`, 'info');
  } catch (err) {
    showToast(`Error starting test: ${err.message}`, 'error');
  }
}

export async function stopPerformanceTest() {
  try {
    await fetch('/api/run/stop', { method: 'POST' });
    showToast('Sent stop signal (SIGINT) to k6 process.', 'info');
  } catch (err) {
    showToast(`Failed to stop test: ${err.message}`, 'error');
  }
}

export function connectSSEStream() {
  if (state.sseSource) {
    state.sseSource.close();
  }

  const es = new EventSource('/api/run/stream');
  state.sseSource = es;

  es.addEventListener('init', (e) => {
    const snap = JSON.parse(e.data);
    state.totalPlannedSec = snap.totalPlannedDurationSec || 0;
    updateLiveHeaderState(snap.status, snap.runId);

    if (Array.isArray(snap.logs) && snap.logs.length > 0) {
      inMemoryLogs = snap.logs.map((l) => l.text);
      const countEl = document.getElementById('live-console-count');
      if (countEl) countEl.textContent = `${inMemoryLogs.length} lines`;

      if (isConsoleVisible) {
        const consoleEl = document.getElementById('live-console-output');
        if (consoleEl) {
          consoleEl.textContent = inMemoryLogs.slice(-800).join('\n') + '\n';
          consoleEl.scrollTop = consoleEl.scrollHeight;
        }
      }
    }

    if (Array.isArray(snap.metricsHistory)) {
      snap.metricsHistory.forEach((pt) => pushLiveMetricPoint(pt, false));
      state.charts.requestsNow?.update();
      state.charts.throughput?.update();
      state.charts.latency?.update();
      state.charts.statusCodes?.update();
    }

    if (snap.totals) {
      renderLiveTotalsAndTable(snap.totals, snap.metricsHistory?.[snap.metricsHistory.length - 1]);
    }

    if (snap.reports && snap.status === 'completed') {
      renderCompletedReportLinks(snap.reports);
    }
  });

  let logBuffer = [];
  let logFlushScheduled = false;

  es.addEventListener('log', (e) => {
    const entry = JSON.parse(e.data);
    inMemoryLogs.push(entry.text);
    if (inMemoryLogs.length > 1500) {
      inMemoryLogs.shift();
    }

    const countEl = document.getElementById('live-console-count');
    if (countEl) {
      countEl.textContent = `${inMemoryLogs.length} lines`;
    }

    // Only do DOM manipulation if the console is actively visible!
    if (!isConsoleVisible) return;

    logBuffer.push(entry.text);

    if (!logFlushScheduled) {
      logFlushScheduled = true;
      requestAnimationFrame(() => {
        const consoleEl = document.getElementById('live-console-output');
        if (consoleEl && logBuffer.length > 0) {
          if (consoleEl.textContent === 'Waiting for k6 execution...') {
            consoleEl.textContent = '';
          }
          consoleEl.textContent += logBuffer.join('\n') + '\n';
          logBuffer = [];

          if (consoleEl.textContent.length > 80000) {
            const lines = consoleEl.textContent.split('\n');
            if (lines.length > 900) {
              consoleEl.textContent = lines.slice(-700).join('\n');
            }
          }
          consoleEl.scrollTop = consoleEl.scrollHeight;
        }
        logFlushScheduled = false;
      });
    }
  });

  es.addEventListener('metric', (e) => {
    const { point, totals } = JSON.parse(e.data);
    if (point) {
      pushLiveMetricPoint(point, true);
      const elapsedEl = document.getElementById('run-elapsed-display');
      if (elapsedEl) {
        elapsedEl.textContent = `${point.elapsedSec}s / ${state.totalPlannedSec || 0}s`;
      }
    }
    if (totals) {
      renderLiveTotalsAndTable(totals, point);
    }
  });

  es.addEventListener('complete', (e) => {
    const data = JSON.parse(e.data);
    updateLiveHeaderState(data.status, data.runId);
    if (data.totals) {
      renderLiveTotalsAndTable(data.totals, null);
    }
    if (data.reports) {
      renderCompletedReportLinks(data.reports);
    }
    loadReportsHistory();
    showToast(`Test run ${data.runId} finished (${data.status}).`, 'info');
  });
}

export function pushLiveMetricPoint(pt, shouldUpdateChart = true) {
  const maxPoints = 90;
  const currentReqNow = pt.requestsNow ?? pt.rps ?? 0;

  const reqNowBadge = document.getElementById('live-requests-now-badge');
  if (reqNowBadge) {
    reqNowBadge.textContent = `${currentReqNow} req/s right now`;
  }

  if (state.charts.requestsNow) {
    const cNow = state.charts.requestsNow;

    cNow.data.labels.push(pt.label);

    // Total dataset is always at index 0 (or id === '__total__')
    if (cNow.data.datasets[0]) {
      cNow.data.datasets[0].data.push(currentReqNow);
    }

    // Ensure all endpoints present in pt.byEndpoint exist as datasets
    if (pt.byEndpoint && typeof pt.byEndpoint === 'object') {
      Object.entries(pt.byEndpoint).forEach(([epId, epData]) => {
        let ds = cNow.data.datasets.find((d) => d.id === epId);
        if (!ds) {
          const colorIdx = cNow.data.datasets.length - 1; // 0 is total
          const epName = epData?.name || epId;
          const initialData = new Array(Math.max(0, cNow.data.labels.length - 1)).fill(0);
          ds = {
            id: epId,
            label: `${epName} (req/s)`,
            data: initialData,
            borderColor: getDatasetColor(colorIdx),
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.25
          };
          cNow.data.datasets.push(ds);
        }
      });
    }

    // Populate data for each endpoint dataset
    for (let i = 1; i < cNow.data.datasets.length; i++) {
      const ds = cNow.data.datasets[i];
      const epMetric = pt.byEndpoint?.[ds.id];
      const epReqNow = epMetric ? (epMetric.requestsNow ?? epMetric.rps ?? 0) : 0;
      ds.data.push(epReqNow);
    }

    if (cNow.data.labels.length > maxPoints) {
      cNow.data.labels.shift();
      cNow.data.datasets.forEach((ds) => ds.data.shift());
    }
    if (shouldUpdateChart) cNow.update();
  }

  if (state.charts.throughput) {
    const c1 = state.charts.throughput;
    c1.data.labels.push(pt.label);
    c1.data.datasets[0].data.push(pt.rps ?? 0);
    c1.data.datasets[1].data.push(pt.activeVUs ?? 0);
    if (c1.data.labels.length > maxPoints) {
      c1.data.labels.shift();
      c1.data.datasets[0].data.shift();
      c1.data.datasets[1].data.shift();
    }
    if (shouldUpdateChart) c1.update();
  }

  if (state.charts.latency) {
    const c2 = state.charts.latency;
    c2.data.labels.push(pt.label);
    c2.data.datasets[0].data.push(pt.p50Ms ?? 0);
    c2.data.datasets[1].data.push(pt.p90Ms ?? 0);
    c2.data.datasets[2].data.push(pt.p95Ms ?? 0);
    c2.data.datasets[3].data.push(pt.p99Ms ?? 0);
    if (c2.data.labels.length > maxPoints) {
      c2.data.labels.shift();
      c2.data.datasets.forEach((ds) => ds.data.shift());
    }
    if (shouldUpdateChart) c2.update();
  }

  if (state.charts.statusCodes) {
    const c3 = state.charts.statusCodes;
    c3.data.labels.push(pt.label);

    // Calculate error rate %: from pt.errorRatePct or direct calculation
    const totalReqsInBucket = pt.rps ?? pt.requestsNow ?? 0;
    const errorCount = pt.errors ?? 0;
    const computedErrPct = pt.errorRatePct != null
      ? pt.errorRatePct
      : (totalReqsInBucket > 0 ? Number(((errorCount / totalReqsInBucket) * 100).toFixed(1)) : 0);

    // Break down status codes
    const sc = pt.statusCodes || {};
    let count200 = 0;
    let count4xx = 0;
    let count5xx = 0;
    let countOther = 0;

    Object.entries(sc).forEach(([codeStr, count]) => {
      const codeNum = parseInt(codeStr, 10);
      if (codeNum >= 200 && codeNum < 300) {
        count200 += count;
      } else if (codeNum >= 400 && codeNum < 500) {
        count4xx += count;
      } else if (codeNum >= 500 && codeNum < 600) {
        count5xx += count;
      } else {
        countOther += count;
      }
    });

    // Fallback if statusCodes was not populated in older points
    if (Object.keys(sc).length === 0 && totalReqsInBucket > 0) {
      count200 = Math.max(0, totalReqsInBucket - errorCount);
      count5xx = errorCount;
    }

    // Dataset 0: Error Rate (%) (Line, right axis)
    c3.data.datasets[0].data.push(computedErrPct);
    // Dataset 1: 200 OK (Bar)
    c3.data.datasets[1].data.push(count200);
    // Dataset 2: 4xx Client Error (Bar)
    c3.data.datasets[2].data.push(count4xx);
    // Dataset 3: 5xx Server Error (Bar)
    c3.data.datasets[3].data.push(count5xx);
    // Dataset 4: SOAP Fault / Other (Bar)
    c3.data.datasets[4].data.push(countOther);

    if (c3.data.labels.length > maxPoints) {
      c3.data.labels.shift();
      c3.data.datasets.forEach((ds) => ds.data.shift());
    }
    if (shouldUpdateChart) c3.update();
  }
}

export function renderLiveTotalsAndTable(totals, latestPoint) {
  document.getElementById('live-kpi-vus').textContent = String(totals.activeVUs ?? 0);
  document.getElementById('live-kpi-reqs').textContent = String(totals.requests ?? 0);
  if (latestPoint) {
    document.getElementById('live-kpi-rps').textContent = `${latestPoint.requestsNow ?? latestPoint.rps ?? 0} req/s`;
  }
  const errEl = document.getElementById('live-kpi-errors');
  if (errEl) {
    errEl.textContent = String(totals.errors ?? 0);
    errEl.className =
      (totals.errors || 0) > 0
        ? 'text-2xl font-bold text-rose-400 mt-1 font-mono'
        : 'text-2xl font-bold text-emerald-400 mt-1 font-mono';
  }

  const tbody = document.getElementById('live-endpoints-tbody');
  const endpointsMap = totals.byEndpoint || {};
  const entries = Object.values(endpointsMap);

  if (tbody && entries.length > 0) {
    tbody.innerHTML = entries
      .map(
        (ep) => `
        <tr class="hover:bg-slate-800/40">
          <td class="py-2.5 px-3 font-bold text-sky-300">${escapeHtml(ep.name || ep.id)}</td>
          <td class="py-2.5 px-3 text-white font-semibold">${ep.requests ?? 0}</td>
          <td class="py-2.5 px-3 ${(ep.errors || 0) > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}">${ep.errors ?? 0}</td>
          <td class="py-2.5 px-3 text-indigo-300">${ep.maxVUs ?? 0}</td>
          <td class="py-2.5 px-3 text-sky-300">${ep.p50DurationMs ?? 0} ms</td>
          <td class="py-2.5 px-3 text-indigo-300">${ep.p90DurationMs ?? 0} ms</td>
          <td class="py-2.5 px-3 text-amber-300 font-bold">${ep.p95DurationMs ?? 0} ms</td>
          <td class="py-2.5 px-3 text-rose-400 font-bold">${ep.p99DurationMs ?? 0} ms</td>
          <td class="py-2.5 px-3 text-slate-300">${ep.avgDurationMs ?? 0} ms</td>
        </tr>
      `
      )
      .join('');
  }
}

export function renderCompletedReportLinks(reports) {
  const banner = document.getElementById('live-reports-ready-banner');
  const linksContainer = document.getElementById('live-reports-links');
  if (!banner || !linksContainer || !reports) return;

  banner.classList.remove('hidden');

  const epButtons = (reports.endpoints || [])
    .map(
      (ep) => `
      <a href="${ep.url}" target="_blank"
        class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-300 border border-sky-500/30 text-xs font-semibold transition flex items-center gap-1.5">
        <span>🔌 Report: ${escapeHtml(ep.name)}</span>
      </a>
    `
    )
    .join('');

  linksContainer.innerHTML = `
    <a href="${reports.generalHtml}" target="_blank"
      class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition flex items-center gap-1.5">
      <span>📊 Open General Report (p50, p90, p95, p99)</span>
    </a>
    ${epButtons}
    <a href="${reports.scriptJson}" target="_blank"
      class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-mono transition">
      { } Executed test-performance-script.json
    </a>
  `;
}

export let isConsoleVisible = false;
let inMemoryLogs = [];

export function toggleLiveConsole() {
  isConsoleVisible = !isConsoleVisible;
  const wrapper = document.getElementById('live-console-wrapper');
  const btn = document.getElementById('toggle-console-btn');

  if (wrapper) {
    if (isConsoleVisible) {
      wrapper.classList.remove('hidden');
      if (btn) btn.textContent = 'Hide Console';
      // Flush memory logs into DOM when opening
      const consoleEl = document.getElementById('live-console-output');
      if (consoleEl) {
        consoleEl.textContent = inMemoryLogs.slice(-800).join('\n') + (inMemoryLogs.length > 0 ? '\n' : '');
        consoleEl.scrollTop = consoleEl.scrollHeight;
      }
    } else {
      wrapper.classList.add('hidden');
      if (btn) btn.textContent = 'Show Console';
      // Clear DOM to free browser memory while closed
      const consoleEl = document.getElementById('live-console-output');
      if (consoleEl) consoleEl.textContent = '';
    }
  }
}

export function clearLiveConsole() {
  inMemoryLogs = [];
  const consoleEl = document.getElementById('live-console-output');
  if (consoleEl) consoleEl.textContent = '';
  const countEl = document.getElementById('live-console-count');
  if (countEl) countEl.textContent = '0 lines';
}
