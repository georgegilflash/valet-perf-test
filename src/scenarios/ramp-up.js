import { config } from '../../config/env.js';

/**
 * 5-Stage Ramp-Up Load Test Options
 *
 * Stage 1: Warm-up (starts ramping virtual users to warm caches / connection pools)
 * Stage 2: Moderate Load (simulates typical operational daily traffic)
 * Stage 3: Peak Load (ramps traffic up to peak capacity)
 * Stage 4: Steady Plateau (sustains peak traffic to evaluate stability under stress)
 * Stage 5: Ramp-down (gracefully cools down to 0 VUs to check recovery)
 */
export const rampUpOptions = {
  stages: config.stages,
  summaryTrendStats: ['min', 'avg', 'med', 'p(50)', 'p(90)', 'p(95)', 'p(99)', 'max', 'count'],

  thresholds: {
    // 95% of all HTTP requests must complete within SLA (default 500ms)
    http_req_duration: [
      `p(95)<${config.thresholds.p95MaxDuration}`,
      `p(99)<${config.thresholds.p99MaxDuration}`,
    ],
    // Overall HTTP failure rate must stay below threshold (default < 1%)
    http_req_failed: [
      `rate<${config.thresholds.maxErrorRate}`,
    ],
    // Custom error rate check
    custom_error_rate: [
      `rate<${config.thresholds.maxErrorRate}`,
    ],
  },

  // Graceful ramp-down period
  gracefulRampDown: '10s',

  // System tags for reporting
  tags: {
    test_type: 'ramp_up_5_stages',
    environment: __ENV.ENVIRONMENT || 'test',
  },
};
