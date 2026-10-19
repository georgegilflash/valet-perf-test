/**
 * Developer Template: callKioskGetKnownDriverChanges
 * Endpoint: /device/kiosk.asmx (GetKnownDriverChanges - SOAP 1.2)
 *
 * SOAP 1.2 implementation querying known driver database changes by kioskID and client DatabaseChange details.
 */
export const callKioskGetKnownDriverChangesTemplate = {
  id: 'callKioskGetKnownDriverChanges',
  name: 'callKioskGetKnownDriverChanges',
  displayName: 'Kiosk GetKnownDriverChanges',
  category: 'Kiosk Service',
  description:
    'Queries known driver changes from /device/kiosk.asmx using SOAP 1.2 with kioskID and DatabaseChange timestamp/counts.',
  protocol: 'SOAP',
  soapVersion: '1.2',
  service: '/device/kiosk.asmx',
  soapAction: 'http://kleverlogic.com/webservices/GetKnownDriverChanges',
  operationName: 'GetKnownDriverChanges',
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
      year: 2026,
      month: 8,
      day: 27,
      total: 0,
      burnt: 0,
    },
  },

  defaultThresholds: {
    p95MaxDurationMs: 3000,
    maxErrorRate: 0.01,
  },

  // Predefined assertions matching current test suite
  availableAssertions: [
    {
      id: 'status_200',
      label: 'kiosk_get_known_driver_changes status is 200',
      type: 'http_status',
      expected: 200,
      defaultEnabled: true,
      description: 'Verifies that the HTTP response status is 200.',
    },
    {
      id: 'no_soap_fault',
      label: 'kiosk_get_known_driver_changes no SOAP fault',
      type: 'no_soap_fault',
      defaultEnabled: true,
      description: 'Verifies that the XML response body does not contain SOAP Fault tags.',
    },
    {
      id: 'result_code_success',
      label: 'kiosk_get_known_driver_changes result code success',
      type: 'xml_not_contains',
      expected: 'Failed',
      defaultEnabled: true,
      description: 'Verifies that the response Code is not Failed.',
    },
  ],
};
