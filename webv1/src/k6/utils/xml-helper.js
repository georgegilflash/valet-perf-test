/**
 * XML & SOAP Envelope Utilities for k6 Dynamic Runner
 */

export function isSoapFault(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') return false;
  return /<(?:[\w-]+:)?Fault(?:\s+[^>]*)?>/i.test(xmlString);
}

export function extractXmlValue(xmlString, tagName) {
  if (!xmlString || typeof xmlString !== 'string') return null;
  const regex = new RegExp(
    `<(?:[\\w-]+:)?${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tagName}>`,
    'i'
  );
  const match = xmlString.match(regex);
  return match ? match[1].trim() : null;
}

export function extractAllXmlValues(xmlString, tagName) {
  if (!xmlString || typeof xmlString !== 'string') return [];
  const regex = new RegExp(
    `<(?:[\\w-]+:)?${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tagName}>`,
    'gi'
  );
  const results = [];
  let match;
  while ((match = regex.exec(xmlString)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

/**
 * Formats/indents XML strings for human-readable console output.
 */
export function formatXml(xmlString, indent = '  ') {
  if (!xmlString || typeof xmlString !== 'string') return '(empty)';
  const trimmed = xmlString.trim();
  if (!trimmed.startsWith('<')) return trimmed;

  const normalized = trimmed.replace(/>\s*</g, '>\n<');
  const lines = normalized.split(/\r?\n/);
  let padLevel = 0;
  const formattedLines = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^<\/[^>]+>$/.test(line)) {
      padLevel = Math.max(0, padLevel - 1);
      formattedLines.push(indent.repeat(padLevel) + line);
    } else if (/^<\?[\s\S]*\?>$/.test(line) || /^<![\s\S]*>$/.test(line)) {
      formattedLines.push(indent.repeat(padLevel) + line);
    } else if (/^<[^>]+\/>$/.test(line)) {
      formattedLines.push(indent.repeat(padLevel) + line);
    } else if (/^<([^\s/>]+)[^>]*>[\s\S]*<\/\1>$/.test(line)) {
      formattedLines.push(indent.repeat(padLevel) + line);
    } else if (/^<[^/!?][^>]*>$/.test(line)) {
      formattedLines.push(indent.repeat(padLevel) + line);
      padLevel++;
    } else {
      formattedLines.push(indent.repeat(padLevel) + line);
    }
  }

  return formattedLines.join('\n');
}

export function generateRandomGuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

/**
 * Produces a concise, informative 1-line or multi-line summary of the response body.
 */
export function summarizeResponseBody(body, maxLength = 260) {
  if (!body || typeof body !== 'string') return '(empty)';
  const trimmed = body.trim();

  // Try extracting common SOAP / XML elements
  const code = extractXmlValue(trimmed, 'Code');
  const description = extractXmlValue(trimmed, 'Description');
  const message = extractXmlValue(trimmed, 'Message') || extractXmlValue(trimmed, 'faultstring');
  const ticketNumber = extractXmlValue(trimmed, 'ticketNumber') || extractXmlValue(trimmed, 'TicketNumber');
  const ticketId = extractXmlValue(trimmed, 'ticketID') || extractXmlValue(trimmed, 'TicketID');
  const knownDrivers = extractAllXmlValues(trimmed, 'KnownDriver');
  const dbChanges = extractAllXmlValues(trimmed, 'DatabaseChange');

  const details = [];
  if (code) details.push(`Code: ${code}`);
  if (ticketNumber) details.push(`TicketNum: ${ticketNumber}`);
  if (ticketId) details.push(`TicketID: ${ticketId.slice(0, 8)}...`);
  if (description) details.push(`Desc: ${description}`);
  if (message) details.push(`Msg: ${message}`);
  if (knownDrivers.length > 0) details.push(`KnownDrivers: ${knownDrivers.length}`);
  if (dbChanges.length > 0) details.push(`DatabaseChanges: ${dbChanges.length}`);

  if (details.length > 0) {
    return details.join(' | ');
  }

  // Fallback: clean snippet
  const flattened = trimmed.replace(/\s+/g, ' ');
  if (flattened.length <= maxLength) return flattened;
  return flattened.slice(0, maxLength) + '...';
}

export function buildSoapEnvelope(endpointConfig, selectedIdValue, context = {}) {
  // Allow user to provide a raw customXmlBody in JSON if they added a custom endpoint
  if (endpointConfig.customXmlBody && typeof endpointConfig.customXmlBody === 'string') {
    return endpointConfig.customXmlBody.replace(/\{\{ID\}\}/g, selectedIdValue || '');
  }

  const soapVersion = String(endpointConfig.soapVersion || '1.1');
  const opName = endpointConfig.operationName || 'Ping';
  const ns = endpointConfig.xmlNamespace || 'http://kleverlogic.com/webservices/';
  const xmlElement = endpointConfig.data?.xmlElement || 'id';

  // Specific handler for GetKnownDrivers (SOAP 1.2)
  if (opName === 'GetKnownDrivers' || endpointConfig.id === 'callKioskGetKnownDrivers') {
    const fromDate = endpointConfig.data?.from || endpointConfig.data?.fromDate || endpointConfig.data?.dateRange?.fromMin || '2026-08-27T00:00:00';
    const start = endpointConfig.data?.start !== undefined ? endpointConfig.data.start : 0;
    const count = endpointConfig.data?.count !== undefined ? endpointConfig.data.count : (endpointConfig.data?.quantities?.max || 10);
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <GetKnownDrivers xmlns="http://kleverlogic.com/webservices/">
      <kioskID>${selectedIdValue || ''}</kioskID>
      <from>${fromDate}</from>
      <start>${start}</start>
      <count>${count}</count>
    </GetKnownDrivers>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // Specific handler for GetKnownDriverChanges (SOAP 1.2)
  if (opName === 'GetKnownDriverChanges' || endpointConfig.id === 'callKioskGetKnownDriverChanges') {
    const year = endpointConfig.data?.year !== undefined ? endpointConfig.data.year : 2026;
    const month = endpointConfig.data?.month !== undefined ? endpointConfig.data.month : 8;
    const day = endpointConfig.data?.day !== undefined ? endpointConfig.data.day : 27;
    const total = endpointConfig.data?.total !== undefined ? endpointConfig.data.total : 0;
    const burnt = endpointConfig.data?.burnt !== undefined ? endpointConfig.data.burnt : 0;
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <GetKnownDriverChanges xmlns="http://kleverlogic.com/webservices/">
      <kioskID>${selectedIdValue || ''}</kioskID>
      <client>
        <DatabaseChange>
          <Year xmlns="urn:KleverLogic.FlashParcs.Web">${year}</Year>
          <Month xmlns="urn:KleverLogic.FlashParcs.Web">${month}</Month>
          <Day xmlns="urn:KleverLogic.FlashParcs.Web">${day}</Day>
          <Total xmlns="urn:KleverLogic.FlashParcs.Web">${total}</Total>
          <Burnt xmlns="urn:KleverLogic.FlashParcs.Web">${burnt}</Burnt>
        </DatabaseChange>
      </client>
    </GetKnownDriverChanges>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // Specific handler for IssueTicket2 (SOAP 1.2)
  if (opName === 'IssueTicket2' || endpointConfig.id === 'callKioskIssueTicket2') {
    const randomSuffix = Math.floor(Math.random() * 100) + 1;
    const ticketID = context?.ticketID || endpointConfig.data?.ticketID || generateRandomGuid();
    const ticketNumber = context?.ticketNumber || endpointConfig.data?.ticketNumber || `PERF-${Date.now()}-${randomSuffix}`;
    const nowIso = new Date().toISOString().slice(0, 19);
    const calledAt = endpointConfig.data?.calledAt || nowIso;
    const issuedAt = endpointConfig.data?.issuedAt || nowIso;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <IssueTicket2 xmlns="http://kleverlogic.com/webservices/">
      <kioskID>${selectedIdValue || ''}</kioskID>
      <calledAt>${calledAt}</calledAt>
      <ticketID>${ticketID}</ticketID>
      <ticketNumber>${ticketNumber}</ticketNumber>
      <issuedAt>${issuedAt}</issuedAt>
    </IssueTicket2>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // Specific handler for GetTicket (SOAP 1.2)
  if (opName === 'GetTicket' || endpointConfig.id === 'callKioskGetTicket') {
    const ticketID = context?.ticketID || endpointConfig.data?.ticketID || '';
    const nowIso = new Date().toISOString().slice(0, 19);
    const calledAt = endpointConfig.data?.calledAt || nowIso;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <GetTicket xmlns="http://kleverlogic.com/webservices/">
      <kioskID>${selectedIdValue || ''}</kioskID>
      <ticketID>${ticketID}</ticketID>
      <calledAt>${calledAt}</calledAt>
    </GetTicket>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // Specific handler for CompleteTicket1 (SOAP 1.2)
  if (opName === 'CompleteTicket1' || endpointConfig.id === 'callKioskCompleteTicket1') {
    const ticketID = context?.ticketID || endpointConfig.data?.ticketID || '';
    const nowIso = new Date().toISOString().slice(0, 19);
    const calledAt = endpointConfig.data?.calledAt || nowIso;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <CompleteTicket1 xmlns="http://kleverlogic.com/webservices/">
      <kioskID>${selectedIdValue || ''}</kioskID>
      <calledAt>${calledAt}</calledAt>
      <ticketID>${ticketID}</ticketID>
    </CompleteTicket1>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // Specific handler for Valet NewMessages4 (SOAP 1.1 / 1.2)
  if (opName === 'NewMessages4' || endpointConfig.id === 'callValetNewMessages4') {
    const compressed = endpointConfig.data?.compressed !== undefined ? endpointConfig.data.compressed : 'true';
    const seconds = endpointConfig.data?.seconds !== undefined ? endpointConfig.data.seconds : 60;
    const bodyContent = `
    <NewMessages4 xmlns="${ns}">
      <loginToken>${selectedIdValue || ''}</loginToken>
      <compressed>${compressed}</compressed>
      <seconds>${seconds}</seconds>
    </NewMessages4>`;

    if (soapVersion === '1.2') {
      return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>${bodyContent}
  </soap12:Body>
</soap12:Envelope>`;
    }

    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>${bodyContent}
  </soap:Body>
</soap:Envelope>`;
  }

  const innerParam = selectedIdValue
    ? `<${xmlElement}>${selectedIdValue}</${xmlElement}>`
    : '';

  if (soapVersion === '1.2') {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <${opName} xmlns="${ns}">
      ${innerParam}
    </${opName}>
  </soap12:Body>
</soap12:Envelope>`;
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${opName} xmlns="${ns}">
      ${innerParam}
    </${opName}>
  </soap:Body>
</soap:Envelope>`;
}
