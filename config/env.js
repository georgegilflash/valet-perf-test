/**
 * Centralized Environment Configuration
 * 
 * In k6, environment variables are accessed via `__ENV`.
 * They can be passed using `-e KEY=VALUE` flags, or by reading an environment file.
 */

export const config = {
  // Test Protocol: 'SOAP', 'REST', or 'BOTH'
  testType: (__ENV.TEST_TYPE || 'SOAP').toUpperCase(),

  // Base URL for the target API / Service
  baseUrl: (__ENV.BASE_URL || 'https://intserver.qa1.flashparking.dev').replace(/\/+$/, ''),

  // Debug flag to log full response bodies to console
  debugResponse: __ENV.DEBUG_RESPONSE === 'true' || __ENV.DEBUG === 'true',

  // Authentication & Tokens
  auth: {
    token: __ENV.API_TOKEN || '',
    apiKey: __ENV.API_KEY || '',
    username: __ENV.API_USERNAME || '',
    password: __ENV.API_PASSWORD || '',
    tokenType: __ENV.TOKEN_TYPE || 'Bearer',
  },

  // SOAP Specific Settings for Valet Service
  soap: {
    // Relative path or full URL for SOAP web service
    endpoint: __ENV.SOAP_ENDPOINT || '/device/valet.asmx',
    // SOAPAction header URI
    action: __ENV.SOAP_ACTION || 'http://kleverlogic.com/webservices/NewMessages4',
    // Protocol version: '1.1' or '1.2'
    version: __ENV.SOAP_VERSION || '1.1',
    // Valet NewMessages4 parameters
    loginToken: __ENV.LOGIN_TOKEN || '219952af-36e3-4a9c-a0ba-31eee485b8e7',
    compressed: __ENV.COMPRESSED || 'true',
    pollSeconds: parseInt(__ENV.POLL_SECONDS || '60', 10),
  },

  // 5-Stage Ramp-Up Configuration
  stages: [
    // Stage 1: Warm-up / Initial ramp-up (1 user)
    {
      target: parseInt(__ENV.STAGE_1_TARGET || '1', 10),
      duration: __ENV.STAGE_1_DURATION || '1m',
    },
    // Stage 2: Ramp-up to 2 users
    {
      target: parseInt(__ENV.STAGE_2_TARGET || '2', 10),
      duration: __ENV.STAGE_2_DURATION || '2m',
    },
    // Stage 3: Reach peak of 3 users
    {
      target: parseInt(__ENV.STAGE_3_TARGET || '3', 10),
      duration: __ENV.STAGE_3_DURATION || '2m',
    },
    // Stage 4: Plateau / Sustained peak (3 users)
    {
      target: parseInt(__ENV.STAGE_4_TARGET || '3', 10),
      duration: __ENV.STAGE_4_DURATION || '3m',
    },
    // Stage 5: Ramp-down / Cooldown (0 users)
    {
      target: parseInt(__ENV.STAGE_5_TARGET || '0', 10),
      duration: __ENV.STAGE_5_DURATION || '1m',
    },
  ],

  // Performance SLA Thresholds
  // Note: Since NewMessages4 long-polls for 60s, response time is expected to be ~60s
  thresholds: {
    // 95% of requests must complete below this duration (ms)
    p95MaxDuration: parseInt(__ENV.THRESHOLD_P95 || '65000', 10), // 65 seconds
    // 99% of requests must complete below this duration (ms)
    p99MaxDuration: parseInt(__ENV.THRESHOLD_P99 || '70000', 10), // 70 seconds
    // Maximum allowable failure rate (e.g., 0.01 = 1%)
    maxErrorRate: parseFloat(__ENV.THRESHOLD_ERROR_RATE || '0.01'),
  },

  // Request timeout (must exceed pollSeconds, e.g. 90s for a 60s poll)
  timeout: __ENV.REQUEST_TIMEOUT || '90s',

  // Device Services Suite (Kiosk, PMS, Sign)
  deviceSuite: {
    enableKioskPing: (__ENV.ENABLE_KIOSK_PING || 'true').toLowerCase() === 'true',
    enableKioskGetServerName: (__ENV.ENABLE_KIOSK_GET_SERVER_NAME || 'false').toLowerCase() === 'true',
    enableKioskGetKnownDrivers: (__ENV.ENABLE_KIOSK_GET_KNOWN_DRIVERS || 'false').toLowerCase() === 'true',
    enableKioskGetKnownDriverChanges: (__ENV.ENABLE_KIOSK_GET_KNOWN_DRIVER_CHANGES || 'false').toLowerCase() === 'true',
    enableValetGetServerName: (__ENV.ENABLE_VALET_GET_SERVER_NAME || 'true').toLowerCase() === 'true',
    enablePmsNewMessages: (__ENV.ENABLE_PMS_NEW_MESSAGES || 'false').toLowerCase() === 'true',
    enableSignNewMessages: (__ENV.ENABLE_SIGN_NEW_MESSAGES || 'false').toLowerCase() === 'true',
    enablePaymentsNewMessages: (__ENV.ENABLE_PAYMENTS_NEW_MESSAGES || 'false').toLowerCase() === 'true',
    kioskId: __ENV.KIOSK_ID || '00000000-0000-0000-0000-000000000000',
    // GetKnownDrivers parameters & random ranges
    knownDriversFrom: __ENV.KNOWN_DRIVERS_FROM || null,
    knownDriversFromMin: __ENV.KNOWN_DRIVERS_FROM_MIN || '2026-01-01T00:00:00',
    knownDriversFromMax: __ENV.KNOWN_DRIVERS_FROM_MAX || '2026-08-27T00:00:00',
    knownDriversStart: parseInt(__ENV.KNOWN_DRIVERS_START || '1', 10),
    knownDriversCount: __ENV.KNOWN_DRIVERS_COUNT ? parseInt(__ENV.KNOWN_DRIVERS_COUNT, 10) : null,
    knownDriversCountMin: parseInt(__ENV.KNOWN_DRIVERS_COUNT_MIN || '1', 10),
    knownDriversCountMax: parseInt(__ENV.KNOWN_DRIVERS_COUNT_MAX || '100', 10),
    // GetKnownDriverChanges parameters & random ranges
    knownDriverChangesDateMin: __ENV.KNOWN_DRIVER_CHANGES_DATE_MIN || '2026-01-01',
    knownDriverChangesDateMax: __ENV.KNOWN_DRIVER_CHANGES_DATE_MAX || '2026-08-27',
    knownDriverChangesYear: parseInt(__ENV.KNOWN_DRIVER_CHANGES_YEAR || '0', 10) || null,
    knownDriverChangesMonth: parseInt(__ENV.KNOWN_DRIVER_CHANGES_MONTH || '0', 10) || null,
    knownDriverChangesDay: parseInt(__ENV.KNOWN_DRIVER_CHANGES_DAY || '0', 10) || null,
    knownDriverChangesTotal: __ENV.KNOWN_DRIVER_CHANGES_TOTAL ? parseInt(__ENV.KNOWN_DRIVER_CHANGES_TOTAL, 10) : null,
    knownDriverChangesTotalMin: parseInt(__ENV.KNOWN_DRIVER_CHANGES_TOTAL_MIN || '1', 10),
    knownDriverChangesTotalMax: parseInt(__ENV.KNOWN_DRIVER_CHANGES_TOTAL_MAX || '100', 10),
    knownDriverChangesBurnt: parseInt(__ENV.KNOWN_DRIVER_CHANGES_BURNT || '0', 10),
    companyLocationId: __ENV.COMPANY_LOCATION_ID || '00000000-0000-0000-0000-000000000000',
    companyLocationMonitorId: __ENV.COMPANY_LOCATION_MONITOR_ID || '00000000-0000-0000-0000-000000000000',
  },
};
