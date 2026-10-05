import { check, sleep } from 'k6';
import { callPmsNewMessages } from './src/scenarios/device-flow.js';
import { loadedLocationIds } from './src/utils/locations.js';
import { generateSummary } from './src/utils/summary.js';
import { config } from './config/env.js';

// ==============================================================================
// STAGES CONFIGURATION (Modify directly here per endpoint, or leave null to use .env)
// ==============================================================================
// Stage 1: Warm-up
const STAGE_1_TARGET = 20;   // e.g. 300
const STAGE_1_DURATION = null; // e.g. '1m'

// Stage 2: Ramp-up
const STAGE_2_TARGET = 50;   // e.g. 1000
const STAGE_2_DURATION = null; // e.g. '2m'

// Stage 3: Reach peak
const STAGE_3_TARGET = 100;   // e.g. 2350
const STAGE_3_DURATION = null; // e.g. '3m'

// Stage 4: Maintain steady state
const STAGE_4_TARGET = 40;   // e.g. 1500
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

export const options = {
  stages: stages,
  thresholds: {
    http_req_duration: ['p(95)<65000', 'p(99)<75000'],
    http_req_failed: [`rate<${config.thresholds.maxErrorRate}`],
  },
  tags: {
    suite: 'pms_long_poll_suite',
    environment: __ENV.ENVIRONMENT || 'test',
  },
};

export function setup() {
  console.log(`\n============================================================`);
  console.log(`[k6 Setup] DEDICATED PMS NEW_MESSAGES LONG-POLL TEST`);
  console.log(`============================================================`);
  console.log(`Target Base URL:     ${config.baseUrl}`);
  console.log(`Endpoint:            /device/pms.asmx (NewMessages)`);
  console.log(`Location IDs Pool:   ${loadedLocationIds.length > 0 ? `${loadedLocationIds.length} locations loaded (random selection per call)` : 'Fallback to default COMPANY_LOCATION_ID'}`);
  console.log(`Stages configured:`);
  stages.forEach((s, idx) => {
    console.log(`  Stage ${idx + 1}: ${s.duration} -> target ${s.target} VUs`);
  });
  console.log(`============================================================\n`);

  return { startTime: new Date().toISOString() };
}

export default function () {
  callPmsNewMessages();
  sleep(1);
}

export function handleSummary(data) {
  return generateSummary(data, 'pms');
}
