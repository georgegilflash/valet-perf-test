import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { apiClient } from '../client/api-client.js';
import { isSoapFault, extractXmlValue } from '../utils/xml.js';
import { getRandomLocationId } from '../utils/locations.js';
import { config } from '../../config/env.js';

// Dedicated custom metrics for the Device Services Suite
export const deviceMetrics = {
  pingDuration: new Trend('device_kiosk_ping_duration'),
  pingSuccess: new Rate('device_kiosk_ping_success_rate'),
  getServerNameDuration: new Trend('device_kiosk_get_server_name_duration'),
  pmsDuration: new Trend('device_pms_duration'),
  signDuration: new Trend('device_sign_duration'),
  totalErrors: new Counter('device_total_errors'),
};

/**
 * Executes Kiosk Ping call
 */
export function callKioskPing() {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Ping xmlns="http://kleverlogic.com/webservices/">
      <kioskID>${config.deviceSuite.kioskId}</kioskID>
    </Ping>
  </soap:Body>
</soap:Envelope>`;

  const startTime = new Date();
  const res = apiClient.soap('/device/kiosk.asmx', 'http://kleverlogic.com/webservices/Ping', xml, {
    name: 'Kiosk_Ping',
    timeout: '30s',
  }, '1.1');

  const durationSec = ((new Date() - startTime) / 1000).toFixed(2);
  const hasFault = isSoapFault(res.body);
  const isSuccess = res.status === 200 && !hasFault;
  const pingCode = extractXmlValue(res.body, 'Code') || 'Unknown';

  check(res, {
    'kiosk_ping status is 200': (r) => r.status === 200,
    'kiosk_ping no SOAP fault': () => !hasFault,
  });

  deviceMetrics.pingDuration.add(res.timings.duration);
  deviceMetrics.pingSuccess.add(isSuccess);
  if (!isSuccess) deviceMetrics.totalErrors.add(1);

  if (isSuccess) {
    console.log(`[VU ${__VU}] [Kiosk Ping] OK (200) in ${durationSec}s | Code: ${pingCode}`);
  } else {
    console.log(`[VU ${__VU}] [Kiosk Ping] FAILED (${res.status}) in ${durationSec}s | Error: ${res.error || (hasFault ? 'SOAP Fault' : 'Non-200')}`);
  }

  if (config.debugResponse || !isSuccess) {
    console.log(`--- [VU ${__VU}] [Kiosk Ping Response Body] ---\n${res.body || '(empty)'}\n-----------------------------`);
  }

  return res;
}

/**
 * Executes Kiosk GetServerName call
 */
export function callKioskGetServerName() {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <GetServerName xmlns="http://kleverlogic.com/webservices/" />
  </soap12:Body>
</soap12:Envelope>`;

  const startTime = new Date();
  const res = apiClient.soap('/device/kiosk.asmx', null, xml, {
    name: 'Kiosk_GetServerName',
    timeout: '30s',
  }, '1.2');

  const durationSec = ((new Date() - startTime) / 1000).toFixed(2);
  const hasFault = isSoapFault(res.body);
  const isSuccess = res.status === 200 && !hasFault;
  const serverName = extractXmlValue(res.body, 'GetServerNameResult') || '';

  check(res, {
    'kiosk_get_server_name status is 200': (r) => r.status === 200,
    'kiosk_get_server_name no SOAP fault': () => !hasFault,
  });

  deviceMetrics.getServerNameDuration.add(res.timings.duration);
  if (!isSuccess) deviceMetrics.totalErrors.add(1);

  if (isSuccess) {
    console.log(`[VU ${__VU}] [Kiosk GetServerName] OK (200) in ${durationSec}s | Server: ${serverName}`);
  } else {
    console.log(`[VU ${__VU}] [Kiosk GetServerName] FAILED (${res.status}) in ${durationSec}s`);
  }

  if (config.debugResponse || !isSuccess) {
    console.log(`--- [VU ${__VU}] [Kiosk GetServerName Response] ---\n${res.body || '(empty)'}\n-----------------------------`);
  }

  return res;
}

/**
 * Executes Valet GetServerName call (/device/valet.asmx)
 */
export function callValetGetServerName() {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <GetServerName xmlns="http://kleverlogic.com/webservices/" />
  </soap12:Body>
</soap12:Envelope>`;

  const startTime = new Date();
  const res = apiClient.soap('/device/valet.asmx', null, xml, {
    name: 'Valet_GetServerName',
    timeout: '30s',
  }, '1.2');

  const durationSec = ((new Date() - startTime) / 1000).toFixed(2);
  const hasFault = isSoapFault(res.body);
  const isSuccess = res.status === 200 && !hasFault;
  const serverName = extractXmlValue(res.body, 'GetServerNameResult') || '';

  check(res, {
    'valet_get_server_name status is 200': (r) => r.status === 200,
    'valet_get_server_name no SOAP fault': () => !hasFault,
  });

  deviceMetrics.getServerNameDuration.add(res.timings.duration);
  if (!isSuccess) deviceMetrics.totalErrors.add(1);

  if (isSuccess) {
    console.log(`[VU ${__VU}] [Valet GetServerName] OK (200) in ${durationSec}s | Server: ${serverName}`);
  } else {
    console.log(`[VU ${__VU}] [Valet GetServerName] FAILED (${res.status}) in ${durationSec}s`);
  }

  if (config.debugResponse || !isSuccess) {
    console.log(`--- [VU ${__VU}] [Valet GetServerName Response] ---\n${res.body || '(empty)'}\n-----------------------------`);
  }

  return res;
}

/**
 * Executes PMS NewMessages call
 */
export function callPmsNewMessages() {
  const locationId = getRandomLocationId(config.deviceSuite.companyLocationId);
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <NewMessages xmlns="http://tempuri.org/">
      <companyLocationID>${locationId}</companyLocationID>
    </NewMessages>
  </soap12:Body>
</soap12:Envelope>`;

  const startTime = new Date();
  const res = apiClient.soap('/device/pms.asmx', null, xml, {
    name: 'PMS_NewMessages',
    timeout: '60s',
  }, '1.2');

  const durationSec = ((new Date() - startTime) / 1000).toFixed(2);
  const hasFault = isSoapFault(res.body);
  const isSuccess = res.status === 200 && !hasFault;

  check(res, {
    'pms_new_messages status is 200': (r) => r.status === 200,
    'pms_new_messages no SOAP fault': () => !hasFault,
  });

  deviceMetrics.pmsDuration.add(res.timings.duration);
  if (!isSuccess) deviceMetrics.totalErrors.add(1);

  if (isSuccess) {
    console.log(`[VU ${__VU}] [PMS NewMessages] OK (200) in ${durationSec}s | Location: ${locationId}`);
  } else {
    console.log(`[VU ${__VU}] [PMS NewMessages] FAILED (${res.status}) in ${durationSec}s | Location: ${locationId}`);
  }

  if (config.debugResponse || !isSuccess) {
    console.log(`--- [VU ${__VU}] [PMS Response] ---\n${res.body || '(empty)'}\n-----------------------------`);
  }

  return res;
}

