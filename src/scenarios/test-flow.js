import { check, sleep, group } from 'k6';
import { apiClient } from '../client/api-client.js';
import { validateResponse } from '../utils/metrics.js';
import { executeSoapFlow } from './soap-flow.js';
import { config } from '../../config/env.js';

/**
 * Standard REST API flow (GET & POST)
 */
function executeRestFlow() {
  const thinkTime = parseFloat(__ENV.THINK_TIME_SEC || '0.5');

  // Step 1: Health / Status Check or Resource Listing (GET)
  group('01_REST_Get_Resource', () => {
    const getEndpoint = __ENV.GET_ENDPOINT || '/get';
    const res = apiClient.get(getEndpoint, {
      name: 'GET_Resource',
    });

    const passed = check(res, {
      'GET status is 200': (r) => r.status === 200,
      'GET response has body': (r) => r.body && r.body.length > 0,
      'GET latency < 500ms': (r) => r.timings.duration < 500,
    });

    validateResponse(res, 'GET_Resource', 200);
  });

  if (thinkTime > 0) {
    sleep(thinkTime);
  }

  // Step 2: Resource Creation / Submission (POST)
  group('02_REST_Post_Resource', () => {
    const postEndpoint = __ENV.POST_ENDPOINT || '/post';
    const payload = {
      timestamp: new Date().toISOString(),
      source: 'k6-load-test',
      data: {
        item: 'Performance Test Entity',
        active: true,
      },
    };

    const res = apiClient.post(postEndpoint, payload, {
      name: 'POST_Create_Resource',
    });

    const passed = check(res, {
      'POST status is 200 or 201': (r) => r.status === 200 || r.status === 201,
      'POST latency < 800ms': (r) => r.timings.duration < 800,
    });

    validateResponse(res, 'POST_Create_Resource', res.status === 201 ? 201 : 200);
  });

  if (thinkTime > 0) {
    sleep(thinkTime);
  }
}

/**
 * Main API test execution flow for each Virtual User (VU).
 * Dispatches between REST, SOAP, or BOTH based on TEST_TYPE.
 */
export function executeTestFlow() {
  const type = config.testType;

  if (type === 'SOAP') {
    executeSoapFlow();
  } else if (type === 'BOTH') {
    executeRestFlow();
    executeSoapFlow();
  } else {
    executeRestFlow();
  }
}
