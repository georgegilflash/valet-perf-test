/**
 * Developer Template: callSignNewMessages
 * Endpoint: /device/sign.asmx (NewMessages - SOAP 1.2)
 *
 * SOAP 1.2 implementation that queries /device/sign.asmx
 * using companyLocationMonitorID from QA3 locations pool.
 */
export const callSignNewMessagesTemplate = {
  id: 'callSignNewMessages',
  name: 'callSignNewMessages',
  displayName: 'Sign NewMessages (QA 3)',
  category: 'Sign Service',
  description:
    'Executes SOAP 1.2 NewMessages long-poll requests against /device/sign.asmx sending companyLocationMonitorID from QA3 locations pool.',
  protocol: 'SOAP',
  soapVersion: '1.2',
  service: '/device/sign.asmx',
  soapAction: null,
  operationName: 'NewMessages',
  xmlNamespace: 'http://kleverlogic.com/webservices/',
  defaultTimeout: '95s',
  defaultThinkTimeSec: 1.0,
  defaultUsersPerStage: [20, 50, 100, 40, 0],

  dataRequirements: {
    primaryIdPool: {
      key: 'locationIdsQa3',
      poolFile: 'location-ids-qa3.json',
      xmlElement: 'companyLocationMonitorID',
      label: 'QA3 Location Monitor IDs (companyLocationMonitorID)',
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
    p50MaxDurationMs: 2000,
    p90MaxDurationMs: 45000,
    p95MaxDurationMs: 90000,
    p99MaxDurationMs: 95000,
    maxErrorRate: 0.01,
  },

  availableAssertions: [
    {
      id: 'status_200',
      label: 'sign_new_messages status is 200',
      type: 'http_status',
      expected: 200,
      defaultEnabled: true,
      description: 'Verifies that the HTTP response status is 200.',
    },
    {
      id: 'no_soap_fault',
      label: 'sign_new_messages no SOAP fault',
      type: 'no_soap_fault',
      defaultEnabled: true,
      description: 'Verifies that the XML response body does not contain SOAP Fault tags.',
    },
  ],
};
