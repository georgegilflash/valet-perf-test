import { deviceRampUpOptions } from './src/scenarios/device-ramp-up.js';
import { executeDeviceSuiteFlow } from './src/scenarios/device-flow.js';
import { generateSummary } from './src/utils/summary.js';
import { loadedLocationIds } from './src/utils/locations.js';
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

// Export k6 options for Device Services suite
export const options = {
  ...deviceRampUpOptions,
  stages: stages,
};

/**
 * Setup lifecycle function (runs once before all VUs start)
 */
export function setup() {
  console.log(`\n============================================================`);
  console.log(`[k6 Setup] DEVICE SERVICES PERFORMANCE TEST SUITE`);
  console.log(`============================================================`);
  console.log(`Target Base URL:     ${config.baseUrl}`);
  console.log(`Kiosk Ping:          ${config.deviceSuite.enableKioskPing ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`Kiosk GetServerName: ${config.deviceSuite.enableKioskGetServerName ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`PMS NewMessages:     ${config.deviceSuite.enablePmsNewMessages ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`Sign NewMessages:    ${config.deviceSuite.enableSignNewMessages ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`Payments NewMessages:${config.deviceSuite.enablePaymentsNewMessages ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`------------------------------------------------------------`);
  console.log(`Location IDs Pool:          ${loadedLocationIds.length > 0 ? `${loadedLocationIds.length} locations loaded (random selection per call)` : 'Fallback to default COMPANY_LOCATION_ID'}`);
  console.log(`Kiosk ID:                   ${config.deviceSuite.kioskId}`);
  console.log(`Default Company Location ID:${config.deviceSuite.companyLocationId}`);
  console.log(`Company Location Monitor ID:${config.deviceSuite.companyLocationMonitorId}`);
  console.log(`------------------------------------------------------------`);
  console.log(`Stages configured:`);
  stages.forEach((s, idx) => {
    console.log(`  Stage ${idx + 1}: ${s.duration} -> target ${s.target} VUs`);
  });
  console.log(`============================================================\n`);

  return {
    startTime: new Date().toISOString(),
    baseUrl: config.baseUrl,
  };
}

/**
 * Main VU iteration function
 */
export default function () {
  executeDeviceSuiteFlow();
}

/**
 * Teardown lifecycle function (runs once after test finishes)
 */
export function teardown(data) {
  console.log(`\n[k6 Teardown] Device Suite completed. Started at: ${data.startTime}`);
}

/**
 * Custom summary reporting (terminal summary + reports/summary.json + report.html)
 */
export function handleSummary(data) {
  return generateSummary(data, 'device', { stages });
}
