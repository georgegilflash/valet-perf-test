/**
 * Developer Template: callKioskGetTicket
 * Endpoint: /device/kiosk.asmx (GetTicket - SOAP 1.2)
 *
 * SOAP 1.2 implementation that queries/verifies a ticket by ticketID (GUID) and kioskID.
 * If preceded by IssueTicket2 in the scenario, it automatically verifies that exact generated ticket.
 */
export const callKioskGetTicketTemplate = {
  id: 'callKioskGetTicket',
  name: 'callKioskGetTicket',
  displayName: 'Kiosk GetTicket',
  category: 'Kiosk Service',
  description:
    'Retrieves and verifies parking ticket details from /device/kiosk.asmx (SOAP 1.2) using ticketID and kioskID.',
  protocol: 'SOAP',
  soapVersion: '1.2',
  service: '/device/kiosk.asmx',
  soapAction: 'http://kleverlogic.com/webservices/GetTicket',
  operationName: 'GetTicket',
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
      ticketID: '', // Optional fallback GUID if run independently without preceding IssueTicket2
    },
  },

  defaultThresholds: {
    p95MaxDurationMs: 3000,
    maxErrorRate: 0.01,
  },

  availableAssertions: [
    {
      id: 'status_200',
      label: 'kiosk_get_ticket status is 200',
      type: 'http_status',
      expected: 200,
      defaultEnabled: true,
      description: 'Verifies that the HTTP response status is 200.',
    },
    {
      id: 'no_soap_fault',
      label: 'kiosk_get_ticket no SOAP fault',
      type: 'no_soap_fault',
      defaultEnabled: true,
      description: 'Verifies that the XML response body does not contain SOAP Fault tags.',
    },
    {
      id: 'result_code_success',
      label: 'kiosk_get_ticket result code success',
      type: 'xml_not_contains',
      expected: 'Failed',
      defaultEnabled: true,
      description: 'Verifies that the response Code is not Failed.',
    },
  ],
};
