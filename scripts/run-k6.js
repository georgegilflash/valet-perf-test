#!/usr/bin/env node
/**
 * Cross-platform (Windows / macOS / Linux) k6 Test Runner
 *
 * Ensures all reports/<endpoint>/ directories exist, loads environment variables
 * from .env (checking project root .env first, or C:\Program Files\.env on Windows),
 * injects RUN_TIMESTAMP, and runs k6.
 *
 * Usage:
 *   node ./scripts/run-k6.js main-known-drivers.js
 *   node ./scripts/run-k6.js main-known-drivers.js -e DEBUG_RESPONSE=true
 */

import fs from 'fs';
import path from 'path';
import { spawnSync, execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const scriptName = args[0] && !args[0].startsWith('-') ? args[0] : 'main-device.js';
const extraArgs = args[0] && !args[0].startsWith('-') ? args.slice(1) : args;

console.log('\x1b[36m============================================================\x1b[0m');
console.log('\x1b[36m   k6 Cross-Platform Suite Runner (Windows / macOS / Linux) \x1b[0m');
console.log('\x1b[36m============================================================\x1b[0m');

// 1. Ensure report directories exist
const endpointDirs = [
    'reports',
    'reports/known-drivers',
    'reports/known-driver-changes',
    'reports/kiosk',
    'reports/valet',
    'reports/pms',
    'reports/sign',
    'reports/payments',
    'reports/polling',
    'reports/device',
];

const scriptBase = path.basename(scriptName, '.js');
const match = scriptBase.match(/^main-(.+)$/);
if (match) {
    endpointDirs.push(`reports/${match[1].toLowerCase()}`);
}

for (const relDir of endpointDirs) {
    const fullPath = path.join(rootDir, relDir);
    try {
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
    } catch {
        // Ignore if directory already exists or is managed externally
    }
}

// 2. Generate RUN_TIMESTAMP (YYYY-MM-DD_HH-mm-ss)
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const runTimestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

const envArgs = ['-e', `RUN_TIMESTAMP=${runTimestamp}`];

// 3. Resolve .env file (supports ENV_FILE override, local .env, or Windows C:\Program Files\.env)
const candidateEnvFiles = [];
if (process.env.ENV_FILE) {
    candidateEnvFiles.push(process.env.ENV_FILE);
}
if (process.platform === 'win32') {
    candidateEnvFiles.push('C:\\Program Files\\.env');
}
candidateEnvFiles.push(path.join(rootDir, '.env'));

let loadedEnvPath = null;
let rawEnvContent = null;

for (const candidate of candidateEnvFiles) {
    try {
        if (fs.existsSync(candidate)) {
            try {
                rawEnvContent = fs.readFileSync(candidate, 'utf8');
                loadedEnvPath = candidate;
                break;
            } catch {
                if (process.platform === 'win32') {
                    rawEnvContent = execSync(`cmd.exe /c "type \\"${candidate}\\""`, { encoding: 'utf8' });
                    loadedEnvPath = candidate;
                    break;
                }
            }
        }
    } catch {
        // Continue to next candidate
    }
}

if (loadedEnvPath && rawEnvContent !== null) {
    console.log(`\x1b[32mLoading environment from ${loadedEnvPath}...\x1b[0m`);
    const lines = rawEnvContent.split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) {
            const key = line.slice(0, eqIdx).trim();
            const val = line
                .slice(eqIdx + 1)
                .trim()
                .replace(/^['"]|['"]$/g, '');
            if (key) {
                envArgs.push('-e', `${key}=${val}`);
            }
        }
    }
} else {
    console.log('\x1b[33mNotice: No .env file found (.env or C:\\Program Files\\.env). Using defaults from config/env.js.\x1b[0m');
}

// 4. Build final k6 command arguments
const fullArgs = ['run', ...envArgs, ...extraArgs, scriptName];

console.log(`\x1b[36mExecuting: k6 ${fullArgs.join(' ')}\x1b[0m`);

const result = spawnSync('k6', fullArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
});

if (result.error) {
    console.error('\x1b[31mk6 is not found in PATH. Please install k6 first:\x1b[0m');
    console.error('\x1b[33m  macOS:   brew install k6\x1b[0m');
    console.error('\x1b[33m  Windows: winget install k6 --source winget\x1b[0m');
    process.exit(1);
}

process.exit(result.status ?? 0);
