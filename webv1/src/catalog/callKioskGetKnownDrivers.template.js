/**
 * Developer Template: callKioskGetKnownDrivers
 * Endpoint: /device/kiosk.asmx (GetKnownDrivers - SOAP 1.2)
 *
 * SOAP 1.2 implementation querying known drivers by kioskID, from date, start index, and count.
 */
export const callKioskGetKnownDriversTemplate = {
  id: 'callKioskGetKnownDrivers',
  name: 'callKioskGetKnownDrivers',
  displayName: 'Kiosk GetKnownDrivers',
  category: 'Kiosk Service',
  description:
    'Queries known drivers from /device/kiosk.asmx using SOAP 1.2 with kioskID, from timestamp, start index, and record count.',
  protocol: 'SOAP',
  soapVersion: '1.2',
  service: '/device/kiosk.asmx',
  soapAction: 'http://kleverlogic.com/webservices/GetKnownDrivers',
  operationName: 'GetKnownDrivers',
  xmlNamespace: 'http://kleverlogic.com/webservices/',
  defaultTimeout: '60s',
  defaultThinkTimeSec: 0.5,
  defaultUsersPerStage: [5, 5, 5, 5, 0],

  // Data requirements used by this endpoint
  dataRequirements: {
    primaryIdPool: {
      key: 'kioskIds',
      poolFile: 'kiosk-ids.json',
      xmlElement: 'kioskID',
      label: 'Kiosk IDs (kioskIds)',
      defaultSelectionMode: 'per-vu', // 'per-vu' | 'random'
      defaultCount: 5,
    },
    usesUserGuids: false,
    usesKioskIds: true,
    usesLocationIds: false,
    usesDateRange: true,
    usesQuantities: true,
    // Custom endpoint parameter defaults
    customParams: {
      from: '2026-08-27T00:00:00',
      start: 0,
      count: 10,
    },
  },

  defaultThresholds: {
    p50MaxDurationMs: 400,
    p90MaxDurationMs: 800,
    p95MaxDurationMs: 1500,
    p99MaxDurationMs: 3000,
    maxErrorRate: 0.01,
  },

  // Predefined assertions matching current test suite
  availableAssertions: [
    {
      id: 'status_200',
      label: 'kiosk_get_known_drivers status is 200',
      type: 'http_status',
      expected: 200,
      defaultEnabled: true,
      description: 'Verifies that the HTTP response status is 200.',
    },
    {
      id: 'no_soap_fault',
      label: 'kiosk_get_known_drivers no SOAP fault',
      type: 'no_soap_fault',
      defaultEnabled: true,
      description: 'Verifies that the XML response body does not contain SOAP Fault tags.',
    },
    {
      id: 'result_code_success',
      label: 'kiosk_get_known_drivers result code success',
      type: 'xml_not_contains',
      expected: 'Failed',
      defaultEnabled: true,
      description: 'Verifies that the response Code is not Failed.',
    },
  ],
};
