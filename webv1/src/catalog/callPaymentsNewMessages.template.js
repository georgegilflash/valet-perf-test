/**
 * Developer Template: callPaymentsNewMessages
 * Endpoint: /device/payments.asmx (NewMessages - SOAP 1.2)
 *
 * SOAP 1.2 implementation that queries /device/payments.asmx
 * using companyLocationID from QA3 locations pool.
 */
export const callPaymentsNewMessagesTemplate = {
  id: 'callPaymentsNewMessages',
  name: 'callPaymentsNewMessages',
  displayName: 'Payments NewMessages (QA 3)',
  category: 'Payments Service',
  description:
    'Executes SOAP 1.2 NewMessages long-poll requests against /device/payments.asmx sending companyLocationID from QA3 locations pool.',
  protocol: 'SOAP',
  soapVersion: '1.2',
  service: '/device/payments.asmx',
  soapAction: null,
  operationName: 'NewMessages',
  xmlNamespace: 'http://tempuri.org/',
  defaultTimeout: '65s',
  defaultThinkTimeSec: 1.0,
  defaultUsersPerStage: [20, 50, 100, 40, 0],

  dataRequirements: {
    primaryIdPool: {
      key: 'locationIdsQa3',
      poolFile: 'location-ids-qa3.json',
      xmlElement: 'companyLocationID',
      label: 'QA3 Location IDs (companyLocationID)',
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
    p90MaxDurationMs: 30000,
    p95MaxDurationMs: 60000,
    p99MaxDurationMs: 65000,
    maxErrorRate: 0.01,
  },

  availableAssertions: [
    {
      id: 'status_200',
      label: 'payments_new_messages status is 200',
      type: 'http_status',
      expected: 200,
      defaultEnabled: true,
      description: 'Verifies that the HTTP response status is 200.',
    },
    {
      id: 'no_soap_fault',
      label: 'payments_new_messages no SOAP fault',
      type: 'no_soap_fault',
      defaultEnabled: true,
      description: 'Verifies that the XML response body does not contain SOAP Fault tags.',
    },
  ],
};
