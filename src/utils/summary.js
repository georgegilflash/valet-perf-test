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
 * Format bytes into human-readable string (KB, MB)
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
  if (ms === undefined || ms === null || isNaN(ms)) return 'N/A';
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s (${ms.toFixed(0)}ms)`;
  }
  return `${ms.toFixed(2)}ms`;
}

function getServiceEndpoint(safeName) {
  const map = {
    kiosk: '/device/kiosk.asmx',
    'known-drivers': '/device/kiosk.asmx (GetKnownDrivers)',
    'known-driver-changes': '/device/kiosk.asmx (GetKnownDriverChanges)',
    valet: '/device/valet.asmx',
    pms: '/device/pms.asmx',
    sign: '/device/sign.asmx',
    payments: '/device/payments.asmx',
    polling: '/device/(pms, sign, payments).asmx',
    device: '/device/services',
  };
  return map[safeName] || (config.testType === 'SOAP' ? config.soap.endpoint : '');
}

/**
 * Generates an HTML dashboard report
 */
function generateHtmlReport(data, metricsData, checksList, suiteName = 'valet') {
  const displayTitle = suiteName.toUpperCase().replace(/[-_]/g, ' ');
  const statusColor = metricsData.errorRateNum === 0 ? '#10b981' : '#ef4444';
  const statusBadge = metricsData.errorRateNum === 0 ? 'PASSED' : 'ATTENTION NEEDED';

  const checksRows = checksList
    .map(
      (c) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #334155;">
          ${c.fails === 0 ? '✅' : '❌'} ${c.name}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #334155; color: #10b981; font-weight: bold;">${c.passes}</td>
        <td style="padding: 10px; border-bottom: 1px solid #334155; color: ${c.fails > 0 ? '#ef4444' : '#94a3b8'}; font-weight: bold;">${c.fails}</td>
        <td style="padding: 10px; border-bottom: 1px solid #334155;">
          ${((c.passes / (c.passes + c.fails || 1)) * 100).toFixed(1)}%
        </td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>k6 ${displayTitle} Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .container { max-width: 960px; margin: 0 auto; }
    .header { background: #1e293b; padding: 24px; border-radius: 12px; margin-bottom: 20px; border-left: 6px solid ${statusColor}; display: flex; justify-content: space-between; align-items: center; }
    .title { font-size: 24px; font-weight: bold; margin: 0; }
    .subtitle { color: #94a3b8; font-size: 14px; margin-top: 6px; }
    .badge { padding: 6px 14px; border-radius: 20px; font-weight: bold; font-size: 13px; background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: #1e293b; padding: 18px; border-radius: 10px; border: 1px solid #334155; }
    .card-label { font-size: 12px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; }
    .card-val { font-size: 26px; font-weight: bold; margin-top: 8px; color: #38bdf8; }
    .card-sub { font-size: 12px; color: #64748b; margin-top: 4px; }
    .section { background: #1e293b; padding: 20px; border-radius: 10px; margin-bottom: 24px; border: 1px solid #334155; }
    .section-title { font-size: 16px; font-weight: bold; margin-bottom: 14px; border-bottom: 1px solid #334155; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { padding: 10px; color: #94a3b8; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="title">${displayTitle} Performance Test Report</div>
        <div class="subtitle">Target: ${config.baseUrl}${getServiceEndpoint(suiteName)} | Mode: ${config.testType} | Generated: ${new Date().toLocaleString()}</div>
      </div>
      <div class="badge">${statusBadge}</div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-label">Total Requests</div>
        <div class="card-val">${metricsData.totalReqs}</div>
        <div class="card-sub">${metricsData.successReqs} Success / ${metricsData.failedReqs} Failed</div>
      </div>
      <div class="card">
        <div class="card-label">Error Rate</div>
        <div class="card-val" style="color: ${metricsData.errorRateNum > 0 ? '#ef4444' : '#10b981'};">${metricsData.errorRate}%</div>
        <div class="card-sub">Tolerance threshold: ${(config.thresholds.maxErrorRate * 100).toFixed(1)}%</div>
      </div>
      <div class="card">
        <div class="card-label">Average Latency</div>
        <div class="card-val">${formatDuration(metricsData.avgDuration)}</div>
        <div class="card-sub">Min: ${formatDuration(metricsData.minDuration)} | Max: ${formatDuration(metricsData.maxDuration)}</div>
      </div>
      <div class="card">
        <div class="card-label">p95 Response Time</div>
        <div class="card-val">${formatDuration(metricsData.p95Duration)}</div>
        <div class="card-sub">p99: ${formatDuration(metricsData.p99Duration)}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Validation Checks</div>
      <table>
        <thead>
          <tr>
            <th>Check Description</th>
            <th>Passes</th>
            <th>Fails</th>
            <th>Success %</th>
          </tr>
        </thead>
        <tbody>
          ${checksRows || '<tr><td colspan="4" style="padding:10px;">No checks recorded</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Traffic & Data Transfer</div>
      <p style="color: #cbd5e1; margin: 4px 0;"><strong>Data Received:</strong> ${formatBytes(metricsData.dataReceived)}</p>
      <p style="color: #cbd5e1; margin: 4px 0;"><strong>Data Sent:</strong> ${formatBytes(metricsData.dataSent)}</p>
      <p style="color: #cbd5e1; margin: 4px 0;"><strong>Peak Virtual Users:</strong> ${metricsData.maxVUs}</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Custom summary generator for k6 test runs with per-suite report names
 */
export function generateSummary(data, defaultSuiteName = 'valet') {
  const envReportName = (__ENV && __ENV.REPORT_NAME) ? __ENV.REPORT_NAME : null;
  const suiteName = (envReportName || defaultSuiteName || 'valet').toLowerCase();
  const safeName = suiteName.replace(/[^a-z0-9_-]/g, '-');
  const displayTitle = safeName.toUpperCase().replace(/[-_]/g, ' ');

  const htmlPath = `reports/report-${safeName}.html`;
  const jsonPath = `reports/summary-${safeName}.json`;
  const mdPath = `reports/summary-${safeName}.md`;

  const m = data.metrics;

  const totalReqs = m.http_reqs ? m.http_reqs.values.count : 0;
  const failedReqs = m.http_req_failed ? m.http_req_failed.values.passes : 0;
  const successReqs = totalReqs - failedReqs;
  const errorRateNum = m.http_req_failed ? m.http_req_failed.values.rate * 100 : 0;
  const errorRate = errorRateNum.toFixed(2);

  const durationValues = m.http_req_duration ? m.http_req_duration.values : {};
  const avgDuration = durationValues.avg || 0;
  const minDuration = durationValues.min || 0;
  const medDuration = durationValues.med || 0;
  const maxDuration = durationValues.max || 0;
  const p90Duration = durationValues['p(90)'] || 0;
  const p95Duration = durationValues['p(95)'] || 0;
  const p99Duration = durationValues['p(99)'] || 0;

  const dataReceived = m.data_received ? m.data_received.values.count : 0;
  const dataSent = m.data_sent ? m.data_sent.values.count : 0;
  const maxVUs = m.vus_max ? m.vus_max.values.value : (m.vus ? m.vus.values.value : 0);

  const checksList = collectChecks(data.root_group);

  const metricsData = {
    totalReqs,
    failedReqs,
    successReqs,
    errorRateNum,
    errorRate,
    avgDuration,
    minDuration,
    medDuration,
    maxDuration,
    p90Duration,
    p95Duration,
    p99Duration,
    dataReceived,
    dataSent,
    maxVUs,
  };

  // Build checks output text
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
              K6 ${displayTitle} PERFORMANCE TEST REPORT
================================================================================
Target URL:         ${config.baseUrl}${getServiceEndpoint(safeName)}
Suite / Mode:       ${displayTitle} (${config.testType})
Execution Time:     ${new Date().toISOString()}
--------------------------------------------------------------------------------
REQUEST SUMMARY:
  Total Calls Made: ${totalReqs}
  Successful Calls: ${successReqs}
  Failed Calls:     ${failedReqs}
  Error Rate:       ${errorRate}% (Threshold: ${(config.thresholds.maxErrorRate * 100).toFixed(1)}%)
  Peak Active VUs:  ${maxVUs}

RESPONSE TIME (LATENCY):
  Min Latency:      ${formatDuration(minDuration)}
  Median (p50):     ${formatDuration(medDuration)}
  Average:          ${formatDuration(avgDuration)}
  p90 Latency:      ${formatDuration(p90Duration)}
  p95 Latency:      ${formatDuration(p95Duration)} (Threshold: ${config.thresholds.p95MaxDuration}ms)
  p99 Latency:      ${formatDuration(p99Duration)}
  Max Latency:      ${formatDuration(maxDuration)}

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

  const html = generateHtmlReport(data, metricsData, checksList, safeName);

  const markdown = `# ${displayTitle} Performance Test Summary Report

- **Date:** ${new Date().toISOString()}
- **Target:** \`${config.baseUrl}${getServiceEndpoint(safeName)}\`
- **Suite:** \`${displayTitle}\`
- **Protocol:** \`${config.testType}\`
- **Total Requests:** ${totalReqs}
- **Successful:** ${successReqs}
- **Failed:** ${failedReqs}
- **Error Rate:** ${errorRate}%
- **Average Duration:** ${formatDuration(avgDuration)}
- **p95 Duration:** ${formatDuration(p95Duration)}

## Validation Checks
${checksList.map((c) => `- [${c.fails === 0 ? 'x' : ' '}] **${c.name}**: ${c.passes} passed, ${c.fails} failed`).join('\n')}
`;

  const result = {
    stdout: stdout,
  };

  result[htmlPath] = html;
  result[jsonPath] = JSON.stringify(data, null, 2);
  result[mdPath] = markdown;

  // Provide reports/report.html for backward compatibility if default or valet
  if (safeName === 'valet' || safeName === 'default') {
    result['reports/report.html'] = html;
    result['reports/summary.json'] = JSON.stringify(data, null, 2);
  }

  return result;
}
