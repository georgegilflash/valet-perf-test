import { SharedArray } from 'k6/data';

/**
 * Loads kiosk-ids.json into shared memory using SharedArray.
 * SharedArray ensures that Kiosk IDs are only loaded ONCE in memory,
 * even with thousands of concurrent virtual users.
 */
export const loadedKioskIds = new SharedArray('kiosk_ids', function () {
  try {
    const raw = open('../../kiosk-ids.json');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    // If kiosk-ids.json does not exist yet
    return [];
  }
});

/**
 * Validates whether there are sufficient unique Kiosk IDs for the required concurrent VUs.
 *
 * Rules (same as tokens):
 * - The number of Virtual Users must NOT exceed the number of Kiosk IDs in kiosk-ids.json.
 * - If kiosk-ids.json has fewer IDs than requiredVUs (or is empty), return invalid with detailed error.
 * - If kiosk-ids.json has >= requiredVUs: valid, and only the first requiredVUs will be used (1-to-1 per VU).
 *
 * @param {number} requiredVUs - maximum concurrent users required across all stages
 * @returns {{ valid: boolean, error?: string, availableCount: number, requiredCount: number, message?: string }}
 */
export function validateKioskPool(requiredVUs) {
  const available = loadedKioskIds.length;

  if (available === 0) {
    return {
      valid: false,
      availableCount: 0,
      requiredCount: requiredVUs,
      error: `[KIOSK ID VALIDATION FAILED] kiosk-ids.json is missing or empty! Required ${requiredVUs} concurrent Virtual Users. Run 'npm run kiosks' to generate kiosk-ids.json from the CSV file.`,
    };
  }

  if (available < requiredVUs) {
    return {
      valid: false,
      availableCount: available,
      requiredCount: requiredVUs,
      error: `[KIOSK ID VALIDATION FAILED] Required ${requiredVUs} concurrent Virtual Users, but kiosk-ids.json only contains ${available} Kiosk IDs! Virtual users cannot exceed available Kiosk IDs. Run 'npm run kiosks -- ${requiredVUs}' to export sufficient Kiosk IDs.`,
    };
  }

  return {
    valid: true,
    availableCount: available,
    requiredCount: requiredVUs,
    message: `Kiosk ID validation passed: Using first ${requiredVUs} Kiosk IDs out of ${available} available in kiosk-ids.json.`,
  };
}

/**
 * Retrieves the unique Kiosk ID assigned to the current Virtual User (VU).
 * VU IDs in k6 are 1-indexed (VU 1 -> index 0, VU 2 -> index 1, etc.).
 *
 * @param {number} vuId - __VU (1-indexed)
 * @param {string} fallbackKioskId - fallback Kiosk ID from config/env
 * @returns {string} Kiosk GUID string
 */
export function getVuKioskId(vuId, fallbackKioskId) {
  if (loadedKioskIds.length > 0) {
    const index = (vuId && vuId > 0) ? vuId - 1 : 0;
    if (index >= 0 && index < loadedKioskIds.length) {
      return loadedKioskIds[index];
    }
  }
  return fallbackKioskId;
}

/**
 * Parses a date or datetime string as UTC milliseconds.
 * @param {string} dateStr
 * @returns {number} timestamp in ms
 */
export function parseUtcMs(dateStr) {
  if (!dateStr) return Date.now();
  const s = String(dateStr).trim();
  // If date-only YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return Date.parse(`${s}T00:00:00Z`);
  }
  // If datetime without timezone designator
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    return Date.parse(`${s}Z`);
  }
  return Date.parse(s);
}

/**
 * Returns a random integer between min and max (inclusive).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function getRandomIntInRange(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/**
 * Returns a random ISO datetime string (YYYY-MM-DDTHH:mm:ss) within [minDateStr, maxDateStr].
 * @param {string} minDateStr
 * @param {string} maxDateStr
 * @returns {string}
 */
export function getRandomDateIsoInRange(minDateStr, maxDateStr) {
  let minMs = parseUtcMs(minDateStr);
  let maxMs = parseUtcMs(maxDateStr);
  if (isNaN(minMs)) minMs = Date.parse('2026-01-01T00:00:00Z');
  if (isNaN(maxMs)) maxMs = Date.now();
  if (minMs > maxMs) {
    const tmp = minMs;
    minMs = maxMs;
    maxMs = tmp;
  }
  const randomMs = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  return new Date(randomMs).toISOString().slice(0, 19);
}

/**
 * Returns a random UTC date { year, month, day, formatted } within [minDateStr, maxDateStr].
 * @param {string} minDateStr
 * @param {string} maxDateStr
 * @returns {{ year: number, month: number, day: number, formatted: string }}
 */
export function getRandomYmdInRange(minDateStr, maxDateStr) {
  let minMs = parseUtcMs(minDateStr);
  let maxMs = parseUtcMs(maxDateStr);
  if (isNaN(minMs)) minMs = Date.parse('2026-01-01T00:00:00Z');
  if (isNaN(maxMs)) maxMs = Date.now();
  if (minMs > maxMs) {
    const tmp = minMs;
    minMs = maxMs;
    maxMs = tmp;
  }
  const randomMs = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  const d = new Date(randomMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    formatted: d.toISOString().slice(0, 10),
  };
}
