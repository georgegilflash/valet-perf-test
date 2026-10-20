import { callPmsNewMessagesTemplate } from './callPmsNewMessages.template.js';
import { callKioskPingTemplate } from './callKioskPing.template.js';
import { callKioskGetKnownDriversTemplate } from './callKioskGetKnownDrivers.template.js';
import { callKioskGetKnownDriverChangesTemplate } from './callKioskGetKnownDriverChanges.template.js';
import { callKioskIssueTicket2Template } from './callKioskIssueTicket2.template.js';
import { callKioskGetTicketTemplate } from './callKioskGetTicket.template.js';
import { callPaymentsNewMessagesTemplate } from './callPaymentsNewMessages.template.js';
import { callSignNewMessagesTemplate } from './callSignNewMessages.template.js';

/**
 * Central Developer Catalog of Endpoint Templates
 * To add a new endpoint to the webview menu, import its template and add it to this array.
 */
export const ENDPOINT_CATALOG = [
  callPmsNewMessagesTemplate,
  callKioskPingTemplate,
  callKioskGetKnownDriversTemplate,
  callKioskGetKnownDriverChangesTemplate,
  callKioskIssueTicket2Template,
  callKioskGetTicketTemplate,
  callPaymentsNewMessagesTemplate,
  callSignNewMessagesTemplate,
];

/**
 * Lookup template by id or name
 * @param {string} idOrName
 */
export function getEndpointTemplate(idOrName) {
  if (!idOrName) return null;
  const normalized = String(idOrName).trim().toLowerCase();
  return (
    ENDPOINT_CATALOG.find(
      (t) =>
        t.id.toLowerCase() === normalized ||
        t.name.toLowerCase() === normalized
    ) || null
  );
}

/**
 * Builds a complete default endpoint configuration instance ready for test-performance-script JSON
 * @param {object} template - catalog template
 * @param {object} poolsMap - { locationIds: string[], kioskIds: string[], userGuids: string[] }
 * @param {number} stagesCount - number of global stages
 */
export function buildEndpointConfigFromTemplate(template, poolsMap = {}, stagesCount = 5) {
  const usersPerStage = [];
  for (let i = 0; i < stagesCount; i++) {
    usersPerStage.push(
      template.defaultUsersPerStage[i] !== undefined
        ? template.defaultUsersPerStage[i]
        : 0
    );
  }

  const maxVUs = Math.max(...usersPerStage, 1);
  const poolReq = template.dataRequirements?.primaryIdPool;
  const poolKey = poolReq ? poolReq.key : null;
  const availableList = (poolKey && Array.isArray(poolsMap[poolKey])) ? poolsMap[poolKey] : [];

  const desiredCount =
    poolReq?.defaultSelectionMode === 'per-vu'
      ? Math.max(maxVUs, poolReq.defaultCount || 5)
      : (poolReq?.defaultCount || 10);

  const selectedIds = availableList.slice(0, Math.min(desiredCount, availableList.length));

  const dataBlock = {
    selectionMode: poolReq?.defaultSelectionMode || 'random',
    xmlElement: poolReq?.xmlElement || 'id',
  };

  if (poolKey) {
    dataBlock[poolKey] = selectedIds.length > 0
      ? selectedIds
      : ['00000000-0000-0000-0000-000000000000'];
  }

  // Include optional metadata fields so the user sees whether date ranges, quantities, or userGuids are used
  dataBlock.usesUserGuids = Boolean(template.dataRequirements?.usesUserGuids);
  dataBlock.usesKioskIds = Boolean(template.dataRequirements?.usesKioskIds);
  dataBlock.usesLocationIds = Boolean(template.dataRequirements?.usesLocationIds);
  dataBlock.dateRange = template.dataRequirements?.usesDateRange
    ? { enabled: true, fromMin: '2026-01-01T00:00:00', fromMax: '2026-08-27T00:00:00' }
    : null;
  dataBlock.quantities = template.dataRequirements?.usesQuantities
    ? { enabled: true, min: 1, max: 100 }
    : null;

  return {
    id: template.id,
    name: template.name,
    displayName: template.displayName,
    enabled: true,
    protocol: template.protocol,
    soapVersion: template.soapVersion,
    service: template.service,
    soapAction: template.soapAction,
    operationName: template.operationName,
    xmlNamespace: template.xmlNamespace,
    timeout: template.defaultTimeout,
    thinkTimeSec: template.defaultThinkTimeSec,
    thinkTimeRange: template.defaultThinkTimeRange
      ? { ...template.defaultThinkTimeRange }
      : { enabled: true, min: template.defaultThinkTimeSec ?? 1.0, max: (template.defaultThinkTimeSec ?? 1.0) + 2.0 },
    usersPerStage,
    data: dataBlock,
    thresholds: {
      ...template.defaultThresholds,
    },
    assertions: template.availableAssertions.map((a) => ({
      id: a.id,
      label: a.label,
      type: a.type,
      expected: a.expected,
      enabled: a.defaultEnabled !== false,
    })),
  };
}
