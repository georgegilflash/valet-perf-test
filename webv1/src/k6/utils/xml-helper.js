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

export function buildSoapEnvelope(endpointConfig, selectedIdValue) {
  // Allow user to provide a raw customXmlBody in JSON if they added a custom endpoint
  if (endpointConfig.customXmlBody && typeof endpointConfig.customXmlBody === 'string') {
    return endpointConfig.customXmlBody.replace(/\{\{ID\}\}/g, selectedIdValue || '');
  }

  const soapVersion = String(endpointConfig.soapVersion || '1.1');
  const opName = endpointConfig.operationName || 'Ping';
  const ns = endpointConfig.xmlNamespace || 'http://kleverlogic.com/webservices/';
  const xmlElement = endpointConfig.data?.xmlElement || 'id';

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
