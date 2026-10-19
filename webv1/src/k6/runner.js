import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { isSoapFault, extractXmlValue, buildSoapEnvelope, formatXml, summarizeResponseBody } from './utils/xml-helper.js';
import { generateMultiReports } from './report-generator.js';

// Load the validated test-performance-script.json passed via environment variable
const configPath = __ENV.SCRIPT_CONFIG_PATH || '../../reports/latest/test-performance-script.json';
const reportOutputDir = __ENV.REPORT_OUTPUT_DIR || 'reports/latest';
const runTimestamp = __ENV.RUN_TIMESTAMP || new Date().toISOString();

const rawConfig = open(configPath);
const scriptConfig = JSON.parse(rawConfig);

const globalConfig = scriptConfig.globalConfig || {};
const baseUrl = (globalConfig.baseUrl || 'https://intserver.qa1.flashparking.dev').replace(/\/+$/, '');
const globalStages = Array.isArray(globalConfig.stages) ? globalConfig.stages : [{ duration: '1m' }];

// Normalize scenarios: support multi-step `scenarios[]` or fallback to flat `endpoints[]`
const rawScenarios = Array.isArray(scriptConfig.scenarios) && scriptConfig.scenarios.length > 0
  ? scriptConfig.scenarios
  : (scriptConfig.endpoints || []).map((ep, idx) => ({
      id: `scenario_${ep.id || idx + 1}`,
      name: ep.displayName || ep.name || `Scenario ${idx + 1}`,
      enabled: ep.enabled !== false,
      usersPerStage: ep.usersPerStage || [],
      steps: [{ stepId: `step_${idx + 1}_1`, endpointId: ep.id, ...ep }]
    }));

const enabledScenarios = rawScenarios.filter((sc) => sc && sc.enabled !== false && Array.isArray(sc.steps) && sc.steps.length > 0);

// Collect all distinct endpoints across all enabled scenarios/steps to register k6 metrics
const distinctEndpointsMap = {};
enabledScenarios.forEach((sc) => {
  sc.steps.forEach((step) => {
    if (!step || step.enabled === false) return;
    const epId = step.endpointId || step.id;
    if (!epId) return;
    if (!distinctEndpointsMap[epId]) {
      distinctEndpointsMap[epId] = {
        ...step,
        id: epId,
        endpointId: epId
      };
    }
  });
});

const distinctEndpoints = Object.values(distinctEndpointsMap);

// Register isolated k6 metrics per endpoint during init stage
const endpointMetricsRegistry = {};
const scenarios = {};
const thresholds = {
  http_req_failed: [`rate<${globalConfig.maxErrorRate ?? 0.01}`]
};

distinctEndpoints.forEach((ep) => {
  const prefix = `ep_${ep.id}`;
  endpointMetricsRegistry[ep.id] = {
    duration: new Trend(`${prefix}_duration`, true),
    waiting: new Trend(`${prefix}_waiting`, true),
    blocked: new Trend(`${prefix}_blocked`, true),
    connecting: new Trend(`${prefix}_connecting`, true),
    tls: new Trend(`${prefix}_tls_handshaking`, true),
    sending: new Trend(`${prefix}_sending`, true),
    receiving: new Trend(`${prefix}_receiving`, true),
    failed: new Rate(`${prefix}_failed`),
    reqs: new Counter(`${prefix}_reqs`),
    dataSent: new Counter(`${prefix}_data_sent`),
    dataReceived: new Counter(`${prefix}_data_received`)
  };

  if (ep.thresholds?.p95MaxDurationMs) {
    thresholds[`${prefix}_duration`] = [`p(95)<${ep.thresholds.p95MaxDurationMs}`];
  }
  if (ep.thresholds?.maxErrorRate !== undefined) {
    thresholds[`${prefix}_failed`] = [`rate<${ep.thresholds.maxErrorRate}`];
  }
});

