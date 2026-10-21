import { check, sleep, group } from 'k6';
import { apiClient } from '../client/api-client.js';
import { validateResponse } from '../utils/metrics.js';
import { 
  buildSoap11Envelope, 
  buildSoap12Envelope, 
  buildWsSecurityHeader, 
  extractXmlValue, 
  isSoapFault,
  formatXml
} from '../utils/xml.js';
import { getVuToken } from '../utils/tokens.js';
import { config } from '../../config/env.js';

/**
 * Builds NewMessages4 SOAP Body
 * @param {string} loginToken
 * @param {string|boolean} compressed
 * @param {number|string} seconds
 */
export function getSoapRequestBody(
  loginToken = config.soap.loginToken,
  compressed = config.soap.compressed,
  seconds = config.soap.pollSeconds
) {
  return `
    <NewMessages4 xmlns="http://kleverlogic.com/webservices/">
      <loginToken>${loginToken}</loginToken>
      <compressed>${compressed}</compressed>
      <seconds>${seconds}</seconds>
    </NewMessages4>`;
}

/**
 * Execute SOAP Web Service Test Flow for NewMessages4
 * @param {string} [customToken] - optional token override (for multi-token scenarios)
 */
export function executeSoapFlow(customToken = null) {
  group('SOAP_NewMessages4_Call', () => {
    const endpoint = config.soap.endpoint;
    const action = config.soap.action;
    const version = config.soap.version;
    // Each VU gets its unique assigned token from tokens.json (or fallback)
    const token = customToken || getVuToken(__VU, config.soap.loginToken);

    // Optional WS-Security Header if credentials provided
    const wsSecurityHeader = (config.auth.username && config.auth.password)
      ? buildWsSecurityHeader(config.auth.username, config.auth.password)
      : '';

    // Build complete SOAP envelope according to version
    const bodyContent = getSoapRequestBody(token, config.soap.compressed, config.soap.pollSeconds);
    const envelope = version === '1.2'
      ? buildSoap12Envelope(bodyContent, wsSecurityHeader)
      : buildSoap11Envelope(bodyContent, wsSecurityHeader);

    // Send SOAP POST Request (uses timeout defined in config, default 90s)
    const res = apiClient.soap(endpoint, action, envelope, {
      name: 'SOAP_NewMessages4',
      timeout: config.timeout,
    }, version);

    // Validate Response
    const hasFault = isSoapFault(res.body);
    const hasResponseTag = res.body && (
      res.body.includes('NewMessages4Response') || 
      res.body.includes('NewMessages4Result')
    );

    const isSuccess = res.status === 200 && !hasFault;
    const durationSec = (res.timings.duration / 1000).toFixed(2);

    // Real-time console log for execution feedback
    if (!isSuccess) {
      console.log(`[VU ${__VU}] FAILED (Status ${res.status}) in ${durationSec}s | Token: ${token.substring(0, 8)}... | Error: ${res.error || (hasFault ? 'SOAP Fault' : 'Non-200')} | Code: ${res.error_code}`);
    } 
    // else {
    //   console.log(`[VU ${__VU}] OK (Status 200) in ${durationSec}s | Token: ${token.substring(0, 8)}...`);
    // }

    // Print full response body if DEBUG_RESPONSE=true or if request failed
    if (config.debugResponse || !isSuccess) {
      console.log(`\n---------------- [VU ${__VU}] RESPONSE BODY (HTTP ${res.status}) ----------------`);
      console.log(formatXml(res.body));
      console.log(`----------------------------------------------------------------------\n`);
    }

    check(res, {
      'SOAP HTTP status is 200': (r) => r.status === 200,
      'SOAP response has body': (r) => r.body && r.body.length > 0,
      'SOAP response is not a Fault': () => !hasFault,
      'SOAP contains NewMessages4Response': () => Boolean(hasResponseTag),
    });

    validateResponse(res, 'SOAP_NewMessages4', 200);
  });

  // Short pause before next iteration if any
  const thinkTime = parseFloat(__ENV.THINK_TIME_SEC || '1.0');
  if (thinkTime > 0) {
    sleep(thinkTime);
  }
}
