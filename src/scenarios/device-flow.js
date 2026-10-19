import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { apiClient } from '../client/api-client.js';
import { isSoapFault, extractXmlValue, extractAllXmlValues, formatXml } from '../utils/xml.js';
import { getRandomLocationId } from '../utils/locations.js';
import {
  getVuKioskId,
  getRandomIntInRange,
  getRandomDateIsoInRange,
  getRandomYmdInRange,
  parseUtcMs,
} from '../utils/kiosks.js';
import { config } from '../../config/env.js';

// Dedicated custom metrics for the Device Services Suite
export const deviceMetrics = {
  pingDuration: new Trend('device_kiosk_ping_duration'),
  pingSuccess: new Rate('device_kiosk_ping_success_rate'),
  getServerNameDuration: new Trend('device_kiosk_get_server_name_duration'),
  getKnownDriversDuration: new Trend('device_kiosk_get_known_drivers_duration'),
  getKnownDriverChangesDuration: new Trend('device_kiosk_get_known_driver_changes_duration'),
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
    console.log(`--- [VU ${__VU}] [Kiosk Ping Response Body] ---\n${formatXml(res.body)}\n-----------------------------`);
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
    console.log(`--- [VU ${__VU}] [Kiosk GetServerName Response] ---\n${formatXml(res.body)}\n-----------------------------`);
  }

  return res;
}

/**
 * Executes Kiosk GetKnownDrivers call (/device/kiosk.asmx -> GetKnownDrivers)
 */
