/**
 * Developer Template: callPMSNewMessages
 * Endpoint: /device/pms.asmx (NewMessages - SOAP 1.2)
 *
 * Developers can copy this structure to add new endpoints to the catalog.
 */
export const callPmsNewMessagesTemplate = {
  id: 'callPmsNewMessages',
  name: 'callPMSNewMessages',
  displayName: 'PMS NewMessages (Long-Poll)',
  category: 'PMS Service',
  description:
    'Executes SOAP 1.2 NewMessages requests against /device/pms.asmx sending companyLocationID from the confirmed ID list for the run.',
  protocol: 'SOAP',
  soapVersion: '1.2',
  service: '/device/pms.asmx',
  soapAction: null,
  operationName: 'NewMessages',
  xmlNamespace: 'http://tempuri.org/',
  defaultTimeout: '60s',
  defaultThinkTimeSec: 1.0,
  defaultUsersPerStage: [20, 50, 100, 40, 0],

  // Data requirements used by this endpoint
  dataRequirements: {
    primaryIdPool: {
      key: 'locationIds',
      poolFile: 'location-ids.json',
      xmlElement: 'companyLocationID',
      label: 'Company Location IDs (locationIds)',
      defaultSelectionMode: 'random', // 'random' | 'per-vu'
      defaultCount: 15,
    },
    usesUserGuids: false,
    usesKioskIds: false,
    usesLocationIds: true,
    usesDateRange: false,
    usesQuantities: false,
  },

  defaultThresholds: {
    p95MaxDurationMs: 65000,
    maxErrorRate: 0.01,
  },

  // Predefined assertions matching current test suite
  availableAssertions: [
    {
      id: 'status_200',
      label: 'pms_new_messages status is 200',
      type: 'http_status',
      expected: 200,
      defaultEnabled: true,
      description: 'Verifies that the HTTP response status is 200.',
    },
    {
      id: 'no_soap_fault',
      label: 'pms_new_messages no SOAP fault',
      type: 'no_soap_fault',
      defaultEnabled: true,
      description: 'Verifies that the XML response body does not contain <soap:Fault> or <Fault> tags.',
    },
  ],
};
