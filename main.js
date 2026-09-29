import { rampUpOptions } from './src/scenarios/ramp-up.js';
import { executeTestFlow } from './src/scenarios/test-flow.js';
import { generateSummary } from './src/utils/summary.js';
import { validateTokenPool } from './src/utils/tokens.js';
import { config } from './config/env.js';

// Export k6 test configuration options (5-stage ramp-up + thresholds)
export const options = rampUpOptions;

/**
 * Setup lifecycle function (runs once before all VUs start)
 */
export function setup() {
  console.log(`[k6 Setup] Target API Base URL: ${config.baseUrl}`);
  console.log(`[k6 Setup] Test Protocol: ${config.testType}`);

  // Calculate maximum concurrent users required across all stages
  const maxRequiredVUs = Math.max(...config.stages.map((s) => s.target), 1);
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
  config.stages.forEach((s, idx) => {
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
  return generateSummary(data);
}