export function callKioskGetKnownDrivers(customParams = {}) {
  // 1-to-1 Kiosk ID per Virtual User from kiosk-ids.json pool
  const kioskId = customParams.kioskId || getVuKioskId(__VU, config.deviceSuite.kioskId);

  // Random FromDate within user-defined range (unless fixed fromDate is provided)
  const fromMin = customParams.fromMin || config.deviceSuite.knownDriversFromMin;
  const fromMax = customParams.fromMax || config.deviceSuite.knownDriversFromMax;
  const fromDate = customParams.from || config.deviceSuite.knownDriversFrom || getRandomDateIsoInRange(fromMin, fromMax);

  const start = customParams.start !== undefined ? customParams.start : config.deviceSuite.knownDriversStart;

  // Random Count within user-defined range (unless fixed count is provided)
  const countMin = customParams.countMin ?? config.deviceSuite.knownDriversCountMin;
  const countMax = customParams.countMax ?? config.deviceSuite.knownDriversCountMax;
  const count = customParams.count !== undefined
    ? customParams.count
    : (config.deviceSuite.knownDriversCount ?? getRandomIntInRange(countMin, countMax));

  const xml = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:web="http://kleverlogic.com/webservices/">
   <soap:Header/>
   <soap:Body>
      <web:GetKnownDrivers>
         <web:kioskID>${kioskId}</web:kioskID>
         <web:from>2026-08-27T00:00:00</web:from>
         <web:start>${start}</web:start>
         <web:count>${count}</web:count>
      </web:GetKnownDrivers>
   </soap:Body>
</soap:Envelope>`;


  const startTime = new Date();
  const res = apiClient.soap('/device/kiosk.asmx', null, xml, {
    name: 'Kiosk_GetKnownDrivers',
    timeout: '60s',
  }, '1.2');

  const durationSec = ((new Date() - startTime) / 1000).toFixed(2);
  const hasFault = isSoapFault(res.body);
  const resultCode = extractXmlValue(res.body, 'Code') || '';
  const description = extractXmlValue(res.body, 'Description') || '';
  const isBusinessFailure = resultCode.toLowerCase() === 'failed';

  // Extract KnownDriver records and DateModifiedUtc timestamps
  const knownDriverBlocks = extractAllXmlValues(res.body, 'KnownDriver');
  const returnedCount = knownDriverBlocks.length;
  const dateModifiedValues = extractAllXmlValues(res.body, 'DateModifiedUtc');

  // Validation 1: Returned count must be <= requested count
  const isCountValid = returnedCount <= count;

  // Validation 2: All returned DateModifiedUtc values must be > sent FromDate
  const sentFromMs = parseUtcMs(fromDate);
  const areDatesAfterFrom = dateModifiedValues.every((dateStr) => {
    const driverDateMs = parseUtcMs(dateStr);
    return !isNaN(driverDateMs) && driverDateMs > sentFromMs;
  });

  const isSuccess = res.status === 200 && !hasFault && !isBusinessFailure && isCountValid && areDatesAfterFrom;

  check(res, {
    'kiosk_get_known_drivers status is 200': (r) => r.status === 200,
    'kiosk_get_known_drivers no SOAP fault': () => !hasFault,
    'kiosk_get_known_drivers result code success': () => !isBusinessFailure,
    'kiosk_get_known_drivers count <= requested count': () => isCountValid,
    'kiosk_get_known_drivers dates > FromDate': () => areDatesAfterFrom,
  });

  deviceMetrics.getKnownDriversDuration.add(res.timings.duration);
  if (!isSuccess) deviceMetrics.totalErrors.add(1);

  if (isSuccess) {
    console.log(
      `[VU ${__VU}] [Kiosk GetKnownDrivers] OK (200) in ${durationSec}s | Kiosk: ${kioskId} | From: ${fromDate} | Records: ${returnedCount}/${count} | Dates>From: ${areDatesAfterFrom}`
    );
  } else {
    console.log(
      `[VU ${__VU}] [Kiosk GetKnownDrivers] FAILED (${res.status}) in ${durationSec}s | Kiosk: ${kioskId} | From: ${fromDate} | Records: ${returnedCount}/${count} | Dates>From: ${areDatesAfterFrom} | Code: ${resultCode || 'Error'} | Reason: ${description || 'Validation/HTTP Error'}`
    );
  }

  if (config.debugResponse || !isSuccess) {
    console.log(`--- [VU ${__VU}] [Kiosk GetKnownDrivers Response] ---\n${formatXml(res.body)}\n-----------------------------`);
  }

  return res;
}

/**
 * Executes Kiosk GetKnownDriverChanges call (/device/kiosk.asmx -> GetKnownDriverChanges)
 */
export function callKioskGetKnownDriverChanges(customParams = {}) {
  // 1-to-1 Kiosk ID per Virtual User from kiosk-ids.json pool
  const kioskId = customParams.kioskId || getVuKioskId(__VU, config.deviceSuite.kioskId);

  // Random Date (Year, Month, Day) within user-defined range
  const dateMin = customParams.dateMin || config.deviceSuite.knownDriverChangesDateMin;
  const dateMax = customParams.dateMax || config.deviceSuite.knownDriverChangesDateMax;
  const randomYmd = getRandomYmdInRange(dateMin, dateMax);

  const year = customParams.year || config.deviceSuite.knownDriverChangesYear || randomYmd.year;
  const month = customParams.month || config.deviceSuite.knownDriverChangesMonth || randomYmd.month;
  const day = customParams.day || config.deviceSuite.knownDriverChangesDay || randomYmd.day;

  // Random Total within user-defined range
  const totalMin = customParams.totalMin ?? config.deviceSuite.knownDriverChangesTotalMin;
  const totalMax = customParams.totalMax ?? config.deviceSuite.knownDriverChangesTotalMax;
  const total = customParams.total !== undefined
    ? customParams.total
    : (config.deviceSuite.knownDriverChangesTotal ?? getRandomIntInRange(totalMin, totalMax));

  const burnt = customParams.burnt !== undefined ? customParams.burnt : config.deviceSuite.knownDriverChangesBurnt;

  const clientXml = customParams.clientXml || `<client>
        <DatabaseChange>
          <Year xmlns="urn:KleverLogic.FlashParcs.Web">${year}</Year>
          <Month xmlns="urn:KleverLogic.FlashParcs.Web">${month}</Month>
          <Day xmlns="urn:KleverLogic.FlashParcs.Web">${day}</Day>
          <Total xmlns="urn:KleverLogic.FlashParcs.Web">${total}</Total>
          <Burnt xmlns="urn:KleverLogic.FlashParcs.Web">${burnt}</Burnt>
        </DatabaseChange>
      </client>`;

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <GetKnownDriverChanges xmlns="http://kleverlogic.com/webservices/">
      <kioskID>${kioskId}</kioskID>
      ${clientXml}
    </GetKnownDriverChanges>
  </soap12:Body>
</soap12:Envelope>`;

  const startTime = new Date();
  const res = apiClient.soap('/device/kiosk.asmx', null, xml, {
    name: 'Kiosk_GetKnownDriverChanges',
    timeout: '60s',
  }, '1.2');

  const durationSec = ((new Date() - startTime) / 1000).toFixed(2);
  const hasFault = isSoapFault(res.body);
  const resultCode = extractXmlValue(res.body, 'Code') || '';
  const description = extractXmlValue(res.body, 'Description') || '';
  const isBusinessFailure = resultCode.toLowerCase() === 'failed';

  // Validate Date (must match sent Year-Month-Day) and Total (must be <= sent Total)
  const dbChangeBlocks = extractAllXmlValues(res.body, 'DatabaseChange');
  const knownDriverBlocks = extractAllXmlValues(res.body, 'KnownDriver');

  let isDateSame = true;
  let isTotalValid = true;
  let returnedTotalDisplay = 0;

  if (dbChangeBlocks.length > 0) {
    for (const block of dbChangeBlocks) {
      const resYear = parseInt(extractXmlValue(block, 'Year'), 10);
      const resMonth = parseInt(extractXmlValue(block, 'Month'), 10);
      const resDay = parseInt(extractXmlValue(block, 'Day'), 10);
      const resTotal = parseInt(extractXmlValue(block, 'Total'), 10);

      if (!isNaN(resYear) && !isNaN(resMonth) && !isNaN(resDay)) {
        if (resYear !== year || resMonth !== month || resDay !== day) {
          isDateSame = false;
        }
      }
      if (!isNaN(resTotal)) {
        returnedTotalDisplay += resTotal;
        if (resTotal > total) {
          isTotalValid = false;
        }
      }
    }
  } else if (knownDriverBlocks.length > 0) {
    returnedTotalDisplay = knownDriverBlocks.length;
    isTotalValid = returnedTotalDisplay <= total;
    const dateModifiedValues = extractAllXmlValues(res.body, 'DateModifiedUtc');
    isDateSame = dateModifiedValues.every((dateStr) => {
      const d = new Date(parseUtcMs(dateStr));
      return (
        !isNaN(d.getTime()) &&
        d.getUTCFullYear() === year &&
        d.getUTCMonth() + 1 === month &&
        d.getUTCDate() === day
      );
    });
  } else {
    // Check if Year/Month/Day/Total tags exist directly in result
    const directYear = extractXmlValue(res.body, 'Year');
    const directMonth = extractXmlValue(res.body, 'Month');
    const directDay = extractXmlValue(res.body, 'Day');
    const directTotal = extractXmlValue(res.body, 'Total');

    if (directYear !== null && directMonth !== null && directDay !== null) {
      isDateSame =
        parseInt(directYear, 10) === year &&
        parseInt(directMonth, 10) === month &&
        parseInt(directDay, 10) === day;
    }
    if (directTotal !== null) {
      const parsedTotal = parseInt(directTotal, 10);
      returnedTotalDisplay = isNaN(parsedTotal) ? 0 : parsedTotal;
      isTotalValid = !isNaN(parsedTotal) && parsedTotal <= total;
    }
  }

  const isSuccess = res.status === 200 && !hasFault && !isBusinessFailure && isDateSame && isTotalValid;
  const sentDateFormatted = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  check(res, {
    'kiosk_get_known_driver_changes status is 200': (r) => r.status === 200,
    'kiosk_get_known_driver_changes no SOAP fault': () => !hasFault,
    'kiosk_get_known_driver_changes result code success': () => !isBusinessFailure,
    'kiosk_get_known_driver_changes date matches sent date': () => isDateSame,
    'kiosk_get_known_driver_changes total <= requested total': () => isTotalValid,
  });

  deviceMetrics.getKnownDriverChangesDuration.add(res.timings.duration);
  if (!isSuccess) deviceMetrics.totalErrors.add(1);

  if (isSuccess) {
    console.log(
      `[VU ${__VU}] [Kiosk GetKnownDriverChanges] OK (200) in ${durationSec}s | Kiosk: ${kioskId} | Date: ${sentDateFormatted} | Total: ${returnedTotalDisplay}/${total} | SameDate: ${isDateSame}`
    );
  } else {
    console.log(
      `[VU ${__VU}] [Kiosk GetKnownDriverChanges] FAILED (${res.status}) in ${durationSec}s | Kiosk: ${kioskId} | Date: ${sentDateFormatted} | Total: ${returnedTotalDisplay}/${total} | SameDate: ${isDateSame} | Code: ${resultCode || 'Error'} | Reason: ${description || 'Validation/HTTP Error'}`
    );
  }

  if (config.debugResponse || !isSuccess) {
    console.log(`--- [VU ${__VU}] [Kiosk GetKnownDriverChanges Response] ---\n${formatXml(res.body)}\n-----------------------------`);
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
    console.log(`--- [VU ${__VU}] [Valet GetServerName Response] ---\n${formatXml(res.body)}\n-----------------------------`);
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
    console.log(`--- [VU ${__VU}] [PMS Response] ---\n${formatXml(res.body)}\n-----------------------------`);
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
    console.log(`--- [VU ${__VU}] [Sign Response] ---\n${formatXml(res.body)}\n-----------------------------`);
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
    console.log(`--- [VU ${__VU}] [Payments Response] ---\n${formatXml(res.body)}\n-----------------------------`);
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
    enableKioskGetKnownDrivers,
    enableKioskGetKnownDriverChanges,
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

  // Run Kiosk GetKnownDrivers if enabled
  if (enableKioskGetKnownDrivers) {
    callKioskGetKnownDrivers();
  }

  // Run Kiosk GetKnownDriverChanges if enabled
  if (enableKioskGetKnownDriverChanges) {
    callKioskGetKnownDriverChanges();
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
