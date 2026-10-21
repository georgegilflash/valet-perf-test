import { config } from '../../config/env.js';

/**
 * Recursively collects checks from the root group and sub-groups
 */
function collectChecks(group, acc = []) {
  if (!group) return acc;
  if (Array.isArray(group.checks)) {
    group.checks.forEach((c) => acc.push(c));
  }
  if (Array.isArray(group.groups)) {
    group.groups.forEach((g) => collectChecks(g, acc));
  }
  return acc;
}

/**
 * Format bytes into human-readable string (B, KB, MB, GB)
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format milliseconds into seconds or ms
 */
function formatDuration(ms) {
  if (ms === undefined || ms === null || isNaN(ms)) return '0.00ms';
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s (${ms.toFixed(0)}ms)`;
  }
  return `${ms.toFixed(2)}ms`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Extracts trend statistics (min, p50, avg, p90, p95, p99, max) from a k6 metric object
 */
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
 * Formats a Date object as YYYY-MM-DD_HH-mm-ss for safe, non-overlapping report filenames
 */
function buildFileTimestamp(customTimestamp) {
  if (customTimestamp && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(customTimestamp.trim())) {
    return customTimestamp.trim();
  }
  const d = customTimestamp ? new Date(customTimestamp) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = validDate.getFullYear();
  const mm = pad(validDate.getMonth() + 1);
  const dd = pad(validDate.getDate());
  const hh = pad(validDate.getHours());
  const min = pad(validDate.getMinutes());
  const ss = pad(validDate.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

/**
 * Builds default endpoint metadata (service path, operation, SOAP template, parameters, thresholds)
 * for each suite, merged with any customMeta passed by the caller script.
 */
function resolveEndpointMetadata(safeName, customMeta = {}) {
  const ds = config.deviceSuite || {};
  const stages = customMeta.stages || config.stages || [];

  const defaultsBySuite = {
    'known-drivers': {
      displayName: 'Kiosk GetKnownDrivers',
      servicePath: '/device/kiosk.asmx',
      operationName: 'GetKnownDrivers',
      protocol: 'SOAP 1.2',
      contentType: 'application/soap+xml; charset=utf-8',
      soapAction: 'N/A (SOAP 1.2 operation in body)',
      timeout: '60s',
      thinkTimeSec: 1,
      thresholds: {
        p95MaxDurationMs: 5000,
        p99MaxDurationMs: 10000,
        maxErrorRate: config.thresholds.maxErrorRate,
      },
      parameters: [
        { label: 'FromDate Range (Random per call)', value: `${customMeta.fromMin || ds.knownDriversFromMin} -> ${customMeta.fromMax || ds.knownDriversFromMax}` },
        { label: 'Start Index', value: `${customMeta.start ?? ds.knownDriversStart ?? 0}` },
        { label: 'Count Range (Random per call)', value: `${customMeta.countMin ?? ds.knownDriversCountMin} -> ${customMeta.countMax ?? ds.knownDriversCountMax} (expects returned <= count)` },
        { label: 'Kiosk ID Pool Distribution', value: customMeta.kioskPoolInfo || 'kiosk-ids.json (1-to-1 per VU, cycles via (VU - 1) % poolSize)' },
      ],
      soapTemplate: `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:web="http://kleverlogic.com/webservices/">
   <soap:Header/>
   <soap:Body>
      <web:GetKnownDrivers>
         <web:kioskID>{{kioskID}} <!-- Pool: kiosk-ids.json ((VU - 1) % available) --></web:kioskID>
         <web:from>{{fromDate}} <!-- Random ISO UTC in [${customMeta.fromMin || ds.knownDriversFromMin} .. ${customMeta.fromMax || ds.knownDriversFromMax}] --></web:from>
         <web:start>${customMeta.start ?? ds.knownDriversStart ?? 0}</web:start>
         <web:count>{{count}} <!-- Random Int in [${customMeta.countMin ?? ds.knownDriversCountMin} .. ${customMeta.countMax ?? ds.knownDriversCountMax}] --></web:count>
      </web:GetKnownDrivers>
   </soap:Body>
</soap:Envelope>`,
    },

    'known-driver-changes': {
      displayName: 'Kiosk GetKnownDriverChanges',
      servicePath: '/device/kiosk.asmx',
      operationName: 'GetKnownDriverChanges',
      protocol: 'SOAP 1.2',
      contentType: 'application/soap+xml; charset=utf-8',
      soapAction: 'N/A (SOAP 1.2 operation in body)',
      timeout: '60s',
      thinkTimeSec: 1,
      thresholds: {
        p95MaxDurationMs: 5000,
        p99MaxDurationMs: 10000,
        maxErrorRate: config.thresholds.maxErrorRate,
      },
      parameters: [
        { label: 'Date Range Y-M-D (Random per call)', value: `${customMeta.dateMin || ds.knownDriverChangesDateMin} -> ${customMeta.dateMax || ds.knownDriverChangesDateMax} (expects matching date)` },
        { label: 'Total Range (Random per call)', value: `${customMeta.totalMin ?? ds.knownDriverChangesTotalMin} -> ${customMeta.totalMax ?? ds.knownDriverChangesTotalMax} (expects returned <= total)` },
        { label: 'Burnt Value', value: `${customMeta.burnt ?? ds.knownDriverChangesBurnt ?? 0}` },
        { label: 'Kiosk ID Pool Distribution', value: customMeta.kioskPoolInfo || 'kiosk-ids.json (1-to-1 per VU, cycles via (VU - 1) % poolSize)' },
      ],
      soapTemplate: `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <GetKnownDriverChanges xmlns="http://kleverlogic.com/webservices/">
      <kioskID>{{kioskID}} <!-- Pool: kiosk-ids.json ((VU - 1) % available) --></kioskID>
      <client>
        <DatabaseChange>
          <Year xmlns="urn:KleverLogic.FlashParcs.Web">{{Year}} <!-- Random Date in [${customMeta.dateMin || ds.knownDriverChangesDateMin} .. ${customMeta.dateMax || ds.knownDriverChangesDateMax}] --></Year>
          <Month xmlns="urn:KleverLogic.FlashParcs.Web">{{Month}}</Month>
          <Day xmlns="urn:KleverLogic.FlashParcs.Web">{{Day}}</Day>
          <Total xmlns="urn:KleverLogic.FlashParcs.Web">{{Total}} <!-- Random Int in [${customMeta.totalMin ?? ds.knownDriverChangesTotalMin} .. ${customMeta.totalMax ?? ds.knownDriverChangesTotalMax}] --></Total>
          <Burnt xmlns="urn:KleverLogic.FlashParcs.Web">${customMeta.burnt ?? ds.knownDriverChangesBurnt ?? 0}</Burnt>
        </DatabaseChange>
      </client>
    </GetKnownDriverChanges>
  </soap12:Body>
</soap12:Envelope>`,
    },

    kiosk: {
      displayName: 'Kiosk Ping',
      servicePath: '/device/kiosk.asmx',
      operationName: 'Ping',
      protocol: 'SOAP 1.1',
      contentType: 'text/xml; charset=utf-8',
      soapAction: '"http://kleverlogic.com/webservices/Ping"',
      timeout: '30s',
      thinkTimeSec: 0.5,
      thresholds: {
        p95MaxDurationMs: 2000,
        p99MaxDurationMs: 5000,
        maxErrorRate: config.thresholds.maxErrorRate,
      },
      parameters: [
        { label: 'Kiosk ID', value: ds.kioskId },
      ],
      soapTemplate: `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Ping xmlns="http://kleverlogic.com/webservices/">
      <kioskID>${ds.kioskId}</kioskID>
    </Ping>
  </soap:Body>
</soap:Envelope>`,
    },

    valet: {
      displayName: 'Valet Web Service',
      servicePath: config.soap?.endpoint || '/device/valet.asmx',
      operationName: customMeta.operationName || 'NewMessages4 / GetServerName',
      protocol: `SOAP ${config.soap?.version || '1.1'}`,
      contentType: config.soap?.version === '1.2' ? 'application/soap+xml; charset=utf-8' : 'text/xml; charset=utf-8',
      soapAction: config.soap?.action ? `"${config.soap.action}"` : 'N/A',
      timeout: config.timeout || '90s',
      thinkTimeSec: 1,
      thresholds: {
        p95MaxDurationMs: config.thresholds.p95MaxDuration,
        p99MaxDurationMs: config.thresholds.p99MaxDuration,
        maxErrorRate: config.thresholds.maxErrorRate,
      },
      parameters: [
        { label: 'Poll Seconds', value: `${config.soap?.pollSeconds ?? 60}s` },
        { label: 'Compressed', value: `${config.soap?.compressed ?? 'true'}` },
      ],
      soapTemplate: `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <NewMessages4 xmlns="http://kleverlogic.com/webservices/">
      <loginToken>{{loginToken}} <!-- Assigned per VU from tokens.json --></loginToken>
      <compressed>${config.soap?.compressed ?? 'true'}</compressed>
      <seconds>${config.soap?.pollSeconds ?? 60}</seconds>
    </NewMessages4>
  </soap:Body>
</soap:Envelope>`,
    },

    pms: {
      displayName: 'PMS NewMessages (Long-Poll)',
      servicePath: '/device/pms.asmx',
      operationName: 'NewMessages',
      protocol: 'SOAP 1.2',
      contentType: 'application/soap+xml; charset=utf-8',
      soapAction: 'N/A',
      timeout: '60s',
      thinkTimeSec: 1,
      thresholds: {
        p95MaxDurationMs: 65000,
        p99MaxDurationMs: 75000,
        maxErrorRate: config.thresholds.maxErrorRate,
      },
      parameters: [
        { label: 'Location ID Selection', value: 'Random from location-ids.json pool (or fallback COMPANY_LOCATION_ID)' },
      ],
      soapTemplate: `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <NewMessages xmlns="http://tempuri.org/">
      <companyLocationID>{{companyLocationID}} <!-- Random from location-ids.json --></companyLocationID>
    </NewMessages>
  </soap12:Body>
</soap12:Envelope>`,
    },

    sign: {
      displayName: 'Sign NewMessages (Long-Poll)',
      servicePath: '/device/sign.asmx',
      operationName: 'NewMessages',
      protocol: 'SOAP 1.2',
      contentType: 'application/soap+xml; charset=utf-8',
      soapAction: 'N/A',
      timeout: '90s',
      thinkTimeSec: 1,
      thresholds: {
        p95MaxDurationMs: 95000,
        p99MaxDurationMs: 110000,
        maxErrorRate: config.thresholds.maxErrorRate,
      },
      parameters: [
        { label: 'CompanyLocationMonitorID', value: ds.companyLocationMonitorId },
      ],
      soapTemplate: `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <NewMessages xmlns="http://kleverlogic.com/webservices/">
      <companyLocationMonitorID>${ds.companyLocationMonitorId}</companyLocationMonitorID>
    </NewMessages>
  </soap12:Body>
</soap12:Envelope>`,
    },

    payments: {
      displayName: 'Payments NewMessages (Long-Poll)',
      servicePath: '/device/payments.asmx',
      operationName: 'NewMessages',
      protocol: 'SOAP 1.2',
      contentType: 'application/soap+xml; charset=utf-8',
      soapAction: 'N/A',
      timeout: '60s',
      thinkTimeSec: 1,
      thresholds: {
        p95MaxDurationMs: 65000,
        p99MaxDurationMs: 75000,
        maxErrorRate: config.thresholds.maxErrorRate,
      },
      parameters: [
        { label: 'Location ID Selection', value: 'Random from location-ids.json pool (or fallback COMPANY_LOCATION_ID)' },
      ],
      soapTemplate: `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <NewMessages xmlns="http://tempuri.org/">
      <companyLocationID>{{companyLocationID}} <!-- Random from location-ids.json --></companyLocationID>
    </NewMessages>
  </soap12:Body>
</soap12:Envelope>`,
    },
  };

  const base = defaultsBySuite[safeName] || {
    displayName: safeName.toUpperCase().replace(/[-_]/g, ' '),
    servicePath: '/device/services',
    operationName: safeName,
    protocol: 'SOAP 1.2',
    contentType: 'application/soap+xml; charset=utf-8',
    soapAction: 'N/A',
    timeout: config.timeout || '60s',
    thinkTimeSec: 1,
    thresholds: {
      p95MaxDurationMs: config.thresholds.p95MaxDuration,
      p99MaxDurationMs: config.thresholds.p99MaxDuration,
      maxErrorRate: config.thresholds.maxErrorRate,
    },
    parameters: [],
    soapTemplate: `<!-- Multi-service suite (${safeName}) -->`,
  };

  return {
    ...base,
    ...customMeta,
    stages,
    thresholds: {
      ...base.thresholds,
      ...(customMeta.thresholds || {}),
    },
    parameters: customMeta.parameters || base.parameters,
    soapTemplate: customMeta.soapTemplate || base.soapTemplate,
  };
}

/**
 * Evaluates SLA thresholds against measured percentiles & error rate
 */
function evaluateThresholds(durationStats, errorRatePct, thresholdsCfg) {
  const t = thresholdsCfg || {};
  const limits = {
    p50: t.p50MaxDurationMs ?? null,
    p90: t.p90MaxDurationMs ?? null,
    p95: t.p95MaxDurationMs ?? config.thresholds.p95MaxDuration ?? null,
    p99: t.p99MaxDurationMs ?? config.thresholds.p99MaxDuration ?? null,
    maxErrorRatePct: (t.maxErrorRate ?? config.thresholds.maxErrorRate ?? 0.01) * 100,
  };

  const violations = [];
  if (limits.p50 !== null && durationStats.p50 > limits.p50) {
    violations.push(`p50 (${durationStats.p50.toFixed(1)}ms) exceeded SLA limit (${limits.p50}ms)`);
  }
  if (limits.p90 !== null && durationStats.p90 > limits.p90) {
    violations.push(`p90 (${durationStats.p90.toFixed(1)}ms) exceeded SLA limit (${limits.p90}ms)`);
  }
  if (limits.p95 !== null && durationStats.p95 > limits.p95) {
    violations.push(`p95 (${durationStats.p95.toFixed(1)}ms) exceeded SLA limit (${limits.p95}ms)`);
  }
  if (limits.p99 !== null && durationStats.p99 > limits.p99) {
    violations.push(`p99 (${durationStats.p99.toFixed(1)}ms) exceeded SLA limit (${limits.p99}ms)`);
  }
  if (errorRatePct > limits.maxErrorRatePct) {
    violations.push(`Error Rate (${errorRatePct.toFixed(2)}%) exceeded SLA limit (${limits.maxErrorRatePct.toFixed(2)}%)`);
  }

  return {
    passed: violations.length === 0,
    violations,
    limits,
  };
}

/**
 * Builds the HTTP timing breakdown table (Min, p50, Avg, p90, p95, p99, Max)
 */
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
            <td style="color:#818cf8; font-weight:600;">${formatDuration(r.stats.p90)}</td>
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

/**
 * Builds the Assertions / Validation Checks table
 */
function buildChecksTableHtml(checksList) {
  if (!checksList || checksList.length === 0) {
    return `<p style="color:#94a3b8; margin:0;">No assertions were recorded in this test run.</p>`;
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Assertion / Validation Check</th>
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
              <td><span class="tag" style="color:${ok ? '#10b981' : '#ef4444'}; border-color:${ok ? '#10b98155' : '#ef444455'};">${pct}%</span></td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>
  `;
}

