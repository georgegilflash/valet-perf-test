/**
 * XML and SOAP helper utilities for k6
 */

/**
 * Extracts inner text content of an XML element, ignoring namespace prefixes.
 * Example: extractXmlValue(res.body, 'NumberToWordsResult') or 'AddResult'
 * 
 * @param {string} xmlString - raw XML response body
 * @param {string} tagName - tag name to extract (e.g. 'Status', 'Result')
 * @returns {string|null} inner text or null if not found
 */
export function extractXmlValue(xmlString, tagName) {
  if (!xmlString || typeof xmlString !== 'string') return null;
  // Matches <tag>val</tag> or <prefix:tag attr="...">val</prefix:tag>
  const regex = new RegExp(`<(?:[\\w-]+:)?${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tagName}>`, 'i');
  const match = xmlString.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Checks whether an XML response contains a <soap:Fault> or <Fault> element
 * @param {string} xmlString
 * @returns {boolean}
 */
export function isSoapFault(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') return false;
  return /<(?:[\w-]+:)?Fault(?:\s+[^>]*)?>/i.test(xmlString);
}

/**
 * Generates a standard SOAP 1.1 Envelope
 * @param {string} bodyContent - XML content to place inside <soap:Body>
 * @param {string} [headerContent=''] - optional XML content for <soap:Header>
 * @returns {string} Complete SOAP 1.1 XML string
 */
export function buildSoap11Envelope(bodyContent, headerContent = '') {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  ${headerContent ? `<soap:Header>${headerContent}</soap:Header>` : ''}
  <soap:Body>
    ${bodyContent}
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Generates a standard SOAP 1.2 Envelope
 * @param {string} bodyContent - XML content to place inside <soap12:Body>
 * @param {string} [headerContent=''] - optional XML content for <soap12:Header>
 * @returns {string} Complete SOAP 1.2 XML string
 */
export function buildSoap12Envelope(bodyContent, headerContent = '') {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                 xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  ${headerContent ? `<soap12:Header>${headerContent}</soap12:Header>` : ''}
  <soap12:Body>
    ${bodyContent}
  </soap12:Body>
</soap12:Envelope>`;
}

/**
 * Generates WS-Security (UsernameToken) header XML for SOAP services requiring WSS
 * @param {string} username
 * @param {string} password
 * @returns {string} WS-Security XML block
 */
export function buildWsSecurityHeader(username, password) {
  if (!username) return '';
  return `
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
                   soap:mustUnderstand="1">
      <wsse:UsernameToken>
        <wsse:Username>${username}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${password}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>`;
}
