import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Default source CSV and destination JSON files
const DEFAULT_CSV = path.join(rootDir, 'KDN Kiosks - Sheet1.csv');
const DEST_JSON = path.join(rootDir, 'kiosk-ids.json');

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveSourceCsv(customPath) {
  if (customPath) {
    const resolved = path.isAbsolute(customPath) ? customPath : path.join(rootDir, customPath);
    if (fs.existsSync(resolved)) return resolved;
  }
  if (fs.existsSync(DEFAULT_CSV)) {
    return DEFAULT_CSV;
  }
  // Fallback: look for any .csv file in rootDir
  const files = fs.readdirSync(rootDir).filter((f) => f.toLowerCase().endsWith('.csv'));
  if (files.length > 0) {
    return path.join(rootDir, files[0]);
  }
  return DEFAULT_CSV;
}

function generateKioskIds() {
  // Parse command line arguments: e.g. "node generate-kiosk-ids.js 100" or "node generate-kiosk-ids.js 100 custom.csv"
  const args = process.argv.slice(2);
  let requestedCount = null;
  let customCsvArg = null;

  for (const arg of args) {
    const num = parseInt(arg, 10);
    if (!isNaN(num) && num > 0 && String(num) === arg.trim()) {
      requestedCount = num;
    } else if (arg.trim().toLowerCase().endsWith('.csv')) {
      customCsvArg = arg.trim();
    }
  }

  const sourceCsv = resolveSourceCsv(customCsvArg);

  if (!fs.existsSync(sourceCsv)) {
    console.error(`\x1b[31mError: Source CSV file not found at: ${sourceCsv}\x1b[0m`);
    process.exit(1);
  }

  console.log(`\x1b[36m=== Kiosk IDs Pool Generator ===\x1b[0m`);
  console.log(`Reading source CSV:      ${path.basename(sourceCsv)}`);

  const rawContent = fs.readFileSync(sourceCsv, 'utf-8');
  const lines = rawContent.split(/\r?\n/);

  const uniqueKioskIdsSet = new Set();
  let dataRowsRead = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Extract first CSV column (Kiosk_ID)
    const firstCol = line.split(',')[0].replace(/^["']|["']$/g, '').trim();

    // Skip header row (e.g. "Kiosk_ID") or invalid empty values
    if (i === 0 && (firstCol.toLowerCase() === 'kiosk_id' || !GUID_REGEX.test(firstCol))) {
      continue;
    }

    dataRowsRead++;
    if (firstCol && GUID_REGEX.test(firstCol)) {
      uniqueKioskIdsSet.add(firstCol);
    }
  }

  const allUniqueKioskIds = Array.from(uniqueKioskIdsSet);
  console.log(`Total CSV rows read:     ${dataRowsRead}`);
  console.log(`Total unique Kiosk IDs:  ${allUniqueKioskIds.length}`);

  let idsToSave = allUniqueKioskIds;

  if (requestedCount !== null) {
    if (requestedCount > allUniqueKioskIds.length) {
      console.warn(
        `\x1b[33mWarning: Requested ${requestedCount} Kiosk IDs, but only ${allUniqueKioskIds.length} unique IDs are available.\x1b[0m`
      );
      idsToSave = allUniqueKioskIds;
    } else {
      idsToSave = allUniqueKioskIds.slice(0, requestedCount);
      console.log(`Filtered to requested:   ${idsToSave.length} Kiosk IDs`);
    }
  } else {
    console.log(`No count specified. Exporting all ${idsToSave.length} Kiosk IDs.`);
  }

  // Write JSON file (formatted with 2 spaces for readability)
  fs.writeFileSync(DEST_JSON, JSON.stringify(idsToSave, null, 2), 'utf-8');

  console.log(
    `\x1b[32mSuccessfully generated:  ${path.basename(DEST_JSON)} (${idsToSave.length} unique Kiosk IDs)\x1b[0m`
  );
  console.log(`Destination path:        ${DEST_JSON}\n`);
}

generateKioskIds();
