/**
 * Developer Template: callKioskPing
 * Endpoint: /device/kiosk.asmx (Ping - SOAP 1.1)
 *
 * Developers can copy this structure to add new endpoints to the catalog.
 */
export const callKioskPingTemplate = {
  id: 'callKioskPing',
  name: 'callKioskPing',
  displayName: 'Kiosk Ping (Health Check)',
  category: 'Kiosk Service',
  description:
    'Executes SOAP 1.1 Ping requests against /device/kiosk.asmx sending kioskID from the confirmed ID list for the run.',
  protocol: 'SOAP',
  soapVersion: '1.1',
  service: '/device/kiosk.asmx',
  soapAction: 'http://kleverlogic.com/webservices/Ping',
  operationName: 'Ping',
  xmlNamespace: 'http://kleverlogic.com/webservices/',
  defaultTimeout: '30s',
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
    usesDateRange: false,
    usesQuantities: false,
  },

  defaultThresholds: {
    p50MaxDurationMs: 200,
    p90MaxDurationMs: 500,
    p95MaxDurationMs: 1000,
    p99MaxDurationMs: 2000,
    maxErrorRate: 0.01,
  },

  // Predefined assertions matching current test suite
  availableAssertions: [
    {
      id: 'status_200',
      label: 'kiosk_ping status is 200',
      type: 'http_status',
      expected: 200,
      defaultEnabled: true,
      description: 'Verifies that the HTTP response status is 200.',
    },
    {
      id: 'no_soap_fault',
      label: 'kiosk_ping no SOAP fault',
      type: 'no_soap_fault',
      defaultEnabled: true,
      description: 'Verifies that the XML response body does not contain <soap:Fault> or <Fault> tags.',
    },
  ],
};
