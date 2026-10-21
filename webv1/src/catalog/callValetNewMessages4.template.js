/**
 * Developer Template: callValetNewMessages4
 * Endpoint: /device/valet.asmx (NewMessages4 - SOAP 1.1 / 1.2)
 */
export const callValetNewMessages4Template = {
  id: 'callValetNewMessages4',
  name: 'callValetNewMessages4',
  displayName: 'Valet NewMessages4 (Long-Poll)',
  category: 'Valet Service',
  description:
    'Executes SOAP NewMessages4 requests against /device/valet.asmx sending loginToken from tokens.json, compressed flag, and seconds polling duration.',
  protocol: 'SOAP',
  soapVersion: '1.1',
  service: '/device/valet.asmx',
  soapAction: 'http://kleverlogic.com/webservices/NewMessages4',
  operationName: 'NewMessages4',
  xmlNamespace: 'http://kleverlogic.com/webservices/',
  defaultTimeout: '90s',
  defaultThinkTimeSec: 1.0,
  defaultUsersPerStage: [5, 15, 30, 10, 0],

  dataRequirements: {
    primaryIdPool: {
      key: 'tokens',
      poolFile: 'tokens.json',
      xmlElement: 'loginToken',
      label: 'Login Tokens (tokens.json)',
      defaultSelectionMode: 'per-vu', // Typically per-VU assigned loginToken
      defaultCount: 20,
    },
    usesUserGuids: false,
    usesKioskIds: false,
    usesLocationIds: false,
    usesTokens: true,
    usesDateRange: false,
    usesQuantities: false,
    customParams: {
      compressed: 'true',
      seconds: 60,
    },
  },

  defaultThresholds: {
    p50MaxDurationMs: 65000,
    p90MaxDurationMs: 75000,
    p95MaxDurationMs: 85000,
    p99MaxDurationMs: 90000,
    maxErrorRate: 0.01,
  },

  availableAssertions: [
    {
      id: 'status_200',
      label: 'valet_new_messages4 status is 200',
      type: 'http_status',
      expected: 200,
      defaultEnabled: true,
      description: 'Verifies that the HTTP response status is 200.',
    },
    {
      id: 'no_soap_fault',
      label: 'valet_new_messages4 no SOAP fault',
      type: 'no_soap_fault',
      defaultEnabled: true,
      description: 'Verifies that the XML response body does not contain <soap:Fault> or <Fault> tags.',
    },
    {
      id: 'contains_newmessages4_response',
      label: 'valet contains NewMessages4Response/Result',
      type: 'body_contains',
      expected: 'NewMessages4',
      defaultEnabled: true,
      description: 'Verifies response contains NewMessages4Response or NewMessages4Result.',
    },
  ],
};
