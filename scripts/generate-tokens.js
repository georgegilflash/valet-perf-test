import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Default source and destination files
const SOURCE_TXT = path.join(rootDir, 'login-token-QA1.txt');
const DEST_JSON = path.join(rootDir, 'tokens.json');

function generateTokens() {
  // Parse command line argument for requested count: e.g. "node generate-tokens.js 100"
  const args = process.argv.slice(2);
  let requestedCount = null;

  for (const arg of args) {
    const num = parseInt(arg, 10);
    if (!isNaN(num) && num > 0) {
      requestedCount = num;
      break;
    }
  }

  // Check if source file exists
  if (!fs.existsSync(SOURCE_TXT)) {
    console.error(`\x1b[31mError: Source token file not found at: ${SOURCE_TXT}\x1b[0m`);
    process.exit(1);
  }

  console.log(`\x1b[36m=== Valet Token Generator ===\x1b[0m`);
  console.log(`Reading source file: ${path.basename(SOURCE_TXT)}`);

  const rawContent = fs.readFileSync(SOURCE_TXT, 'utf-8');
  const lines = rawContent.split(/\r?\n/);

  // Filter out empty lines, trim whitespace, and eliminate duplicates using Set
  const uniqueTokensSet = new Set();
  for (const line of lines) {
    const token = line.trim();
    if (token) {
      uniqueTokensSet.add(token);
    }
  }

  const allUniqueTokens = Array.from(uniqueTokensSet);
  console.log(`Total lines read:        ${lines.length}`);
  console.log(`Total unique tokens:     ${allUniqueTokens.length}`);

  let tokensToSave = allUniqueTokens;

  if (requestedCount !== null) {
    if (requestedCount > allUniqueTokens.length) {
      console.warn(`\x1b[33mWarning: Requested ${requestedCount} tokens, but only ${allUniqueTokens.length} unique tokens are available.\x1b[0m`);
      tokensToSave = allUniqueTokens;
    } else {
      tokensToSave = allUniqueTokens.slice(0, requestedCount);
      console.log(`Filtered to requested:   ${tokensToSave.length} tokens`);
    }
  } else {
    console.log(`No count specified. Exporting all ${tokensToSave.length} tokens.`);
  }

  // Write JSON file (formatted with 2 spaces for readability)
  fs.writeFileSync(DEST_JSON, JSON.stringify(tokensToSave, null, 2), 'utf-8');

  console.log(`\x1b[32mSuccessfully generated:  ${path.basename(DEST_JSON)} (${tokensToSave.length} unique tokens)\x1b[0m`);
  console.log(`Destination path:        ${DEST_JSON}\n`);
}

generateTokens();
