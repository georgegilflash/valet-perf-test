import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { callKioskGetKnownDrivers } from './src/scenarios/device-flow.js';
import { generateSummary } from './src/utils/summary.js';
import { validateKioskPool } from './src/utils/kiosks.js';
import { config } from './config/env.js';

// ==============================================================================
// STAGES CONFIGURATION (Modify directly here per endpoint, or leave null to use .env)
// ==============================================================================
// Stage 1: Warm-up
const STAGE_1_TARGET = 5;   // e.g. 5
const STAGE_1_DURATION = null; // e.g. '1m'

// Stage 2: Ramp-up
const STAGE_2_TARGET = 10;  // e.g. 10
const STAGE_2_DURATION = null; // e.g. '2m'

// Stage 3: Reach peak
const STAGE_3_TARGET = 20;  // e.g. 20
const STAGE_3_DURATION = null; // e.g. '3m'

// Stage 4: Maintain steady state
const STAGE_4_TARGET = 10;  // e.g. 10
const STAGE_4_DURATION = null; // e.g. '2m'

// Stage 5: Ramp-down to 0 users
const STAGE_5_TARGET = null;   // e.g. 0
const STAGE_5_DURATION = null; // e.g. '1m'

// ==============================================================================
// RANDOM RANGE CONFIGURATION (Modify directly here, or leave null to use .env)
// ==============================================================================
const FROM_DATE_MIN = '2026-01-01T00:00:00'; // Min FromDate (ISO UTC)
const FROM_DATE_MAX = '2026-08-27T00:00:00'; // Max FromDate (ISO UTC)
const COUNT_MIN = 1;                         // Min requested count
const COUNT_MAX = 50;                        // Max requested count

const resolvedFromMin = __ENV.KNOWN_DRIVERS_FROM_MIN || FROM_DATE_MIN || config.deviceSuite.knownDriversFromMin;
const resolvedFromMax = __ENV.KNOWN_DRIVERS_FROM_MAX || FROM_DATE_MAX || config.deviceSuite.knownDriversFromMax;
const resolvedCountMin = __ENV.KNOWN_DRIVERS_COUNT_MIN ? parseInt(__ENV.KNOWN_DRIVERS_COUNT_MIN, 10) : (COUNT_MIN ?? config.deviceSuite.knownDriversCountMin);
const resolvedCountMax = __ENV.KNOWN_DRIVERS_COUNT_MAX ? parseInt(__ENV.KNOWN_DRIVERS_COUNT_MAX, 10) : (COUNT_MAX ?? config.deviceSuite.knownDriversCountMax);

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
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
    http_req_failed: [`rate<${config.thresholds.maxErrorRate}`],
  },
  tags: {
    suite: 'kiosk_known_drivers_suite',
    environment: __ENV.ENVIRONMENT || 'test',
  },
};

export function setup() {
  console.log(`\n============================================================`);
  console.log(`[k6 Setup] KIOSK GET_KNOWN_DRIVERS TEST (/device/kiosk.asmx)`);
  console.log(`============================================================`);

  // Calculate maximum concurrent users required across all stages
  const maxRequiredVUs = Math.max(...stages.map((s) => s.target), 1);
  const kioskValidation = validateKioskPool(maxRequiredVUs);

  // If kiosk-ids.json does not have enough Kiosk IDs for the required VUs, abort immediately!
  if (!kioskValidation.valid) {
    console.error(`\n❌ ${kioskValidation.error}\n`);
    throw new Error(kioskValidation.error);
  }

  console.log(`Target Base URL:     ${config.baseUrl}`);
  console.log(`Endpoint:            /device/kiosk.asmx (GetKnownDrivers)`);
  console.log(`Kiosk ID Pool:       ${kioskValidation.message}`);
  console.log(`FromDate Range:      ${resolvedFromMin} -> ${resolvedFromMax} (Random per request)`);
  console.log(`Start Index:         ${config.deviceSuite.knownDriversStart}`);
  console.log(`Count Range:         ${resolvedCountMin} -> ${resolvedCountMax} (Random per request, expects <= count)`);
  console.log(`Stages configured:`);
  stages.forEach((s, idx) => {
    console.log(`  Stage ${idx + 1}: ${s.duration} -> target ${s.target} VUs`);
  });
  console.log(`============================================================\n`);

  return { startTime: new Date().toISOString() };
}

export default function () {
  callKioskGetKnownDrivers({
    fromMin: resolvedFromMin,
    fromMax: resolvedFromMax,
    countMin: resolvedCountMin,
    countMax: resolvedCountMax,
  });
  sleep(1);
}

export function handleSummary(data) {
  return generateSummary(data, 'known-drivers');
}
