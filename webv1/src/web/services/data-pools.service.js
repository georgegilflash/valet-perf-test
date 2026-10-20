import fs from 'fs';
import path from 'path';

/**
 * Loads JSON data pool files from data/ directory.
 * @param {string} dataDir - Absolute path to the data directory.
 * @returns {{ locationIds: string[], kioskIds: string[], userGuids: string[] }}
 */
export function loadDataPools(dataDir) {
  const readPool = (filename) => {
    const filePath = path.join(dataDir, filename);
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (err) {
      console.error(`Error reading pool ${filename}:`, err.message);
    }
    return [];
  };

  return {
    locationIds: readPool('location-ids.json'),
    locationIdsQa3: readPool('location-ids-qa3.json'),
    kioskIds: readPool('kiosk-ids.json'),
    userGuids: readPool('user-guids.json')
  };
}