/**
 * Executes Sign NewMessages call
 */
export function callSignNewMessages() {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <NewMessages xmlns="http://kleverlogic.com/webservices/">
      <companyLocationMonitorID>${config.deviceSuite.companyLocationMonitorId}</companyLocationMonitorID>
    </NewMessages>
  </soap12:Body>
</soap12:Envelope>`;

  const startTime = new Date();
  const res = apiClient.soap('/device/sign.asmx', null, xml, {
    name: 'Sign_NewMessages',
    timeout: '90s',
  }, '1.2');

  const durationSec = ((new Date() - startTime) / 1000).toFixed(2);
  const hasFault = isSoapFault(res.body);
  const isSuccess = res.status === 200 && !hasFault;
  const signCode = extractXmlValue(res.body, 'Code') || '';

  check(res, {
    'sign_new_messages status is 200': (r) => r.status === 200,
    'sign_new_messages no SOAP fault': () => !hasFault,
  });

  deviceMetrics.signDuration.add(res.timings.duration);
  if (!isSuccess) deviceMetrics.totalErrors.add(1);

  if (isSuccess) {
    console.log(`[VU ${__VU}] [Sign NewMessages] OK (200) in ${durationSec}s | Code: ${signCode}`);
  } else {
    console.log(`[VU ${__VU}] [Sign NewMessages] FAILED (${res.status}) in ${durationSec}s`);
  }

  if (config.debugResponse || !isSuccess) {
    console.log(`--- [VU ${__VU}] [Sign Response] ---\n${res.body || '(empty)'}\n-----------------------------`);
  }

  return res;
}

/**
 * Executes Payments NewMessages call
 */
export function callPaymentsNewMessages() {
  const locationId = getRandomLocationId(config.deviceSuite.companyLocationId);
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <NewMessages xmlns="http://tempuri.org/">
      <companyLocationID>${locationId}</companyLocationID>
    </NewMessages>
  </soap12:Body>
</soap12:Envelope>`;

  const startTime = new Date();
  const res = apiClient.soap('/device/payments.asmx', null, xml, {
    name: 'Payments_NewMessages',
    timeout: '60s',
  }, '1.2');

  const durationSec = ((new Date() - startTime) / 1000).toFixed(2);
  const hasFault = isSoapFault(res.body);
  const isSuccess = res.status === 200 && !hasFault;
  const payCode = extractXmlValue(res.body, 'Code') || '';

  check(res, {
    'payments_new_messages status is 200': (r) => r.status === 200,
    'payments_new_messages no SOAP fault': () => !hasFault,
  });

  if (!isSuccess) deviceMetrics.totalErrors.add(1);

  if (isSuccess) {
    console.log(`[VU ${__VU}] [Payments NewMessages] OK (200) in ${durationSec}s | Code: ${payCode} | Location: ${locationId}`);
  } else {
    console.log(`[VU ${__VU}] [Payments NewMessages] FAILED (${res.status}) in ${durationSec}s | Location: ${locationId}`);
  }

  if (config.debugResponse || !isSuccess) {
    console.log(`--- [VU ${__VU}] [Payments Response] ---\n${res.body || '(empty)'}\n-----------------------------`);
  }

  return res;
}

/**
 * Main dispatcher for the Device Suite:
 * Executes each endpoint enabled via the boolean flags in .env
 */
export function executeDeviceSuiteFlow() {
  const {
    enableKioskPing,
    enableKioskGetServerName,
    enablePmsNewMessages,
    enableSignNewMessages,
    enablePaymentsNewMessages,
  } = config.deviceSuite;

  // Run Kiosk Ping if enabled
  if (enableKioskPing) {
    callKioskPing();
  }

  // Run Kiosk GetServerName if enabled
  if (enableKioskGetServerName) {
    callKioskGetServerName();
  }

  // Run PMS NewMessages if enabled
  if (enablePmsNewMessages) {
    callPmsNewMessages();
  }

  // Run Sign NewMessages if enabled
  if (enableSignNewMessages) {
    callSignNewMessages();
  }

  // Run Payments NewMessages if enabled
  if (enablePaymentsNewMessages) {
    callPaymentsNewMessages();
  }

  // Small pacing pause between iterations (1 second)
  sleep(1);
}
