import { Rate, Trend, Counter } from 'k6/metrics';

/**
 * Custom k6 metrics to track API behavior
 */
export const metrics = {
  // Percentage of failed requests
  errorRate: new Rate('custom_error_rate'),

  // Custom latency tracking for business transactions
  apiDuration: new Trend('custom_api_duration'),

  // Total count of successful API calls
  successCounter: new Counter('custom_success_count'),
};

/**
 * Standard HTTP response check helper
 * @param {object} res - k6 HTTP response
 * @param {string} endpointName - friendly name for reporting
 * @param {number} expectedStatus - expected HTTP status code (default 200)
 * @returns {boolean}
 */
export function validateResponse(res, endpointName = 'API Request', expectedStatus = 200) {
  const isSuccess = res.status === expectedStatus;
  
  metrics.errorRate.add(!isSuccess);
  metrics.apiDuration.add(res.timings.duration);
  if (isSuccess) {
    metrics.successCounter.add(1);
  }

  return isSuccess;
}
