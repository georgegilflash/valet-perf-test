/**
 * Multi-Report Generator for k6 (webv1)
 * Generates:
 *  - 1 General Consolidated HTML Report (`report-general.html`)
 *  - 1 Individual HTML Report per tested endpoint (`report-<endpointId>.html`)
 *  - Raw Summary JSON (`raw-summary.json`)
 *
 * Metrics included: Min, p50 (Median), Avg, p90, p95, p99, Max,
 * plus full k6 HTTP timing breakdown, assertions, stages, VUs, and IDs used.
 */

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatDuration(ms) {
  if (ms === undefined || ms === null || isNaN(ms)) return '0.00ms';
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s (${ms.toFixed(0)}ms)`;
  }
  return `${ms.toFixed(2)}ms`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractTrendStats(metricObj) {
  const v = metricObj && metricObj.values ? metricObj.values : {};
  return {
    min: v.min ?? 0,
    p50: v['p(50)'] ?? v.med ?? 0,
    avg: v.avg ?? 0,
    p90: v['p(90)'] ?? 0,
    p95: v['p(95)'] ?? 0,
    p99: v['p(99)'] ?? 0,
    max: v.max ?? 0,
  };
}

/**
 * Checks whether an endpoint's percentiles and error rate meet configured SLA thresholds.
 */
function evaluateThresholds(stats, errorRatePct, thresholdsConfig, globalThresholdsConfig) {
  const gThresh = globalThresholdsConfig || {};
  const t = thresholdsConfig || {};

  const limits = {
    p50: t.p50MaxDurationMs ?? gThresh.p50MaxDurationMs ?? null,
    p90: t.p90MaxDurationMs ?? gThresh.p90MaxDurationMs ?? null,
    p95: t.p95MaxDurationMs ?? gThresh.p95MaxDurationMs ?? null,
    p99: t.p99MaxDurationMs ?? gThresh.p99MaxDurationMs ?? null,
    maxErrorRatePct: (t.maxErrorRate ?? gThresh.maxErrorRate ?? 0.01) * 100
  };

  const violations = [];

  if (limits.p50 !== null && stats.p50 > limits.p50) {
    violations.push(`p50 (${stats.p50.toFixed(1)}ms) exceeded SLA limit (${limits.p50}ms)`);
  }
  if (limits.p90 !== null && stats.p90 > limits.p90) {
    violations.push(`p90 (${stats.p90.toFixed(1)}ms) exceeded SLA limit (${limits.p90}ms)`);
  }
  if (limits.p95 !== null && stats.p95 > limits.p95) {
    violations.push(`p95 (${stats.p95.toFixed(1)}ms) exceeded SLA limit (${limits.p95}ms)`);
  }
  if (limits.p99 !== null && stats.p99 > limits.p99) {
    violations.push(`p99 (${stats.p99.toFixed(1)}ms) exceeded SLA limit (${limits.p99}ms)`);
  }
  if (errorRatePct > limits.maxErrorRatePct) {
    violations.push(`Error Rate (${errorRatePct.toFixed(2)}%) exceeded limit (${limits.maxErrorRatePct.toFixed(2)}%)`);
  }

  return {
    passed: violations.length === 0,
    violations,
    limits
  };
}

function collectGroupChecks(group, acc = []) {
  if (!group) return acc;
  if (Array.isArray(group.checks)) {
    group.checks.forEach((c) => acc.push(c));
  }
  if (Array.isArray(group.groups)) {
    group.groups.forEach((g) => collectGroupChecks(g, acc));
  }
  return acc;
}

function findEndpointGroupChecks(rootGroup, endpointId) {
  if (!rootGroup || !Array.isArray(rootGroup.groups)) return [];
  const found = rootGroup.groups.find((g) => g.name === endpointId);
  return found ? collectGroupChecks(found, []) : [];
}

function buildNavLinksHtml(enabledEndpoints, activeReportId) {
  const generalActive = activeReportId === 'general';
  const links = [
    `<a href="report-general.html" class="nav-pill ${generalActive ? 'active' : ''}">📊 General Report (${enabledEndpoints.length} Endpoints)</a>`,
    ...enabledEndpoints.map((ep) => {
      const isAct = activeReportId === ep.id;
      return `<a href="report-${escapeHtml(ep.id)}.html" class="nav-pill ${isAct ? 'active' : ''}">🔌 ${escapeHtml(ep.name || ep.id)}</a>`;
    }),
  ];
  return `<div class="nav-bar">${links.join('')}</div>`;
}

function buildCommonStyles(statusColor) {
  return `
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b1120; color: #f1f5f9; margin: 0; padding: 24px; line-height: 1.5; }
    .container { max-width: 1220px; margin: 0 auto; }
    .nav-bar { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; background: #1e293b; padding: 12px 16px; border-radius: 10px; border: 1px solid #334155; }
    .nav-pill { text-decoration: none; color: #cbd5e1; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; background: #0f172a; border: 1px solid #334155; transition: all 0.15s; }
    .nav-pill:hover { border-color: #38bdf8; color: #fff; }
    .nav-pill.active { background: #0284c7; color: #fff; border-color: #38bdf8; }
    .header { background: #1e293b; padding: 24px; border-radius: 12px; margin-bottom: 20px; border-left: 6px solid ${statusColor}; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; border-top: 1px solid #334155; border-right: 1px solid #334155; border-bottom: 1px solid #334155; }
    .title { font-size: 24px; font-weight: 800; margin: 0; color: #f8fafc; }
    .subtitle { color: #94a3b8; font-size: 13px; margin-top: 6px; }
    .badge { padding: 8px 16px; border-radius: 999px; font-weight: 700; font-size: 13px; background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); gap: 14px; margin-bottom: 22px; }
    .card { background: #1e293b; padding: 16px; border-radius: 10px; border: 1px solid #334155; }
    .card-label { font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.6px; font-weight: 600; }
    .card-val { font-size: 22px; font-weight: 800; margin-top: 6px; color: #38bdf8; }
    .card-sub { font-size: 12px; color: #64748b; margin-top: 4px; }
    .section { background: #1e293b; padding: 20px; border-radius: 10px; margin-bottom: 22px; border: 1px solid #334155; overflow-x: auto; }
    .section-title { font-size: 15px; font-weight: 700; margin-bottom: 14px; border-bottom: 1px solid #334155; padding-bottom: 8px; color: #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th { padding: 10px 12px; color: #94a3b8; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #334155; background: #0f172a; }
    td { padding: 10px 12px; border-bottom: 1px solid #334155; color: #e2e8f0; }
    tr:hover td { background: #0f172a66; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; background: #0f172a; border: 1px solid #475569; color: #38bdf8; margin: 2px; font-family: monospace; }
    .code-box { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 14px; font-family: monospace; font-size: 12px; color: #cbd5e1; overflow-x: auto; max-height: 360px; white-space: pre; }
    .two-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 18px; }
  `;
}

function buildTimingsTableHtml(timingsMap) {
  const rows = [
    { label: 'Total Request Duration (http_req_duration)', stats: timingsMap.duration, highlight: true },
    { label: 'Server Waiting / TTFB (http_req_waiting)', stats: timingsMap.waiting },
    { label: 'Queued / Blocked (http_req_blocked)', stats: timingsMap.blocked },
    { label: 'TCP Connecting (http_req_connecting)', stats: timingsMap.connecting },
    { label: 'TLS/SSL Handshake (http_req_tls_handshaking)', stats: timingsMap.tls },
    { label: 'Request Sending (http_req_sending)', stats: timingsMap.sending },
    { label: 'Response Receiving (http_req_receiving)', stats: timingsMap.receiving },
  ];

  return `
    <table>
      <thead>
        <tr>
          <th>HTTP Timing Metric (k6)</th>
          <th>Min</th>
          <th>p50 (Median)</th>
          <th>Average (Avg)</th>
          <th>p90</th>
          <th>p95</th>
          <th>p99</th>
          <th>Max</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr style="${r.highlight ? 'background:#0284c715; font-weight:600;' : ''}">
            <td>${escapeHtml(r.label)}</td>
            <td>${formatDuration(r.stats.min)}</td>
            <td style="color:#38bdf8; font-weight:700;">${formatDuration(r.stats.p50)}</td>
            <td>${formatDuration(r.stats.avg)}</td>
            <td>${formatDuration(r.stats.p90)}</td>
            <td style="color:#f59e0b; font-weight:700;">${formatDuration(r.stats.p95)}</td>
            <td style="color:#f43f5e; font-weight:700;">${formatDuration(r.stats.p99)}</td>
            <td>${formatDuration(r.stats.max)}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function buildChecksTableHtml(checksList) {
  if (!checksList || checksList.length === 0) {
    return `<p style="color:#94a3b8; margin:0;">No assertions were recorded in this test run.</p>`;
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Assertion / Check</th>
          <th>Passed</th>
          <th>Failed</th>
          <th>Pass Rate</th>
        </tr>
      </thead>
      <tbody>
        ${checksList
          .map((c) => {
            const total = (c.passes || 0) + (c.fails || 0);
            const pct = total > 0 ? ((c.passes / total) * 100).toFixed(2) : '100.00';
            const ok = (c.fails || 0) === 0;
            return `
            <tr>
              <td>${ok ? '✅' : '❌'} <strong>${escapeHtml(c.name)}</strong></td>
              <td style="color:#10b981; font-weight:700;">${c.passes || 0}</td>
              <td style="color:${ok ? '#64748b' : '#ef4444'}; font-weight:700;">${c.fails || 0}</td>
              <td><span class="tag" style="color:${ok ? '#10b981' : '#ef4444'};">${pct}%</span></td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>
  `;
}

/**
 * Extracts metrics for a single endpoint from k6 summary data
 */
function extractEndpointMetrics(data, ep) {
  const m = data.metrics || {};
  const prefix = `ep_${ep.id}`;

  const totalReqs = m[`${prefix}_reqs`]?.values?.count || 0;
  const rps = m[`${prefix}_reqs`]?.values?.rate || 0;
  const failedReqs = m[`${prefix}_failed`]?.values?.passes || 0;
  const successReqs = Math.max(0, totalReqs - failedReqs);
  const errorRatePct = m[`${prefix}_failed`]?.values?.rate
    ? m[`${prefix}_failed`].values.rate * 100
    : 0;

  const dataSent = m[`${prefix}_data_sent`]?.values?.count || 0;
  const dataReceived = m[`${prefix}_data_received`]?.values?.count || 0;

  const timings = {
    duration: extractTrendStats(m[`${prefix}_duration`]),
    waiting: extractTrendStats(m[`${prefix}_waiting`]),
    blocked: extractTrendStats(m[`${prefix}_blocked`]),
    connecting: extractTrendStats(m[`${prefix}_connecting`]),
    tls: extractTrendStats(m[`${prefix}_tls_handshaking`]),
    sending: extractTrendStats(m[`${prefix}_sending`]),
    receiving: extractTrendStats(m[`${prefix}_receiving`]),
  };

  const rawChecks = findEndpointGroupChecks(data.root_group, ep.id);
  const checks = rawChecks.filter((c) => !c.name.startsWith('__VALET_'));
  const peakVUs = Array.isArray(ep.usersPerStage) ? Math.max(...ep.usersPerStage, 0) : 0;

  // Extract dynamically tracked metadata from all checks in the test run
  const allChecks = collectGroupChecks(data.root_group, []);

  // 1. Used IDs for this endpoint
  const usedIdPrefix = `__VALET_USED_ID__:${ep.id}:`;
  const usedIds = allChecks
    .filter((c) => c.name.startsWith(usedIdPrefix))
    .map((c) => c.name.slice(usedIdPrefix.length));

  // 2. Tickets Issued (for callKioskIssueTicket2)
  const ticketsIssuedPrefix = '__VALET_TICKET_ISSUED__:';
  const ticketsIssued = allChecks
    .filter((c) => c.name.startsWith(ticketsIssuedPrefix))
    .map((c) => {
      const parts = c.name.slice(ticketsIssuedPrefix.length).split(':');
      return { ticketID: parts[0], ticketNumber: parts[1] || '' };
    });

  // 3. Tickets Queried (for callKioskGetTicket)
  const ticketsQueriedPrefix = '__VALET_TICKET_QUERIED__:';
  const ticketsQueried = allChecks
    .filter((c) => c.name.startsWith(ticketsQueriedPrefix))
    .map((c) => c.name.slice(ticketsQueriedPrefix.length));

  // 4. Tickets Completed (for callKioskCompleteTicket1)
  const ticketsCompletedPrefix = '__VALET_TICKET_COMPLETED__:';
  const ticketsCompleted = allChecks
    .filter((c) => c.name.startsWith(ticketsCompletedPrefix))
    .map((c) => {
      const parts = c.name.slice(ticketsCompletedPrefix.length).split(':');
      return { ticketID: parts[0], ticketNumber: parts[1] || '' };
    });

  return {
    id: ep.id,
    name: ep.name || ep.id,
    displayName: ep.displayName || ep.name || ep.id,
    service: ep.service,
    protocol: ep.protocol || 'SOAP',
    soapVersion: ep.soapVersion || '1.1',
    operationName: ep.operationName || '',
    timeout: ep.timeout || '60s',
    thinkTimeSec: ep.thinkTimeSec ?? 1,
    usersPerStage: ep.usersPerStage || [],
    peakVUs,
    data: ep.data || {},
    thresholds: ep.thresholds || {},
    assertionsConfig: ep.assertions || [],
    totalReqs,
    rps,
    successReqs,
    failedReqs,
    errorRatePct,
    dataSent,
    dataReceived,
    timings,
    checks,
    usedIds,
    ticketsIssued,
    ticketsQueried,
    ticketsCompleted,
  };
}

function buildExecutedTicketsHtml(epMetrics) {
  if (epMetrics.id === 'callKioskIssueTicket2') {
    const list = epMetrics.ticketsIssued || [];
    if (list.length === 0) {
      return `
      <div style="margin-top:16px; padding:12px; background:#0f172a; border-radius:8px; border:1px solid #334155;">
        <div style="font-size:13px; font-weight:700; color:#38bdf8; margin-bottom:4px;">🎟️ Tickets Created / Issued:</div>
        <div style="color:#94a3b8; font-size:12px;">No ticket creation records captured during this run.</div>
      </div>`;
    }
    return `
    <div style="margin-top:16px; padding:12px; background:#0f172a; border-radius:8px; border:1px solid #334155;">
      <div style="font-size:13px; font-weight:700; color:#38bdf8; margin-bottom:8px;">
        🎟️ Tickets Created / Issued (${list.length} tickets):
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        ${list
          .map(
            (t, idx) => `
          <div style="font-size:12px; font-family:monospace; background:#1e293b; padding:6px 10px; border-radius:6px; border:1px solid #475569; display:flex; align-items:center; gap:8px;">
            <span style="color:#94a3b8; font-weight:bold;">#${idx + 1}</span>
            <span style="color:#e2e8f0;">TicketID: <strong style="color:#38bdf8;">${escapeHtml(t.ticketID)}</strong></span>
            ${t.ticketNumber ? `<span style="color:#cbd5e1; margin-left:auto;">Ticket Number: <code style="color:#34d399;">${escapeHtml(t.ticketNumber)}</code></span>` : ''}
          </div>`
          )
          .join('')}
      </div>
    </div>`;
  }

  if (epMetrics.id === 'callKioskGetTicket') {
    const list = epMetrics.ticketsQueried || [];
    if (list.length === 0) {
      return `
      <div style="margin-top:16px; padding:12px; background:#0f172a; border-radius:8px; border:1px solid #334155;">
        <div style="font-size:13px; font-weight:700; color:#38bdf8; margin-bottom:4px;">🔍 Tickets Queried / Called:</div>
        <div style="color:#94a3b8; font-size:12px;">No ticket query records captured during this run.</div>
      </div>`;
    }
    return `
    <div style="margin-top:16px; padding:12px; background:#0f172a; border-radius:8px; border:1px solid #334155;">
      <div style="font-size:13px; font-weight:700; color:#38bdf8; margin-bottom:8px;">
        🔍 Tickets Queried / Called (${list.length} tickets):
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        ${list
          .map(
            (tid, idx) => `
          <div style="font-size:12px; font-family:monospace; background:#1e293b; padding:6px 10px; border-radius:6px; border:1px solid #475569; display:flex; align-items:center; gap:8px;">
            <span style="color:#94a3b8; font-weight:bold;">#${idx + 1}</span>
            <span style="color:#e2e8f0;">Queried TicketID: <strong style="color:#38bdf8;">${escapeHtml(tid)}</strong></span>
          </div>`
          )
          .join('')}
      </div>
    </div>`;
  }

  if (epMetrics.id === 'callKioskCompleteTicket1') {
    const list = epMetrics.ticketsCompleted || [];
    if (list.length === 0) {
      return `
      <div style="margin-top:16px; padding:12px; background:#0f172a; border-radius:8px; border:1px solid #334155;">
        <div style="font-size:13px; font-weight:700; color:#38bdf8; margin-bottom:4px;">✅ Tickets Completed:</div>
        <div style="color:#94a3b8; font-size:12px;">No ticket completion records captured during this run.</div>
      </div>`;
    }
    return `
    <div style="margin-top:16px; padding:12px; background:#0f172a; border-radius:8px; border:1px solid #334155;">
      <div style="font-size:13px; font-weight:700; color:#38bdf8; margin-bottom:8px;">
        ✅ Tickets Completed (${list.length} tickets):
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        ${list
          .map(
            (t, idx) => `
          <div style="font-size:12px; font-family:monospace; background:#1e293b; padding:6px 10px; border-radius:6px; border:1px solid #475569; display:flex; align-items:center; gap:8px;">
            <span style="color:#94a3b8; font-weight:bold;">#${idx + 1}</span>
            <span style="color:#e2e8f0;">Completed TicketID: <strong style="color:#38bdf8;">${escapeHtml(t.ticketID)}</strong></span>
            ${t.ticketNumber ? `<span style="color:#cbd5e1; margin-left:auto;">Ticket Number: <code style="color:#34d399;">${escapeHtml(t.ticketNumber)}</code></span>` : ''}
          </div>`
          )
          .join('')}
      </div>
    </div>`;
  }

  return '';
}

function renderExecutedIdsAndTicketsHtml(epMetrics) {
  const usedList = epMetrics.usedIds || [];
  const idKeys = ['locationIds', 'kioskIds', 'userGuids', 'tokens', 'customIds'].filter((k) =>
    Array.isArray(epMetrics.data?.[k])
  );

  let primaryIdHtml = '';
  if (usedList.length > 0) {
    const primaryKey = idKeys[0] || 'IDs';
    primaryIdHtml = `
      <div>
        <div style="font-size:12px; color:#94a3b8; margin-bottom:6px;">
          <strong>${escapeHtml(primaryKey)}</strong> (${usedList.length} unique ID${usedList.length === 1 ? '' : 's'} used during run | Selection Mode: <code>${escapeHtml(epMetrics.data?.selectionMode || 'random')}</code> | XML Tag: <code>&lt;${escapeHtml(epMetrics.data?.xmlElement || 'id')}&gt;</code>):
        </div>
        <div>
          ${usedList.map((id) => `<span class="tag" style="background:#0284c722; color:#38bdf8; border-color:#0284c7;">${escapeHtml(id)}</span>`).join('')}
        </div>
      </div>`;
  } else if (idKeys.length > 0) {
    primaryIdHtml = `<p style="color:#94a3b8; margin:0;">No IDs from the configured pool were selected during this run.</p>`;
  } else {
    primaryIdHtml = `<p style="color:#94a3b8; margin:0;">No specific ID list configured.</p>`;
  }

  const ticketsHtml = buildExecutedTicketsHtml(epMetrics);

  return primaryIdHtml + ticketsHtml;
}

/**
 * Generates HTML report for a single Endpoint
 */
function renderEndpointHtml(scriptConfig, epMetrics, enabledEndpoints, runTimestamp) {
  const globalCfg = scriptConfig.globalConfig || {};
  const stages = globalCfg.stages || [];
  const evalResult = evaluateThresholds(
    epMetrics.timings.duration,
    epMetrics.errorRatePct,
    epMetrics.thresholds,
    globalCfg.thresholds
  );

  const isPassed = evalResult.passed;
  const statusColor = isPassed ? '#10b981' : '#ef4444';
  const statusBadge = isPassed ? 'PASSED' : 'SLA THRESHOLD EXCEEDED';
  const maxErrAllowedPct = evalResult.limits.maxErrorRatePct.toFixed(2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>k6 Report - ${escapeHtml(epMetrics.name)} (${escapeHtml(runTimestamp)})</title>
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
  <style>${buildCommonStyles(statusColor)}</style>
</head>
<body>
  <div class="container">
    ${buildNavLinksHtml(enabledEndpoints, epMetrics.id)}

    <div class="header">
      <div>
        <div class="title">🔌 Endpoint Report: ${escapeHtml(epMetrics.displayName)}</div>
        <div class="subtitle">
          Target: <strong>${escapeHtml(globalCfg.baseUrl)}${escapeHtml(epMetrics.service)}</strong> |
          Protocol: ${escapeHtml(epMetrics.protocol)} ${escapeHtml(epMetrics.soapVersion)} |
          Operation: <code>${escapeHtml(epMetrics.operationName)}</code> |
          Run Timestamp: ${escapeHtml(runTimestamp)}
        </div>
      </div>
      <div class="badge">${statusBadge}</div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-label">Total Requests</div>
        <div class="card-val">${epMetrics.totalReqs}</div>
        <div class="card-sub">${epMetrics.successReqs} OK / ${epMetrics.failedReqs} Failed (${epMetrics.rps.toFixed(2)} req/s)</div>
      </div>
      <div class="card">
        <div class="card-label">Error Rate</div>
        <div class="card-val" style="color:${epMetrics.errorRatePct > parseFloat(maxErrAllowedPct) ? '#ef4444' : '#10b981'};">${epMetrics.errorRatePct.toFixed(2)}%</div>
        <div class="card-sub">Limit: ${maxErrAllowedPct}%</div>
      </div>
      <div class="card">
        <div class="card-label">p50 (Median)</div>
        <div class="card-val" style="color:${evalResult.limits.p50 && epMetrics.timings.duration.p50 > evalResult.limits.p50 ? '#ef4444' : '#38bdf8'};">${formatDuration(epMetrics.timings.duration.p50)}</div>
        <div class="card-sub">${evalResult.limits.p50 ? `SLA: &le;${evalResult.limits.p50}ms` : `Avg: ${formatDuration(epMetrics.timings.duration.avg)}`}</div>
      </div>
      <div class="card">
        <div class="card-label">p90 Latency</div>
        <div class="card-val" style="color:${evalResult.limits.p90 && epMetrics.timings.duration.p90 > evalResult.limits.p90 ? '#ef4444' : '#818cf8'};">${formatDuration(epMetrics.timings.duration.p90)}</div>
        <div class="card-sub">${evalResult.limits.p90 ? `SLA: &le;${evalResult.limits.p90}ms` : `Min: ${formatDuration(epMetrics.timings.duration.min)}`}</div>
      </div>
      <div class="card">
        <div class="card-label">p95 Latency</div>
        <div class="card-val" style="color:${evalResult.limits.p95 && epMetrics.timings.duration.p95 > evalResult.limits.p95 ? '#ef4444' : '#f59e0b'};">${formatDuration(epMetrics.timings.duration.p95)}</div>
        <div class="card-sub">${evalResult.limits.p95 ? `SLA: &le;${evalResult.limits.p95}ms` : '95th Percentile'}</div>
      </div>
      <div class="card">
        <div class="card-label">p99 Latency</div>
        <div class="card-val" style="color:${evalResult.limits.p99 && epMetrics.timings.duration.p99 > evalResult.limits.p99 ? '#ef4444' : '#f43f5e'};">${formatDuration(epMetrics.timings.duration.p99)}</div>
        <div class="card-sub">${evalResult.limits.p99 ? `SLA: &le;${evalResult.limits.p99}ms` : `Max: ${formatDuration(epMetrics.timings.duration.max)}`}</div>
      </div>
      <div class="card">
        <div class="card-label">Peak VUs (Endpoint)</div>
        <div class="card-val">${epMetrics.peakVUs} VUs</div>
        <div class="card-sub">Timeout: ${escapeHtml(epMetrics.timeout)} | Sleep: ${epMetrics.thinkTimeSec}s</div>
      </div>
    </div>

    ${
      !isPassed
        ? `<div class="section" style="border-left: 5px solid #ef4444; background: #450a0a22;">
            <div class="section-title" style="color:#f87171;">⚠️ SLA Threshold Violations Detected</div>
            <ul style="margin:0; padding-left:20px; color:#fca5a5; font-size:13px; line-height:1.7;">
              ${evalResult.violations.map((v) => `<li>${escapeHtml(v)}</li>`).join('')}
            </ul>
          </div>`
        : ''
    }

    <div class="section">
      <div class="section-title">
        <span>⏱️ Full HTTP Timing Breakdown (p50, p90, p95, p99, Avg, Min, Max)</span>
      </div>
      ${buildTimingsTableHtml(epMetrics.timings)}
    </div>

    <div class="section">
      <div class="section-title">
        <span>✅ Executed Assertions (${epMetrics.checks.length})</span>
      </div>
      ${buildChecksTableHtml(epMetrics.checks)}
    </div>

    <div class="two-col">
      <div class="section">
        <div class="section-title">📈 Configured Stages & Target VUs</div>
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th>Duration (Global)</th>
              <th>Target Users (VUs)</th>
            </tr>
          </thead>
          <tbody>
            ${stages
              .map(
                (st, i) => `
              <tr>
                <td><strong>Stage ${i + 1}</strong> ${st.name ? `(${escapeHtml(st.name)})` : ''}</td>
                <td><code>${escapeHtml(st.duration)}</code></td>
                <td style="color:#38bdf8; font-weight:700;">${epMetrics.usersPerStage[i] ?? 0} VUs</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div class="section">
        <div class="section-title">🌐 Traffic & Execution Parameters</div>
        <p style="margin:6px 0;"><strong>Data Sent:</strong> ${formatBytes(epMetrics.dataSent)}</p>
        <p style="margin:6px 0;"><strong>Data Received:</strong> ${formatBytes(epMetrics.dataReceived)}</p>
        <p style="margin:6px 0;"><strong>Configured Timeout:</strong> <code>${escapeHtml(epMetrics.timeout)}</code></p>
        <p style="margin:6px 0;"><strong>Think Time (Sleep):</strong> <code>${epMetrics.thinkTimeSec}s</code></p>
        <p style="margin:6px 0;"><strong>Date Range:</strong> ${epMetrics.data?.dateRange?.enabled ? `${escapeHtml(epMetrics.data.dateRange.fromMin)} to ${escapeHtml(epMetrics.data.dateRange.fromMax)}` : 'Not used'}</p>
        <p style="margin:6px 0;"><strong>Quantities (Counts):</strong> ${epMetrics.data?.quantities?.enabled ? `Min: ${epMetrics.data.quantities.min} / Max: ${epMetrics.data.quantities.max}` : 'Not used'}</p>
      </div>
    </div>

    <div class="section">
      <div class="section-title">🗂️ IDs & Specific Data Executed in this Run</div>
      ${renderExecutedIdsAndTicketsHtml(epMetrics)}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates the General Consolidated HTML Report across all tested endpoints
 */
function renderGeneralHtml(scriptConfig, data, endpointMetricsList, runTimestamp) {
  const m = data.metrics || {};
  const globalCfg = scriptConfig.globalConfig || {};
  const stages = globalCfg.stages || [];

  const totalReqs = m.http_reqs?.values?.count || 0;
  const rps = m.http_reqs?.values?.rate || 0;
  const failedReqs = m.http_req_failed?.values?.passes || 0;
  const successReqs = Math.max(0, totalReqs - failedReqs);
  const errorRatePct = m.http_req_failed?.values?.rate ? m.http_req_failed.values.rate * 100 : 0;

  const dataSent = m.data_sent?.values?.count || 0;
  const dataReceived = m.data_received?.values?.count || 0;
  const maxVUs = m.vus_max?.values?.value || m.vus?.values?.value || 0;
  const iterations = m.iterations?.values?.count || 0;
  const testRunDurationSec = data.state?.testRunDurationMs
    ? (data.state.testRunDurationMs / 1000).toFixed(2)
    : 'N/A';

  const globalTimings = {
    duration: extractTrendStats(m.http_req_duration),
    waiting: extractTrendStats(m.http_req_waiting),
    blocked: extractTrendStats(m.http_req_blocked),
    connecting: extractTrendStats(m.http_req_connecting),
    tls: extractTrendStats(m.http_req_tls_handshaking),
    sending: extractTrendStats(m.http_req_sending),
    receiving: extractTrendStats(m.http_req_receiving),
  };

  const allChecks = collectGroupChecks(data.root_group, []);

  // Compute effective global thresholds taking into account endpoints with higher defaults
  const maxEpP50 = Math.max(...endpointMetricsList.map(e => e.thresholds?.p50MaxDurationMs || 0), 0);
  const maxEpP90 = Math.max(...endpointMetricsList.map(e => e.thresholds?.p90MaxDurationMs || 0), 0);
  const maxEpP95 = Math.max(...endpointMetricsList.map(e => e.thresholds?.p95MaxDurationMs || 0), 0);
  const maxEpP99 = Math.max(...endpointMetricsList.map(e => e.thresholds?.p99MaxDurationMs || 0), 0);

  const effectiveGlobalThresholds = {
    ...globalCfg.thresholds,
    p50MaxDurationMs: Math.max(globalCfg.thresholds?.p50MaxDurationMs || 0, maxEpP50) || undefined,
    p90MaxDurationMs: Math.max(globalCfg.thresholds?.p90MaxDurationMs || 0, maxEpP90) || undefined,
    p95MaxDurationMs: Math.max(globalCfg.thresholds?.p95MaxDurationMs || 0, maxEpP95) || undefined,
    p99MaxDurationMs: Math.max(globalCfg.thresholds?.p99MaxDurationMs || 0, maxEpP99) || undefined,
  };

  // Evaluate global thresholds using the effective thresholds
  const globalEval = evaluateThresholds(
    globalTimings.duration,
    errorRatePct,
    effectiveGlobalThresholds,
    effectiveGlobalThresholds
  );

  // Detect configuration / unreachable host errors (e.g. DNS failure, invalid domain, connection refused)
  // When domain does not exist or host is unreachable, 100% of requests fail with 0 data received or failedReqs === totalReqs
  const isHostUnreachable = totalReqs > 0 && (failedReqs === totalReqs) && (dataReceived === 0 || globalTimings.duration.avg < 15);

  // Check if any individual endpoint failed its SLA threshold
  const anyEndpointFailed = endpointMetricsList.some((ep) => {
    const res = evaluateThresholds(ep.timings.duration, ep.errorRatePct, ep.thresholds, globalCfg.thresholds);
    return !res.passed;
  });

  const overallPassed = !isHostUnreachable && globalEval.passed && !anyEndpointFailed;
  let statusColor = '#10b981';
  let statusBadge = 'PASSED';

  if (isHostUnreachable) {
    statusColor = '#ef4444';
    statusBadge = 'CONFIG ERROR: HOST UNREACHABLE';
  } else if (!overallPassed) {
    statusColor = '#f59e0b';
    statusBadge = 'SLA THRESHOLD EXCEEDED';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>General k6 Report (${escapeHtml(runTimestamp)})</title>
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
  <style>${buildCommonStyles(statusColor)}</style>
</head>
<body>
  <div class="container">
    ${buildNavLinksHtml(endpointMetricsList, 'general')}

    <div class="header">
      <div>
        <div class="title">📊 Consolidated General Report (All Requests)</div>
        <div class="subtitle">
          Base URL: <strong>${escapeHtml(globalCfg.baseUrl)}</strong> |
          Tested Endpoints: <strong>${endpointMetricsList.length}</strong> |
          Total Run Duration: <strong>${testRunDurationSec}s</strong> |
          Timestamp: <strong>${escapeHtml(runTimestamp)}</strong>
        </div>
      </div>
      <div class="badge">${statusBadge}</div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-label">Total Requests (Global)</div>
        <div class="card-val">${totalReqs}</div>
        <div class="card-sub">${successReqs} OK / ${failedReqs} Failed (${rps.toFixed(2)} req/s)</div>
      </div>
      <div class="card">
        <div class="card-label">Global Error Rate</div>
        <div class="card-val" style="color:${errorRatePct > globalEval.limits.maxErrorRatePct ? '#ef4444' : '#10b981'};">${errorRatePct.toFixed(2)}%</div>
        <div class="card-sub">Limit: ${globalEval.limits.maxErrorRatePct.toFixed(2)}%</div>
      </div>
      <div class="card">
        <div class="card-label">Global p50 (Median)</div>
        <div class="card-val" style="color:${globalEval.limits.p50 && globalTimings.duration.p50 > globalEval.limits.p50 ? '#ef4444' : '#38bdf8'};">${formatDuration(globalTimings.duration.p50)}</div>
        <div class="card-sub">${globalEval.limits.p50 ? `SLA: &le;${globalEval.limits.p50}ms` : `Avg: ${formatDuration(globalTimings.duration.avg)}`}</div>
      </div>
      <div class="card">
        <div class="card-label">Global p90</div>
        <div class="card-val" style="color:${globalEval.limits.p90 && globalTimings.duration.p90 > globalEval.limits.p90 ? '#ef4444' : '#818cf8'};">${formatDuration(globalTimings.duration.p90)}</div>
        <div class="card-sub">${globalEval.limits.p90 ? `SLA: &le;${globalEval.limits.p90}ms` : `Min: ${formatDuration(globalTimings.duration.min)}`}</div>
      </div>
      <div class="card">
        <div class="card-label">Global p95</div>
        <div class="card-val" style="color:${globalEval.limits.p95 && globalTimings.duration.p95 > globalEval.limits.p95 ? '#ef4444' : '#f59e0b'};">${formatDuration(globalTimings.duration.p95)}</div>
        <div class="card-sub">${globalEval.limits.p95 ? `SLA: &le;${globalEval.limits.p95}ms` : '95th Percentile'}</div>
      </div>
      <div class="card">
        <div class="card-label">Global p99</div>
        <div class="card-val" style="color:${globalEval.limits.p99 && globalTimings.duration.p99 > globalEval.limits.p99 ? '#ef4444' : '#f43f5e'};">${formatDuration(globalTimings.duration.p99)}</div>
        <div class="card-sub">${globalEval.limits.p99 ? `SLA: &le;${globalEval.limits.p99}ms` : `Max: ${formatDuration(globalTimings.duration.max)}`}</div>
      </div>
      <div class="card">
        <div class="card-label">Peak Concurrent VUs</div>
        <div class="card-val">${maxVUs} VUs</div>
        <div class="card-sub">Rx: ${formatBytes(dataReceived)} | Tx: ${formatBytes(dataSent)}</div>
      </div>
    </div>

    ${
      isHostUnreachable
        ? `<div class="section" style="border-left: 5px solid #ef4444; background: #450a0a33;">
            <div class="section-title" style="color:#f87171;">🚫 Infrastructure / Host Error (Not an SLA Timeout)</div>
            <p style="color:#fca5a5; font-size:13px; margin:0 0 8px 0; line-height:1.6;">
              <strong>Host is unreachable or domain could not be resolved.</strong> 100% of the requests failed immediately with no valid HTTP response from <code>${escapeHtml(globalCfg.baseUrl)}</code>.
            </p>
            <p style="color:#cbd5e1; font-size:12px; margin:0;">
              Please verify that the host domain name is typed correctly, that DNS resolution succeeds, and that the server port is accepting connections.
            </p>
          </div>`
        : (!overallPassed
            ? `<div class="section" style="border-left: 5px solid #f59e0b; background: #451a0333;">
                <div class="section-title" style="color:#fbbf24;">⚠️ SLA Threshold Status / Violations</div>
                <ul style="margin:0; padding-left:20px; color:#fde68a; font-size:13px; line-height:1.7;">
                  ${globalEval.violations.map((v) => `<li>[Global] ${escapeHtml(v)}</li>`).join('')}
                  ${endpointMetricsList
                    .map((ep) => {
                      const r = evaluateThresholds(ep.timings.duration, ep.errorRatePct, ep.thresholds, globalCfg.thresholds);
                      return r.violations.map((v) => `<li>[${escapeHtml(ep.name)}] ${escapeHtml(v)}</li>`).join('');
                    })
                    .filter(Boolean)
                    .join('')}
                </ul>
              </div>`
            : '')
    }

    <div class="section">
      <div class="section-title">
        <span>🔍 Endpoint Comparison (Click any endpoint to view its dedicated report)</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>Service</th>
            <th>SLA Status</th>
            <th>Peak VUs</th>
            <th>Requests (RPS)</th>
            <th>Error %</th>
            <th>Min</th>
            <th>p50 (Median)</th>
            <th>Avg</th>
            <th>p90</th>
            <th>p95</th>
            <th>p99</th>
            <th>Max</th>
            <th>Endpoint Report</th>
          </tr>
        </thead>
        <tbody>
          ${endpointMetricsList
            .map((ep) => {
              const epEval = evaluateThresholds(
                ep.timings.duration,
                ep.errorRatePct,
                ep.thresholds,
                globalCfg.thresholds
              );
              const epPassed = epEval.passed;
              const epP50Exceeded = epEval.limits.p50 && ep.timings.duration.p50 > epEval.limits.p50;
              const epP90Exceeded = epEval.limits.p90 && ep.timings.duration.p90 > epEval.limits.p90;
              const epP95Exceeded = epEval.limits.p95 && ep.timings.duration.p95 > epEval.limits.p95;
              const epP99Exceeded = epEval.limits.p99 && ep.timings.duration.p99 > epEval.limits.p99;
              const epErrExceeded = ep.errorRatePct > epEval.limits.maxErrorRatePct;

              return `
            <tr style="${!epPassed ? 'background: #450a0a1a;' : ''}">
              <td><strong>${escapeHtml(ep.name)}</strong></td>
              <td><code>${escapeHtml(ep.service)}</code></td>
              <td>
                <span class="tag" style="color:${epPassed ? '#10b981' : '#ef4444'}; border-color:${epPassed ? '#10b98166' : '#ef444466'}; font-weight:700;">
                  ${epPassed ? 'PASS' : 'FAIL'}
                </span>
              </td>
              <td>${ep.peakVUs}</td>
              <td>${ep.totalReqs} <span style="color:#94a3b8;">(${ep.rps.toFixed(2)}/s)</span></td>
              <td style="color:${epErrExceeded ? '#ef4444' : '#10b981'}; font-weight:700;">${ep.errorRatePct.toFixed(2)}%</td>
              <td>${formatDuration(ep.timings.duration.min)}</td>
              <td style="color:${epP50Exceeded ? '#ef4444' : '#38bdf8'}; font-weight:700;">${formatDuration(ep.timings.duration.p50)}</td>
              <td>${formatDuration(ep.timings.duration.avg)}</td>
              <td style="color:${epP90Exceeded ? '#ef4444' : '#818cf8'}; font-weight:700;">${formatDuration(ep.timings.duration.p90)}</td>
              <td style="color:${epP95Exceeded ? '#ef4444' : '#f59e0b'}; font-weight:700;">${formatDuration(ep.timings.duration.p95)}</td>
              <td style="color:${epP99Exceeded ? '#ef4444' : '#f43f5e'}; font-weight:700;">${formatDuration(ep.timings.duration.p99)}</td>
              <td>${formatDuration(ep.timings.duration.max)}</td>
              <td style="white-space: nowrap;"><a href="report-${escapeHtml(ep.id)}.html" class="nav-pill" style="padding:4px 10px; font-size:12px; display:inline-block; white-space:nowrap; text-align:center;">View HTML →</a></td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">
        <span>⏱️ Global HTTP Timing Breakdown (All Requests Combined)</span>
      </div>
      ${buildTimingsTableHtml(globalTimings)}
    </div>

    <div class="section">
      <div class="section-title">
        <span>✅ All Executed Assertions / Checks</span>
      </div>
      ${buildChecksTableHtml(allChecks)}
    </div>

    ${
      Array.isArray(scriptConfig.scenarios) && scriptConfig.scenarios.length > 0
        ? `<div class="section">
            <div class="section-title">
              <span>📋 Scenarios & Sequential Steps Execution Plan</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>VUs per Stage</th>
                  <th>Sequential Steps (Drag & Drop Order)</th>
                </tr>
              </thead>
              <tbody>
                ${scriptConfig.scenarios
                  .filter((sc) => sc && sc.enabled !== false)
                  .map(
                    (sc) => `
                  <tr>
                    <td><strong>${escapeHtml(sc.name || sc.id)}</strong></td>
                    <td><code>[${(sc.usersPerStage || []).join(', ')}] VUs</code></td>
                    <td>
                      ${(sc.steps || [])
                        .map(
                          (st, idx) =>
                            `<span class="tag">Step ${idx + 1}: ${escapeHtml(st.name || st.endpointId || st.id)} (${escapeHtml(st.thinkTimeSec ?? 1)}s sleep)</span>`
                        )
                        .join(' → ')}
                    </td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>`
        : ''
    }

    <div class="section">
      <div class="section-title">
        <span>📐 Global Stages & Target VUs Matrix by Endpoint</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Stage</th>
            <th>Global Duration</th>
            ${endpointMetricsList.map((ep) => `<th>VUs: ${escapeHtml(ep.name)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${stages
            .map(
              (st, idx) => `
            <tr>
              <td><strong>Stage ${idx + 1}</strong> ${st.name ? `(${escapeHtml(st.name)})` : ''}</td>
              <td><code>${escapeHtml(st.duration)}</code></td>
              ${endpointMetricsList
                .map(
                  (ep) => `<td style="color:#38bdf8; font-weight:700;">${ep.usersPerStage[idx] ?? 0} VUs</td>`
                )
                .join('')}
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">
        <span>📜 Exact Executed Configuration (test-performance-script.json)</span>
      </div>
      <div class="code-box">${escapeHtml(JSON.stringify(scriptConfig, null, 2))}</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Extracts distinct enabled endpoints from either `scriptConfig.scenarios` or `scriptConfig.endpoints`
 */
function resolveEnabledEndpoints(scriptConfig) {
  if (Array.isArray(scriptConfig.scenarios) && scriptConfig.scenarios.length > 0) {
    const map = {};
    scriptConfig.scenarios
      .filter((sc) => sc && sc.enabled !== false)
      .forEach((sc) => {
        (sc.steps || []).forEach((step) => {
          if (!step || step.enabled === false) return;
          const epId = step.endpointId || step.id;
          if (!epId) return;
          if (!map[epId]) {
            map[epId] = {
              ...step,
              id: epId,
              endpointId: epId,
              enabled: true,
              usersPerStage: Array.isArray(sc.usersPerStage) ? [...sc.usersPerStage] : []
            };
          } else if (Array.isArray(sc.usersPerStage)) {
            map[epId].usersPerStage = sc.usersPerStage.map(
              (vu, i) => Math.max(map[epId].usersPerStage[i] || 0, vu || 0)
            );
          }
        });
      });
    return Object.values(map);
  }
  return (scriptConfig.endpoints || []).filter((e) => e && e.enabled !== false);
}

/**
 * Main entry point invoked by k6's handleSummary(data)
 */
export function generateMultiReports(data, scriptConfig, outputDir, runTimestamp) {
  const cleanDir = (outputDir || 'reports/latest').replace(/\/+$/, '');
  const enabledEndpoints = resolveEnabledEndpoints(scriptConfig);

  const endpointMetricsList = enabledEndpoints.map((ep) => extractEndpointMetrics(data, ep));

  const outputs = {};

  // 1. General HTML report
  outputs[`${cleanDir}/report-general.html`] = renderGeneralHtml(
    scriptConfig,
    data,
    endpointMetricsList,
    runTimestamp
  );

  // 2. Per-endpoint HTML reports
  endpointMetricsList.forEach((epMetrics) => {
    outputs[`${cleanDir}/report-${epMetrics.id}.html`] = renderEndpointHtml(
      scriptConfig,
      epMetrics,
      endpointMetricsList,
      runTimestamp
    );
  });

  // 3. Raw summary JSON including parsed per-endpoint summary for easy UI history inspection
  const globalTimingsDuration = extractTrendStats(data.metrics?.http_req_duration);
  const globalErrorRatePct = data.metrics?.http_req_failed?.values?.rate
    ? data.metrics.http_req_failed.values.rate * 100
    : 0;

  const globalEvalSummary = evaluateThresholds(
    globalTimingsDuration,
    globalErrorRatePct,
    scriptConfig.globalConfig?.thresholds,
    scriptConfig.globalConfig?.thresholds
  );

  const endpointsSummary = endpointMetricsList.map((ep) => {
    const epEval = evaluateThresholds(
      ep.timings.duration,
      ep.errorRatePct,
      ep.thresholds,
      scriptConfig.globalConfig?.thresholds
    );
    return {
      id: ep.id,
      name: ep.name,
      service: ep.service,
      peakVUs: ep.peakVUs,
      totalReqs: ep.totalReqs,
      totalRequests: ep.totalReqs,
      rps: ep.rps,
      failedReqs: ep.failedReqs,
      errorRatePct: ep.errorRatePct,
      duration: ep.timings.duration,
      p50: ep.timings.duration.p50,
      p90: ep.timings.duration.p90,
      p95: ep.timings.duration.p95,
      p99: ep.timings.duration.p99,
      avg: ep.timings.duration.avg,
      min: ep.timings.duration.min,
      max: ep.timings.duration.max,
      thresholdsPassed: epEval.passed,
      violations: epEval.violations,
      limits: epEval.limits,
      reportFile: `report-${ep.id}.html`,
      usedIds: ep.usedIds || [],
      ticketsIssued: ep.ticketsIssued || [],
      ticketsQueried: ep.ticketsQueried || [],
      ticketsCompleted: ep.ticketsCompleted || [],
    };
  });

  const isHostUnreachableSummary = data.metrics?.http_reqs?.values?.count > 0 &&
    (data.metrics?.http_req_failed?.values?.passes === data.metrics?.http_reqs?.values?.count) &&
    ((data.metrics?.data_received?.values?.count || 0) === 0 || globalTimingsDuration.avg < 15);

  const allThresholdsPassed = !isHostUnreachableSummary && globalEvalSummary.passed && endpointsSummary.every((ep) => ep.thresholdsPassed);

  outputs[`${cleanDir}/raw-summary.json`] = JSON.stringify(
    {
      runTimestamp,
      scriptName: scriptConfig.scriptName || 'test-performance-script',
      baseUrl: scriptConfig.globalConfig?.baseUrl,
      stages: scriptConfig.globalConfig?.stages,
      scenarios: scriptConfig.scenarios || [],
      thresholdResults: {
        passed: allThresholdsPassed,
        failureType: isHostUnreachableSummary ? 'CONFIG_ERROR' : (!allThresholdsPassed ? 'SLA_EXCEEDED' : null),
        isHostUnreachable: isHostUnreachableSummary,
        globalPassed: globalEvalSummary.passed,
        globalViolations: globalEvalSummary.violations,
        globalLimits: globalEvalSummary.limits,
      },
      endpointsSummary,
    },
    null,
    2
  );

  return outputs;
}