/**
 * Generates the detailed HTML dashboard report (aligned with webv1 layout, without Used IDs section)
 */
function generateHtmlReport(metricsData, checksList, meta, fileTimestamp) {
  const evalResult = evaluateThresholds(
    metricsData.timings.duration,
    metricsData.errorRateNum,
    meta.thresholds
  );

  const anyCheckFailed = checksList.some((c) => (c.fails || 0) > 0);
  const isPassed = evalResult.passed && !anyCheckFailed;
  const statusColor = isPassed ? '#10b981' : '#ef4444';
  const statusBadge = isPassed ? 'PASSED' : 'SLA / CHECK ATTENTION NEEDED';
  const maxErrAllowedPct = evalResult.limits.maxErrorRatePct.toFixed(2);
  const dStats = metricsData.timings.duration;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>k6 Report - ${escapeHtml(meta.displayName)} (${escapeHtml(fileTimestamp)})</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b1120; color: #f1f5f9; margin: 0; padding: 24px; line-height: 1.5; }
    .container { max-width: 1220px; margin: 0 auto; }
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
    .code-box { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 14px; font-family: 'Consolas', 'Courier New', monospace; font-size: 12.5px; color: #38bdf8; overflow-x: auto; white-space: pre; line-height: 1.55; margin: 0; }
    .meta-bar { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
    .meta-item { background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 6px 10px; font-size: 12px; color: #cbd5e1; }
    .meta-item strong { color: #94a3b8; text-transform: uppercase; font-size: 10.5px; margin-right: 4px; }
    .two-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 18px; }
    .toggle-btn { background: #0f172a; color: #94a3b8; border: 1px solid #334155; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
    .toggle-btn:hover { background: #1e293b; color: #38bdf8; border-color: #0284c7; }
    .collapsible-content { transition: max-height 0.25s ease-out; overflow: hidden; }
    .collapsible-content.collapsed { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="title">🔌 Performance Test Report: ${escapeHtml(meta.displayName)}</div>
        <div class="subtitle">
          Target: <strong>${escapeHtml(config.baseUrl)}${escapeHtml(meta.servicePath)}</strong> |
          Protocol: <strong>${escapeHtml(meta.protocol)}</strong> |
          Operation: <code>${escapeHtml(meta.operationName)}</code> |
          Run: <strong>${escapeHtml(fileTimestamp)}</strong>
        </div>
      </div>
      <div class="badge">${statusBadge}</div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-label">Total Requests</div>
        <div class="card-val">${metricsData.totalReqs}</div>
        <div class="card-sub">${metricsData.successReqs} OK / ${metricsData.failedReqs} Failed (${metricsData.rps.toFixed(2)} req/s)</div>
      </div>
      <div class="card">
        <div class="card-label">Error Rate</div>
        <div class="card-val" style="color:${metricsData.errorRateNum > parseFloat(maxErrAllowedPct) ? '#ef4444' : '#10b981'};">${metricsData.errorRate}%</div>
        <div class="card-sub">SLA Limit: &le;${maxErrAllowedPct}%</div>
      </div>
      <div class="card">
        <div class="card-label">p50 (Median)</div>
        <div class="card-val" style="color:${evalResult.limits.p50 && dStats.p50 > evalResult.limits.p50 ? '#ef4444' : '#38bdf8'};">${formatDuration(dStats.p50)}</div>
        <div class="card-sub">Avg: ${formatDuration(dStats.avg)}</div>
      </div>
      <div class="card">
        <div class="card-label">p90 Latency</div>
        <div class="card-val" style="color:${evalResult.limits.p90 && dStats.p90 > evalResult.limits.p90 ? '#ef4444' : '#818cf8'};">${formatDuration(dStats.p90)}</div>
        <div class="card-sub">Min: ${formatDuration(dStats.min)}</div>
      </div>
      <div class="card">
        <div class="card-label">p95 Latency</div>
        <div class="card-val" style="color:${evalResult.limits.p95 && dStats.p95 > evalResult.limits.p95 ? '#ef4444' : '#f59e0b'};">${formatDuration(dStats.p95)}</div>
        <div class="card-sub">${evalResult.limits.p95 ? `SLA: &le;${evalResult.limits.p95}ms` : '95th Percentile'}</div>
      </div>
      <div class="card">
        <div class="card-label">p99 Latency</div>
        <div class="card-val" style="color:${evalResult.limits.p99 && dStats.p99 > evalResult.limits.p99 ? '#ef4444' : '#f43f5e'};">${formatDuration(dStats.p99)}</div>
        <div class="card-sub">${evalResult.limits.p99 ? `SLA: &le;${evalResult.limits.p99}ms | ` : ''}Max: ${formatDuration(dStats.max)}</div>
      </div>
      <div class="card">
        <div class="card-label">Peak Concurrent VUs</div>
        <div class="card-val">${metricsData.maxVUs} VUs</div>
        <div class="card-sub">Duration: ${metricsData.testRunDurationSec}s | Iter: ${metricsData.iterations}</div>
      </div>
    </div>

    ${
      !evalResult.passed
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
        <span>⏱️ Full HTTP Timing Breakdown (Min, p50, Avg, p90, p95, p99, Max)</span>
      </div>
      ${buildTimingsTableHtml(metricsData.timings)}
    </div>

    <div class="section">
      <div class="section-title">
        <span>✅ Executed Assertions & Validation Checks (${checksList.length})</span>
      </div>
      ${buildChecksTableHtml(checksList)}
    </div>

    <div class="two-col">
      <div class="section">
        <div class="section-title">📈 Configured Stages & Target VUs</div>
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th>Duration</th>
              <th>Target Users (VUs)</th>
            </tr>
          </thead>
          <tbody>
            ${(meta.stages || [])
              .map(
                (st, i) => `
              <tr>
                <td><strong>Stage ${i + 1}</strong></td>
                <td><code>${escapeHtml(st.duration)}</code></td>
                <td style="color:#38bdf8; font-weight:700;">${st.target ?? 0} VUs</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div class="section">
        <div class="section-title">🌐 Traffic & Execution Parameters</div>
        <p style="margin:6px 0;"><strong>Data Sent:</strong> ${formatBytes(metricsData.dataSent)}</p>
        <p style="margin:6px 0;"><strong>Data Received:</strong> ${formatBytes(metricsData.dataReceived)}</p>
        <p style="margin:6px 0;"><strong>Total Run Duration:</strong> <code>${metricsData.testRunDurationSec}s</code> (${metricsData.iterations} iterations)</p>
        <p style="margin:6px 0;"><strong>Configured Timeout:</strong> <code>${escapeHtml(meta.timeout)}</code> | <strong>Think Time (Sleep):</strong> <code>${escapeHtml(meta.thinkTimeSec)}s</code></p>
        ${(meta.parameters || [])
          .map(
            (p) => `<p style="margin:6px 0;"><strong>${escapeHtml(p.label)}:</strong> <code>${escapeHtml(p.value)}</code></p>`
          )
          .join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-title">
        <span>📄 SOAP Call Request Template (${escapeHtml(meta.operationName)})</span>
        <button type="button" class="toggle-btn" onclick="toggleSection('soap-template-container', this)">Hide / Collapse</button>
      </div>
      <div id="soap-template-container" class="collapsible-content">
        <div class="meta-bar">
          <div class="meta-item"><strong>Method:</strong> POST</div>
          <div class="meta-item"><strong>URL:</strong> <code>${escapeHtml(config.baseUrl)}${escapeHtml(meta.servicePath)}</code></div>
          <div class="meta-item"><strong>Protocol:</strong> ${escapeHtml(meta.protocol)}</div>
          <div class="meta-item"><strong>Content-Type:</strong> <code>${escapeHtml(meta.contentType)}</code></div>
          ${meta.soapAction && meta.soapAction !== 'N/A' ? `<div class="meta-item"><strong>SOAPAction:</strong> <code>${escapeHtml(meta.soapAction)}</code></div>` : ''}
        </div>
        <pre class="code-box">${escapeHtml(meta.soapTemplate)}</pre>
      </div>
    </div>
  </div>
  <script>
    function toggleSection(id, btn) {
      var el = document.getElementById(id);
      if (!el) return;
      if (el.classList.contains('collapsed')) {
        el.classList.remove('collapsed');
        if (btn) btn.textContent = 'Hide / Collapse';
      } else {
        el.classList.add('collapsed');
        if (btn) btn.textContent = 'Show / Expand';
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Custom summary generator for k6 test runs with per-endpoint folders and timestamped filenames
 *
 * @param {object} data - k6 handleSummary data object
 * @param {string} defaultSuiteName - endpoint / suite identifier (e.g. 'known-drivers', 'known-driver-changes')
 * @param {object} [customMeta] - optional metadata overrides (stages, thresholds, soapTemplate, parameters, etc.)
 */
export function generateSummary(data, defaultSuiteName = 'valet', customMeta = {}) {
  const envReportName = __ENV && __ENV.REPORT_NAME ? __ENV.REPORT_NAME : null;
  const suiteName = (envReportName || defaultSuiteName || 'valet').toLowerCase();
  const safeName = suiteName.replace(/[^a-z0-9_-]/g, '-');

  const fileTimestamp = buildFileTimestamp(__ENV ? __ENV.RUN_TIMESTAMP : null);
  const endpointDir = `reports/${safeName}`;

  const htmlPath = `${endpointDir}/report-${safeName}-${fileTimestamp}.html`;
  const jsonPath = `${endpointDir}/summary-${safeName}-${fileTimestamp}.json`;
  const mdPath = `${endpointDir}/summary-${safeName}-${fileTimestamp}.md`;

  const meta = resolveEndpointMetadata(safeName, customMeta);
  const m = data.metrics || {};

  const totalReqs = m.http_reqs?.values?.count || 0;
  const rps = m.http_reqs?.values?.rate || 0;
  const failedReqs = m.http_req_failed?.values?.passes || 0;
  const successReqs = Math.max(0, totalReqs - failedReqs);
  const errorRateNum = m.http_req_failed?.values?.rate ? m.http_req_failed.values.rate * 100 : 0;
  const errorRate = errorRateNum.toFixed(2);

  const timings = {
    duration: extractTrendStats(m.http_req_duration),
    waiting: extractTrendStats(m.http_req_waiting),
    blocked: extractTrendStats(m.http_req_blocked),
    connecting: extractTrendStats(m.http_req_connecting),
    tls: extractTrendStats(m.http_req_tls_handshaking),
    sending: extractTrendStats(m.http_req_sending),
    receiving: extractTrendStats(m.http_req_receiving),
  };

  const dataReceived = m.data_received?.values?.count || 0;
  const dataSent = m.data_sent?.values?.count || 0;
  const maxVUs = m.vus_max?.values?.value || m.vus?.values?.value || 0;
  const iterations = m.iterations?.values?.count || 0;
  const testRunDurationSec = data.state?.testRunDurationMs
    ? (data.state.testRunDurationMs / 1000).toFixed(2)
    : 'N/A';

  const checksList = collectChecks(data.root_group);

  const metricsData = {
    totalReqs,
    rps,
    failedReqs,
    successReqs,
    errorRateNum,
    errorRate,
    timings,
    dataReceived,
    dataSent,
    maxVUs,
    iterations,
    testRunDurationSec,
  };

  const dStats = timings.duration;
  const wStats = timings.waiting;

  // Build checks output text for console
  let checksText = '';
  if (checksList.length > 0) {
    checksText = checksList
      .map((c) => {
        const symbol = c.fails === 0 ? '✓' : '✗';
        const rate = ((c.passes / (c.passes + c.fails || 1)) * 100).toFixed(1);
        return `  [${symbol}] ${c.name} ... ${c.passes} passed, ${c.fails} failed (${rate}%)`;
      })
      .join('\n');
  } else {
    checksText = '  (No checks defined)';
  }

  // Terminal Console Summary (stdout)
  const stdout = `
================================================================================
              K6 ${meta.displayName.toUpperCase()} PERFORMANCE TEST REPORT
================================================================================
Target URL:         ${config.baseUrl}${meta.servicePath}
Operation / Mode:   ${meta.operationName} (${meta.protocol})
Run Timestamp:      ${fileTimestamp}
Run Duration:       ${testRunDurationSec}s (${iterations} iterations)
--------------------------------------------------------------------------------
REQUEST SUMMARY:
  Total Calls Made: ${totalReqs} (${rps.toFixed(2)} req/s)
  Successful Calls: ${successReqs}
  Failed Calls:     ${failedReqs}
  Error Rate:       ${errorRate}% (Threshold: ${(meta.thresholds.maxErrorRate * 100).toFixed(1)}%)
  Peak Active VUs:  ${maxVUs}

RESPONSE TIME (http_req_duration):
  Min Latency:      ${formatDuration(dStats.min)}
  p50 (Median):     ${formatDuration(dStats.p50)}
  Average (Avg):    ${formatDuration(dStats.avg)}
  p90 Latency:      ${formatDuration(dStats.p90)}
  p95 Latency:      ${formatDuration(dStats.p95)} (SLA: <=${meta.thresholds.p95MaxDurationMs}ms)
  p99 Latency:      ${formatDuration(dStats.p99)} (SLA: <=${meta.thresholds.p99MaxDurationMs}ms)
  Max Latency:      ${formatDuration(dStats.max)}

SERVER WAITING / TTFB (http_req_waiting):
  Min: ${formatDuration(wStats.min)} | p50: ${formatDuration(wStats.p50)} | Avg: ${formatDuration(wStats.avg)} | p90: ${formatDuration(wStats.p90)} | p95: ${formatDuration(wStats.p95)} | p99: ${formatDuration(wStats.p99)} | Max: ${formatDuration(wStats.max)}

VALIDATION CHECKS:
${checksText}

DATA TRANSFER:
  Total Sent:       ${formatBytes(dataSent)}
  Total Received:   ${formatBytes(dataReceived)}
================================================================================
HTML Dashboard Report generated: ${htmlPath}
Full JSON Data generated:        ${jsonPath}
Markdown Summary generated:      ${mdPath}
================================================================================
`;

  const html = generateHtmlReport(metricsData, checksList, meta, fileTimestamp);

  const markdown = `# ${meta.displayName} Performance Test Summary Report

- **Run Timestamp:** \`${fileTimestamp}\`
- **Target URL:** \`${config.baseUrl}${meta.servicePath}\`
- **Operation:** \`${meta.operationName}\` (\`${meta.protocol}\`)
- **Total Run Duration:** \`${testRunDurationSec}s\` (\`${iterations}\` iterations)
- **Peak Concurrent VUs:** \`${maxVUs}\`
- **Total Requests:** \`${totalReqs}\` (\`${rps.toFixed(2)} req/s\`)
- **Successful / Failed:** \`${successReqs}\` OK / \`${failedReqs}\` Failed (\`${errorRate}%\` error rate)
- **Data Sent / Received:** \`${formatBytes(dataSent)}\` / \`${formatBytes(dataReceived)}\`

## HTTP Timing Breakdown (p50, p90, p95, p99, Avg, Min, Max)

| Metric | Min | p50 (Median) | Avg | p90 | p95 | p99 | Max |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Total Duration (\`http_req_duration\`)** | ${formatDuration(dStats.min)} | **${formatDuration(dStats.p50)}** | ${formatDuration(dStats.avg)} | ${formatDuration(dStats.p90)} | **${formatDuration(dStats.p95)}** | **${formatDuration(dStats.p99)}** | ${formatDuration(dStats.max)} |
| **Server Waiting / TTFB (\`http_req_waiting\`)** | ${formatDuration(wStats.min)} | ${formatDuration(wStats.p50)} | ${formatDuration(wStats.avg)} | ${formatDuration(wStats.p90)} | ${formatDuration(wStats.p95)} | ${formatDuration(wStats.p99)} | ${formatDuration(wStats.max)} |
| **Blocked (\`http_req_blocked\`)** | ${formatDuration(timings.blocked.min)} | ${formatDuration(timings.blocked.p50)} | ${formatDuration(timings.blocked.avg)} | ${formatDuration(timings.blocked.p90)} | ${formatDuration(timings.blocked.p95)} | ${formatDuration(timings.blocked.p99)} | ${formatDuration(timings.blocked.max)} |
| **TCP Connecting (\`http_req_connecting\`)** | ${formatDuration(timings.connecting.min)} | ${formatDuration(timings.connecting.p50)} | ${formatDuration(timings.connecting.avg)} | ${formatDuration(timings.connecting.p90)} | ${formatDuration(timings.connecting.p95)} | ${formatDuration(timings.connecting.p99)} | ${formatDuration(timings.connecting.max)} |
| **TLS Handshake (\`http_req_tls_handshaking\`)** | ${formatDuration(timings.tls.min)} | ${formatDuration(timings.tls.p50)} | ${formatDuration(timings.tls.avg)} | ${formatDuration(timings.tls.p90)} | ${formatDuration(timings.tls.p95)} | ${formatDuration(timings.tls.p99)} | ${formatDuration(timings.tls.max)} |
| **Request Sending (\`http_req_sending\`)** | ${formatDuration(timings.sending.min)} | ${formatDuration(timings.sending.p50)} | ${formatDuration(timings.sending.avg)} | ${formatDuration(timings.sending.p90)} | ${formatDuration(timings.sending.p95)} | ${formatDuration(timings.sending.p99)} | ${formatDuration(timings.sending.max)} |
| **Response Receiving (\`http_req_receiving\`)** | ${formatDuration(timings.receiving.min)} | ${formatDuration(timings.receiving.p50)} | ${formatDuration(timings.receiving.avg)} | ${formatDuration(timings.receiving.p90)} | ${formatDuration(timings.receiving.p95)} | ${formatDuration(timings.receiving.p99)} | ${formatDuration(timings.receiving.max)} |

## Configured Stages

| Stage | Duration | Target VUs |
| :--- | :--- | :--- |
${(meta.stages || []).map((st, idx) => `| Stage ${idx + 1} | \`${st.duration}\` | **${st.target} VUs** |`).join('\n')}

## Execution Parameters
${(meta.parameters || []).map((p) => `- **${p.label}:** \`${p.value}\``).join('\n')}

## Validation Checks
${checksList.map((c) => `- [${c.fails === 0 ? 'x' : ' '}] **${c.name}**: ${c.passes} passed, ${c.fails} failed`).join('\n')}

## SOAP Call Request Template
- **Method:** \`POST\`
- **Endpoint:** \`${config.baseUrl}${meta.servicePath}\`
- **Content-Type:** \`${meta.contentType}\`

\`\`\`xml
${meta.soapTemplate}
\`\`\`
`;

  const result = {
    stdout: stdout,
  };

  result[htmlPath] = html;
  result[jsonPath] = JSON.stringify(data, null, 2);
  result[mdPath] = markdown;

  return result;
}