// Build k6 scenarios from enabledScenarios
enabledScenarios.forEach((sc, idx) => {
  const safeScenarioKey = String(sc.id || `scenario_${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const scStages = globalStages.map((st, sIdx) => ({
    duration: String(st.duration || '30s'),
    target: Number(sc.usersPerStage?.[sIdx] ?? 0)
  }));

  scenarios[safeScenarioKey] = {
    executor: 'ramping-vus',
    stages: scStages,
    exec: 'runScenarioSteps',
    env: { SCENARIO_ID: sc.id || safeScenarioKey },
    tags: { scenario_id: sc.id || safeScenarioKey },
    gracefulRampDown: '10s'
  };
});

// Export k6 options including p(50), p(90), p(95), and p(99)
export const options = {
  scenarios,
  thresholds,
  summaryTrendStats: ['min', 'avg', 'med', 'p(50)', 'p(90)', 'p(95)', 'p(99)', 'max', 'count']
};

/**
 * Helper to select an ID from the confirmed array of strings in step.data
 */
function selectStepIdValue(step, vuNumber) {
  if (!step.data || typeof step.data !== 'object') return '';
  const list =
    step.data.locationIds ||
    step.data.kioskIds ||
    step.data.userGuids ||
    step.data.customIds ||
    [];

  if (!Array.isArray(list) || list.length === 0) return '';

  if (step.data.selectionMode === 'per-vu') {
    const idx = Math.max(0, (vuNumber || 1) - 1) % list.length;
    return list[idx];
  }

  const randomIdx = Math.floor(Math.random() * list.length);
  return list[randomIdx];
}

export function setup() {
  console.log(`====================================================================`);
  console.log(`[k6 Webv1 Runner] Starting test-performance-script`);
  console.log(`Target Base URL: ${baseUrl}`);
  console.log(`Active Scenarios: ${enabledScenarios.map((s) => `${s.name || s.id} (${s.steps.length} steps)`).join(', ')}`);
  console.log(`Distinct Endpoints: ${distinctEndpoints.map((e) => e.name || e.id).join(', ')}`);
  console.log(`Stages Count: ${globalStages.length}`);
  console.log(`Report Folder: ${reportOutputDir}`);
  console.log(`====================================================================`);
  return { startTime: new Date().toISOString() };
}

/**
 * Executes a single step within a scenario and records metrics for its endpointId.
 */
function executeStep(step, stepOrder, scenarioObj) {
  const epId = step.endpointId || step.id;
  const m = endpointMetricsRegistry[epId];
  const selectedId = selectStepIdValue(step, __VU);
  const serviceUrl = step.service.startsWith('http')
    ? step.service
    : `${baseUrl}${step.service.startsWith('/') ? '' : '/'}${step.service}`;

  group(epId, () => {
    let res;
    let payloadStr = '';
    const protocol = (step.protocol || 'SOAP').toUpperCase();

    if (protocol === 'SOAP') {
      const soapVer = String(step.soapVersion || '1.1');
      payloadStr = buildSoapEnvelope(step, selectedId);

      const headers = {
        'Content-Type':
          soapVer === '1.2'
            ? `application/soap+xml; charset=utf-8${step.soapAction ? `; action="${step.soapAction}"` : ''}`
            : 'text/xml; charset=utf-8'
      };

      if (soapVer === '1.1' && step.soapAction) {
        headers['SOAPAction'] = step.soapAction.startsWith('"')
          ? step.soapAction
          : `"${step.soapAction}"`;
      }

      res = http.post(serviceUrl, payloadStr, {
        headers,
        timeout: step.timeout || '60s',
        tags: {
          name: epId,
          endpoint: epId,
          scenario: scenarioObj.id,
          step: String(stepOrder)
        }
      });
    } else {
      const method = (step.method || 'GET').toUpperCase();
      payloadStr = step.body ? JSON.stringify(step.body) : null;
      res = http.request(method, serviceUrl, payloadStr, {
        headers: { 'Content-Type': 'application/json', ...(step.headers || {}) },
        timeout: step.timeout || '30s',
        tags: {
          name: epId,
          endpoint: epId,
          scenario: scenarioObj.id,
          step: String(stepOrder)
        }
      });
    }

    const hasFault = isSoapFault(res.body);
    const activeAssertions = Array.isArray(step.assertions)
      ? step.assertions.filter((a) => a && a.enabled !== false)
      : [];

    const checksObj = {};
    let allAssertionsPassed = true;

    activeAssertions.forEach((assertion) => {
      const label = assertion.label || assertion.id;
      if (assertion.type === 'http_status' || assertion.id === 'status_200') {
        const expectedCode = assertion.expected || 200;
        const ok = res.status === expectedCode;
        if (!ok) allAssertionsPassed = false;
        checksObj[label] = () => ok;
      } else if (assertion.type === 'no_soap_fault' || assertion.id === 'no_soap_fault') {
        const ok = !hasFault;
        if (!ok) allAssertionsPassed = false;
        checksObj[label] = () => ok;
      } else if (assertion.type === 'body_contains' && assertion.expected) {
        const ok = Boolean(res.body && res.body.includes(String(assertion.expected)));
        if (!ok) allAssertionsPassed = false;
        checksObj[label] = () => ok;
      } else {
        const ok = res.status === 200 && !hasFault;
        if (!ok) allAssertionsPassed = false;
        checksObj[label] = () => ok;
      }
    });

    if (Object.keys(checksObj).length > 0) {
      check(res, checksObj);
    }

    const isSuccess = res.status === 200 && !hasFault && allAssertionsPassed;
    const durationMs = res.timings?.duration || 0;

    // Record per-endpoint metrics
    if (m) {
      m.reqs.add(1);
      m.failed.add(!isSuccess);
      m.duration.add(durationMs);
      m.waiting.add(res.timings?.waiting || 0);
      m.blocked.add(res.timings?.blocked || 0);
      m.connecting.add(res.timings?.connecting || 0);
      m.tls.add(res.timings?.tls_handshaking || 0);
      m.sending.add(res.timings?.sending || 0);
      m.receiving.add(res.timings?.receiving || 0);
      m.dataSent.add(payloadStr ? payloadStr.length : 0);
      m.dataReceived.add(res.body ? res.body.length : 0);
    }

    const codeTag = extractXmlValue(res.body, 'Code') || '';
    const descTag = extractXmlValue(res.body, 'Description') || '';
    const bodySummary = summarizeResponseBody(res.body);
    const shortId = selectedId ? selectedId.slice(0, 8) + '...' : 'N/A';

    // Emit URL-encoded JSON between delimiters so logrus escaping or `source=console` never breaks parsing
    const livePayload = {
      ts: Date.now(),
      scenarioId: scenarioObj.id,
      scenarioName: scenarioObj.name || scenarioObj.id,
      stepOrder,
      endpointId: epId,
      endpointName: step.name || epId,
      vu: __VU,
      status: res.status,
      ok: isSuccess,
      durationMs: Number(durationMs.toFixed(2)),
      usedId: selectedId,
      code: codeTag,
      error: !isSuccess ? res.error || (hasFault ? 'SOAP Fault' : `HTTP ${res.status}`) : null
    };
    console.log(`@@LIVE_METRIC@@${encodeURIComponent(JSON.stringify(livePayload))}@@END_METRIC@@`);

    if (isSuccess) {
      console.log(
        `[${scenarioObj.name || scenarioObj.id} | Step ${stepOrder}] [VU ${__VU}] [${step.name || epId}] OK (${res.status}) in ${(durationMs / 1000).toFixed(2)}s | ID: ${shortId} | Summary: [${bodySummary}]`
      );
    } else {
      console.log(
        `[${scenarioObj.name || scenarioObj.id} | Step ${stepOrder}] [VU ${__VU}] [${step.name || epId}] FAILED (${res.status}) in ${(durationMs / 1000).toFixed(2)}s | ID: ${shortId} | Error: ${livePayload.error} | Summary: [${bodySummary}]`
      );
    }

    if (res.body) {
      console.log(`--- [VU ${__VU}] [${step.name || epId}] Response Body (HTTP ${res.status}) ---\n${formatXml(res.body)}\n------------------------------------------------------------`);
    }
  });

  const sleepSec = step.thinkTimeSec !== undefined ? Number(step.thinkTimeSec) : 1;
  if (sleepSec > 0) {
    sleep(sleepSec);
  }
}

/**
 * Dynamic multi-step scenario executor invoked by each scenario's independent VU pool
 */
export function runScenarioSteps() {
  const scenarioId = __ENV.SCENARIO_ID;
  const sc = enabledScenarios.find((item) => item.id === scenarioId);
  if (!sc || !Array.isArray(sc.steps) || sc.steps.length === 0) {
    sleep(1);
    return;
  }

  for (let i = 0; i < sc.steps.length; i++) {
    const step = sc.steps[i];
    if (step && step.enabled !== false) {
      executeStep(step, i + 1, sc);
    }
  }
}

export function handleSummary(data) {
  return generateMultiReports(data, scriptConfig, reportOutputDir, runTimestamp);
}
