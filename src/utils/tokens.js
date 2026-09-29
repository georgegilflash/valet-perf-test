import { SharedArray } from 'k6/data';

/**
 * Loads tokens.json into shared memory using SharedArray.
 * SharedArray ensures that tokens are only loaded ONCE in memory,
 * even with thousands of concurrent virtual users.
 */
export const loadedTokens = new SharedArray('valet_tokens', function () {
  try {
    const raw = open('../../tokens.json');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    // If tokens.json does not exist yet
    return [];
  }
});

/**
 * Validates whether there are sufficient unique tokens for the required concurrent VUs.
 *
 * Rules:
 * - If tokens.json has fewer tokens than requiredVUs: return invalid with detailed error.
 * - If tokens.json has >= requiredVUs: valid, and only the first requiredVUs will be used.
 * - If tokens.json is empty / not created: fallback to single token mode.
 *
 * @param {number} requiredVUs - maximum concurrent users required across all stages
 * @returns {{ valid: boolean, error?: string, availableCount: number, requiredCount: number }}
 */
export function validateTokenPool(requiredVUs) {
  const available = loadedTokens.length;

  if (available > 0) {
    if (available < requiredVUs) {
      return {
        valid: false,
        availableCount: available,
        requiredCount: requiredVUs,
        error: `[TOKEN VALIDATION FAILED] Required ${requiredVUs} concurrent users, but tokens.json only contains ${available} tokens! Aborting test execution to prevent token reuse. Run 'npm run tokens -- ${requiredVUs}' to export sufficient tokens.`,
      };
    }

    return {
      valid: true,
      availableCount: available,
      requiredCount: requiredVUs,
      message: `Token validation passed: Using first ${requiredVUs} tokens out of ${available} available in tokens.json.`,
    };
  }

  return {
    valid: true,
    availableCount: 0,
    requiredCount: requiredVUs,
    singleTokenMode: true,
  };
}

/**
 * Retrieves the unique token assigned to the current Virtual User (VU).
 * VU IDs in k6 are 1-indexed (VU 1 -> index 0, VU 2 -> index 1, etc.).
 *
 * @param {number} vuId - __VU or exec.vu.idInTest (1-indexed)
 * @param {string} fallbackToken - token from config/env if tokens.json is empty
 * @returns {string} token string
 */
export function getVuToken(vuId, fallbackToken) {
  if (loadedTokens.length > 0) {
    const index = vuId - 1;
    if (index >= 0 && index < loadedTokens.length) {
      return loadedTokens[index];
    }
  }
  return fallbackToken;
}
