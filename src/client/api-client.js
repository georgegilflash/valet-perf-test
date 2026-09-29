import http from 'k6/http';
import encoding from 'k6/encoding';
import { config } from '../../config/env.js';

/**
 * Reusable HTTP & SOAP API Client with centralized Auth & Header handling
 */
export class ApiClient {
  constructor(customConfig = {}) {
    this.baseUrl = customConfig.baseUrl || config.baseUrl;
    this.auth = customConfig.auth || config.auth;
    this.timeout = customConfig.timeout || config.timeout;
  }

  /**
   * Build authentication headers (Bearer, Basic, or API Key)
   */
  getAuthHeaders() {
    const headers = {};

    // Bearer token authentication
    if (this.auth.token) {
      headers['Authorization'] = `${this.auth.tokenType || 'Bearer'} ${this.auth.token}`;
    } 
    // Basic authentication (Username + Password)
    else if (this.auth.username && this.auth.password) {
      const credentials = `${this.auth.username}:${this.auth.password}`;
      headers['Authorization'] = `Basic ${encoding.b64encode(credentials)}`;
    }

    // Optional API Key header
    if (this.auth.apiKey) {
      headers['x-api-key'] = this.auth.apiKey;
    }

    return headers;
  }

  /**
   * Build standard REST headers including authentication
   */
  getHeaders(customHeaders = {}) {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...this.getAuthHeaders(),
      ...customHeaders,
    };
  }

  /**
   * Resolve relative or absolute endpoint URL
   */
  resolveUrl(endpoint) {
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${this.baseUrl}${cleanEndpoint}`;
  }

  /**
   * Generic HTTP Request wrapper (for REST / JSON APIs)
   */
  request(method, endpoint, body = null, params = {}) {
    const url = this.resolveUrl(endpoint);
    const options = {
      ...params,
      headers: this.getHeaders(params.headers),
      timeout: params.timeout || this.timeout,
      tags: {
        name: params.name || endpoint,
        ...(params.tags || {}),
      },
    };

    const payload = body && typeof body === 'object' ? JSON.stringify(body) : body;

    switch (method.toUpperCase()) {
      case 'GET':
        return http.get(url, options);
      case 'POST':
        return http.post(url, payload, options);
      case 'PUT':
        return http.put(url, payload, options);
      case 'PATCH':
        return http.patch(url, payload, options);
      case 'DELETE':
        return http.del(url, payload, options);
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
  }

  get(endpoint, params = {}) {
    return this.request('GET', endpoint, null, params);
  }

  post(endpoint, body = {}, params = {}) {
    return this.request('POST', endpoint, body, params);
  }

  put(endpoint, body = {}, params = {}) {
    return this.request('PUT', endpoint, body, params);
  }

  patch(endpoint, body = {}, params = {}) {
    return this.request('PATCH', endpoint, body, params);
  }

  del(endpoint, params = {}) {
    return this.request('DELETE', endpoint, null, params);
  }

  /**
   * Execute a SOAP Web Service Request (SOAP 1.1 or 1.2)
   * 
   * @param {string} endpoint - service URL or relative path
   * @param {string} soapAction - SOAPAction header URI (e.g. 'http://tempuri.org/GetData')
   * @param {string} xmlEnvelope - full XML Envelope string
   * @param {object} params - optional request params, tags, or header overrides
   * @param {string} version - '1.1' or '1.2' (defaults to config or '1.1')
   */
  soap(endpoint, soapAction, xmlEnvelope, params = {}, version = null) {
    const url = this.resolveUrl(endpoint);
    const soapVersion = version || config.soap.version || '1.1';

    // Content-Type differs between SOAP 1.1 and 1.2
    const contentType = soapVersion === '1.2'
      ? `application/soap+xml; charset=utf-8${soapAction ? `; action="${soapAction}"` : ''}`
      : 'text/xml; charset=utf-8';

    const soapHeaders = {
      'Content-Type': contentType,
    };

    // SOAP 1.1 requires SOAPAction header
    if (soapVersion === '1.1' && soapAction) {
      soapHeaders['SOAPAction'] = soapAction.startsWith('"') ? soapAction : `"${soapAction}"`;
    }

    const options = {
      ...params,
      headers: {
        ...this.getAuthHeaders(),
        ...soapHeaders,
        ...(params.headers || {}),
      },
      timeout: params.timeout || this.timeout,
      tags: {
        name: params.name || `SOAP_${soapAction || endpoint}`,
        ...(params.tags || {}),
      },
    };

    return http.post(url, xmlEnvelope, options);
  }
}

// Export singleton instance for convenience
export const apiClient = new ApiClient();
