/**
 * Developer Template: callKioskCompleteTicket1
 * Endpoint: /device/kiosk.asmx (CompleteTicket1 - SOAP 1.2)
 *
 * SOAP 1.2 implementation that completes a ticket by ticketID (GUID), kioskID, and calledAt timestamp.
 * If preceded by IssueTicket2 in the scenario, it automatically completes that exact generated ticket.
 */
export const callKioskCompleteTicket1Template = {
  id: 'callKioskCompleteTicket1',
  name: 'callKioskCompleteTicket1',
  displayName: 'Kiosk CompleteTicket1',
  category: 'Kiosk Service',
  description:
    'Completes a parking ticket at /device/kiosk.asmx (SOAP 1.2) using kioskID, calledAt, and ticketID.',
  protocol: 'SOAP',
  soapVersion: '1.2',
  service: '/device/kiosk.asmx',
  soapAction: 'http://kleverlogic.com/webservices/CompleteTicket1',
  operationName: 'CompleteTicket1',
  xmlNamespace: 'http://kleverlogic.com/webservices/',
  defaultTimeout: '60s',
  defaultThinkTimeSec: 0.5,
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
      ticketID: '', // Fallback GUID if run independently without preceding IssueTicket2
      calledAt: '', // Fallback dateTime string (ISO)
    },
  },

  defaultThresholds: {
    p50MaxDurationMs: 400,
    p90MaxDurationMs: 800,
    p95MaxDurationMs: 1500,
    p99MaxDurationMs: 3000,
    maxErrorRate: 0.01,
  },

  availableAssertions: [
    {
      id: 'status_200',
      label: 'kiosk_complete_ticket status is 200',
      type: 'http_status',
      expected: 200,
      defaultEnabled: true,
      description: 'Verifies that the HTTP response status is 200.',
    },
    {
      id: 'no_soap_fault',
      label: 'kiosk_complete_ticket no SOAP fault',
      type: 'no_soap_fault',
      defaultEnabled: true,
      description: 'Verifies that the XML response body does not contain SOAP Fault tags.',
    },
    {
      id: 'result_code_success',
      label: 'kiosk_complete_ticket result code success',
      type: 'xml_not_contains',
      expected: 'Failed',
      defaultEnabled: true,
      description: 'Verifies that the response Code is not Failed.',
    },
  ],
};
