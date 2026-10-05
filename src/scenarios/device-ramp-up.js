import { config } from '../../config/env.js';

// Calculate duration threshold depending on whether long-polling endpoints are enabled
const hasLongPoll = config.deviceSuite.enablePmsNewMessages || 
                    config.deviceSuite.enableSignNewMessages ||
                    config.deviceSuite.enablePaymentsNewMessages;
const p95Limit = hasLongPoll ? 65000 : 5000;
const p99Limit = hasLongPoll ? 75000 : 10000;

export const deviceRampUpOptions = {
  stages: config.stages,

  thresholds: {
    http_req_duration: [
      `p(95)<${p95Limit}`,
      `p(99)<${p99Limit}`,
    ],
    http_req_failed: [
      `rate<${config.thresholds.maxErrorRate}`,
    ],
  },

  tags: {
    suite: 'device_services_suite',
    environment: __ENV.ENVIRONMENT || 'test',
  },
};
