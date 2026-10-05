import { check, sleep } from 'k6';
import { callPmsNewMessages, callSignNewMessages, callPaymentsNewMessages } from './src/scenarios/device-flow.js';
import { loadedLocationIds } from './src/utils/locations.js';
import { generateSummary } from './src/utils/summary.js';
import { config } from './config/env.js';

// ==============================================================================
// STAGES CONFIGURATION (Modify directly here per endpoint, or leave null to use .env)
// ==============================================================================
// Stage 1: Warm-up
const STAGE_1_TARGET = null;   // e.g. 300
const STAGE_1_DURATION = null; // e.g. '1m'

// Stage 2: Ramp-up
const STAGE_2_TARGET = null;   // e.g. 1000
const STAGE_2_DURATION = null; // e.g. '2m'

// Stage 3: Reach peak
const STAGE_3_TARGET = null;   // e.g. 2350
const STAGE_3_DURATION = null; // e.g. '3m'

// Stage 4: Maintain steady state
const STAGE_4_TARGET = null;   // e.g. 1500
const STAGE_4_DURATION = null; // e.g. '2m'

// Stage 5: Ramp-down to 0 users
const STAGE_5_TARGET = null;   // e.g. 0
const STAGE_5_DURATION = null; // e.g. '1m'

const stages = [
  { target: STAGE_1_TARGET ?? config.stages[0].target, duration: STAGE_1_DURATION ?? config.stages[0].duration },
  { target: STAGE_2_TARGET ?? config.stages[1].target, duration: STAGE_2_DURATION ?? config.stages[1].duration },
  { target: STAGE_3_TARGET ?? config.stages[2].target, duration: STAGE_3_DURATION ?? config.stages[2].duration },
  { target: STAGE_4_TARGET ?? config.stages[3].target, duration: STAGE_4_DURATION ?? config.stages[3].duration },
  { target: STAGE_5_TARGET ?? config.stages[4].target, duration: STAGE_5_DURATION ?? config.stages[4].duration },
];

// Build independent parallel scenarios dynamically from .env toggles
const activeScenarios = {};

if (config.deviceSuite.enablePmsNewMessages) {
  activeScenarios['pms_long_poll'] = {
    executor: 'ramping-vus',
    stages: stages,
    exec: 'pmsScenario',
    tags: { service: 'pms' },
  };
}

if (config.deviceSuite.enableSignNewMessages) {
  activeScenarios['sign_long_poll'] = {
    executor: 'ramping-vus',
    stages: stages,
    exec: 'signScenario',
    tags: { service: 'sign' },
  };
}

if (config.deviceSuite.enablePaymentsNewMessages) {
  activeScenarios['payments_long_poll'] = {
    executor: 'ramping-vus',
    stages: stages,
    exec: 'paymentsScenario',
    tags: { service: 'payments' },
  };
}

// Fallback if none are enabled in .env
if (Object.keys(activeScenarios).length === 0) {
  activeScenarios['payments_fallback'] = {
    executor: 'ramping-vus',
    stages: stages,
    exec: 'paymentsScenario',
    tags: { service: 'payments' },
  };
}

export const options = {
  scenarios: activeScenarios,
  thresholds: {
    http_req_duration: ['p(95)<75000', 'p(99)<90000'],
    http_req_failed: [`rate<${config.thresholds.maxErrorRate}`],
  },
  tags: {
    suite: 'parallel_long_poll_suite',
    environment: __ENV.ENVIRONMENT || 'test',
  },
};

export function setup() {
  console.log(`\n============================================================`);
  console.log(`[k6 Setup] PARALLEL LONG-POLLING PERFORMANCE TEST SUITE`);
  console.log(`============================================================`);
  console.log(`Target Base URL:        ${config.baseUrl}`);
  console.log(`Parallel Scenarios active:`);
  Object.keys(activeScenarios).forEach((scName) => {
    console.log(`  🚀 Scenario [${scName}]: Running simultaneously with independent VUs`);
  });
  console.log(`------------------------------------------------------------`);
  console.log(`PMS NewMessages:        ${config.deviceSuite.enablePmsNewMessages ? '✅ ACTIVE SCENARIO' : '❌ DISABLED'}`);
  console.log(`Sign NewMessages:       ${config.deviceSuite.enableSignNewMessages ? '✅ ACTIVE SCENARIO' : '❌ DISABLED'}`);
  console.log(`Payments NewMessages:   ${config.deviceSuite.enablePaymentsNewMessages ? '✅ ACTIVE SCENARIO' : '❌ DISABLED'}`);
  console.log(`------------------------------------------------------------`);
  console.log(`Location IDs Pool:      ${loadedLocationIds.length > 0 ? `${loadedLocationIds.length} locations loaded (random selection per call)` : 'Fallback to default COMPANY_LOCATION_ID'}`);
  console.log(`CompanyLocationMonitorID: ${config.deviceSuite.companyLocationMonitorId}`);
  console.log(`Stages configured per scenario:`);
  stages.forEach((s, idx) => {
    console.log(`  Stage ${idx + 1}: ${s.duration} -> target ${s.target} VUs`);
  });
  console.log(`============================================================\n`);

  return { startTime: new Date().toISOString() };
}

// Independent executor for PMS
export function pmsScenario() {
  callPmsNewMessages();
  sleep(1);
}

// Independent executor for Sign
export function signScenario() {
  callSignNewMessages();
  sleep(1);
}

// Independent executor for Payments
export function paymentsScenario() {
  callPaymentsNewMessages();
  sleep(1);
}

// Fallback default function when CLI flags like --vus override scenarios
export default function () {
  paymentsScenario();
}

export function handleSummary(data) {
  return generateSummary(data, 'polling');
}
