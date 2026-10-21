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
 * Validates whether the Kiosk ID pool in kiosk-ids.json is available for the required concurrent VUs.
 *
 * Rules (aligned with web runner):
 * - Uses all Kiosk IDs available in kiosk-ids.json.
 * - If kiosk-ids.json is missing or empty, returns invalid with detailed error.
 * - If kiosk-ids.json has fewer IDs than requiredVUs, it remains valid and reuses/cycles
 *   the available Kiosk IDs across VUs via modulo ((VU - 1) % available).
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
      valid: true,
      availableCount: available,
      requiredCount: requiredVUs,
      message: `Kiosk ID pool ready: Using all ${available} Kiosk IDs from kiosk-ids.json and reusing/cycling across ${requiredVUs} VUs ((VU - 1) % ${available}).`,
    };
  }

  return {
    valid: true,
    availableCount: available,
    requiredCount: requiredVUs,
    message: `Kiosk ID pool ready: ${available} Kiosk IDs loaded from kiosk-ids.json (distributing across ${requiredVUs} max VUs).`,
  };
}

/**
 * Retrieves the Kiosk ID assigned to the current Virtual User (VU).
 * VU IDs in k6 are 1-indexed (VU 1 -> index 0, VU 2 -> index 1, etc.).
 * If the number of VUs exceeds the pool size, wraps around using modulo to reuse Kiosk IDs.
 *
 * @param {number} vuId - __VU (1-indexed)
 * @param {string} fallbackKioskId - fallback Kiosk ID from config/env
 * @returns {string} Kiosk GUID string
 */
export function getVuKioskId(vuId, fallbackKioskId) {
  if (loadedKioskIds.length > 0) {
    const index = Math.max(0, (vuId || 1) - 1) % loadedKioskIds.length;
    return loadedKioskIds[index];
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
