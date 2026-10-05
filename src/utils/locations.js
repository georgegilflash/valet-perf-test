import { SharedArray } from 'k6/data';

/**
 * Loads location-IDs.json into shared memory using SharedArray.
 * SharedArray ensures that locations are only parsed and loaded ONCE in memory,
 * even when running hundreds or thousands of concurrent virtual users.
 */
export const loadedLocationIds = new SharedArray('location_ids', function () {
  try {
    const raw = open('../../location-IDs.json');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return [];
  } catch (err) {
    return [];
  }
});

/**
 * Returns a completely RANDOM location ID from the loaded pool.
 * If location-IDs.json is empty or not found, falls back to the provided default GUID.
 *
 * @param {string} fallbackId - default GUID from config
 * @returns {string} random location GUID
 */
export function getRandomLocationId(fallbackId) {
  if (loadedLocationIds.length > 0) {
    const randomIndex = Math.floor(Math.random() * loadedLocationIds.length);
    return loadedLocationIds[randomIndex];
  }
  return fallbackId;
}
