/**
 * Developer Template: callKioskIssueTicket2
 * Endpoint: /device/kiosk.asmx (IssueTicket2 - SOAP 1.2)
 *
 * SOAP 1.2 implementation that creates/issues a parking ticket in the system
 * with dynamic GUID ticketID, ticketNumber (PERF-XXXX), kioskID, and timestamps.
 */
export const callKioskIssueTicket2Template = {
  id: 'callKioskIssueTicket2',
  name: 'callKioskIssueTicket2',
  displayName: 'Kiosk IssueTicket2',
  category: 'Kiosk Service',
  description:
    'Issues and registers a new parking ticket in /device/kiosk.asmx (SOAP 1.2) with a random GUID ticketID and PERF-timestamp ticketNumber.',
  protocol: 'SOAP',
  soapVersion: '1.2',
  service: '/device/kiosk.asmx',
  soapAction: 'http://kleverlogic.com/webservices/IssueTicket2',
  operationName: 'IssueTicket2',
  xmlNamespace: 'http://kleverlogic.com/webservices/',
  defaultTimeout: '60s',
  defaultThinkTimeSec: 5.0,
  defaultUsersPerStage: [5, 5, 5, 5, 0],

  dataRequirements: {
    primaryIdPool: {
      key: 'kioskIds',
      poolFile: 'kiosk-ids.json',
      xmlElement: 'kioskID',
      label: 'Kiosk IDs (kioskID)',
      defaultSelectionMode: 'per-vu', // 'per-vu' | 'random'
      defaultCount: 5,
    },
    usesUserGuids: false,
    usesKioskIds: true,
    usesLocationIds: false,
    usesDateRange: false,
    usesQuantities: false,
    customParams: {
      ticketNumberPrefix: 'PERF-',
    },
  },

  defaultThresholds: {
    p95MaxDurationMs: 3000,
    maxErrorRate: 0.01,
  },

  availableAssertions: [
    {
      id: 'status_200',
      label: 'kiosk_issue_ticket_2 status is 200',
      type: 'http_status',
      expected: 200,
      defaultEnabled: true,
      description: 'Verifies that the HTTP response status is 200.',
    },
    {
      id: 'no_soap_fault',
      label: 'kiosk_issue_ticket_2 no SOAP fault',
      type: 'no_soap_fault',
      defaultEnabled: true,
      description: 'Verifies that the XML response body does not contain SOAP Fault tags.',
    },
    {
      id: 'result_code_success',
      label: 'kiosk_issue_ticket_2 result code success',
      type: 'xml_not_contains',
      expected: 'Failed',
      defaultEnabled: true,
      description: 'Verifies that the response Code is not Failed.',
    },
  ],
};
