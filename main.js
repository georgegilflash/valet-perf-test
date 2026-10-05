import { rampUpOptions } from './src/scenarios/ramp-up.js';
import { executeTestFlow } from './src/scenarios/test-flow.js';
import { generateSummary } from './src/utils/summary.js';
import { validateTokenPool } from './src/utils/tokens.js';
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

// Export k6 test configuration options (5-stage ramp-up + thresholds)
export const options = {
  ...rampUpOptions,
  stages: stages,
};

/**
 * Setup lifecycle function (runs once before all VUs start)
 */
export function setup() {
  console.log(`[k6 Setup] Target API Base URL: ${config.baseUrl}`);
  console.log(`[k6 Setup] Test Protocol: ${config.testType}`);

  // Calculate maximum concurrent users required across all stages
  const maxRequiredVUs = Math.max(...stages.map((s) => s.target), 1);
  const tokenValidation = validateTokenPool(maxRequiredVUs);

  // If tokens.json does not have enough tokens for the required VUs, abort immediately!
  if (!tokenValidation.valid) {
    console.error(`\n❌ ${tokenValidation.error}\n`);
    throw new Error(tokenValidation.error);
  }

  if (tokenValidation.availableCount > 0) {
    console.log(`[k6 Setup] Token Pool: ${tokenValidation.message}`);
  }

  if (config.testType === 'SOAP' || config.testType === 'BOTH') {
    console.log(`[k6 Setup] SOAP Endpoint: ${config.soap.endpoint} (Action: ${config.soap.action})`);
    console.log(`[k6 Setup] SOAP Payload: seconds=${config.soap.pollSeconds}, compressed=${config.soap.compressed}`);
  }
  console.log(`[k6 Setup] Stages: 5-stage ramp-up`);
  stages.forEach((s, idx) => {
    console.log(`  Stage ${idx + 1}: ${s.duration} -> target ${s.target} VUs`);
  });
  console.log(`[k6 Setup] Auth Configured: ${config.auth.token ? 'Token' : config.auth.apiKey ? 'API Key' : config.auth.username ? 'Basic Auth' : 'None'}`);

  return {
    startTime: new Date().toISOString(),
    baseUrl: config.baseUrl,
  };
}

/**
 * Main VU iteration function (executed by each VU across the 5 stages)
 */
export default function (data) {
  executeTestFlow();
}

/**
 * Teardown lifecycle function (runs once after test completes)
 */
export function teardown(data) {
  console.log(`[k6 Teardown] Test finished. Started at: ${data.startTime}`);
}

/**
 * Custom summary reporting (terminal summary + reports/summary.json)
 */
export function handleSummary(data) {
  return generateSummary(data, 'valet');
}
