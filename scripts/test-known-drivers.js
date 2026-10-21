#!/usr/bin/env node
/**
 * Cross-platform (Windows / macOS / Linux) Single-Request SOAP 1.2 Tester
 * for Kiosk GetKnownDrivers (/device/kiosk.asmx)
 *
 * Usage:
 *   node ./scripts/test-known-drivers.js
 *   node ./scripts/test-known-drivers.js --kioskId=... --fromDate=2026-08-27T00:00:00 --start=1 --count=2
 */

import fs from 'fs';
import https from 'https';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const kioskJsonPath = path.join(rootDir, 'kiosk-ids.json');

// Parse CLI flags (--key=value)
const cliArgs = Object.fromEntries(
    process.argv
        .slice(2)
        .filter((a) => a.startsWith('--'))
        .map((a) => {
            const [k, ...v] = a.slice(2).split('=');
            return [k, v.join('=') || 'true'];
        })
);

const baseUrl = cliArgs.baseUrl || process.env.BASE_URL || 'https://intserver.qa3.flashparking.dev';
let kioskId = cliArgs.kioskId || process.env.KIOSK_ID || '';
let fromDate = cliArgs.fromDate || '2026-08-27T00:00:00';
const start = cliArgs.start !== undefined ? parseInt(cliArgs.start, 10) : 1;
let count = cliArgs.count !== undefined ? parseInt(cliArgs.count, 10) : 2;
const randomFromPool = cliArgs.random === 'true';
const fromDateMin = cliArgs.fromDateMin || '2026-10-24T00:00:00';
const fromDateMax = cliArgs.fromDateMax || '2026-10-25T00:00:00';
const countMin = cliArgs.countMin !== undefined ? parseInt(cliArgs.countMin, 10) : 1;
const countMax = cliArgs.countMax !== undefined ? parseInt(cliArgs.countMax, 10) : 2;
const timeoutSec = cliArgs.timeoutSec !== undefined ? parseInt(cliArgs.timeoutSec, 10) : 30;

// 1. Resolve Kiosk ID from kiosk-ids.json pool if empty or --random
if (randomFromPool || !kioskId) {
    try {
        if (fs.existsSync(kioskJsonPath)) {
            const pool = JSON.parse(fs.readFileSync(kioskJsonPath, 'utf8'));
            if (Array.isArray(pool) && pool.length > 0) {
                kioskId = pool[Math.floor(Math.random() * pool.length)];
            }
        }
    } catch {
        // Fallback below
    }
    if (!kioskId) {
        kioskId = '4b51d86b-e14b-4da5-b7c0-c1a20ca3f660';
    }
}

// 2. Resolve Random FromDate if requested or empty
if (randomFromPool || !fromDate) {
    const minMs = Date.parse(fromDateMin);
    const maxMs = Date.parse(fromDateMax);
    const lo = Math.min(minMs, maxMs);
    const hi = Math.max(minMs, maxMs);
    const picked = new Date(lo + Math.floor(Math.random() * (hi - lo + 1000)));
    fromDate = picked.toISOString().slice(0, 19);
}

// 3. Resolve Random Count if requested or <= 0
if (randomFromPool || count <= 0) {
    const lo = Math.min(countMin, countMax);
    const hi = Math.max(countMin, countMax);
    count = lo + Math.floor(Math.random() * (hi - lo + 1));
}

function formatXmlPretty(xml) {
    if (!xml || !xml.trim()) return '(empty)';
    let formatted = '';
    const reg = /(>)(<)(\/*)/g;
    const xmlStr = xml.replace(reg, '$1\n$2$3');
    let pad = 0;
    for (const node of xmlStr.split('\n')) {
        let indent = 0;
        if (node.match(/.+<\/\w[^>]*>$/)) {
            indent = 0;
        } else if (node.match(/^<\/\w/)) {
            if (pad !== 0) pad -= 1;
        } else if (node.match(/^<\w[^>]*[^/]>.*$/)) {
            indent = 1;
        } else {
            indent = 0;
        }
        formatted += '  '.repeat(pad) + node + '\n';
        pad += indent;
    }
    return formatted.trim();
}

const servicePath = '/device/kiosk.asmx';
const methodName = 'GetKnownDrivers';
const fullUrl = `${baseUrl.replace(/\/+$/, '')}/${servicePath.replace(/^\/+/, '')}`;

const soapEnvelope = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:web="http://kleverlogic.com/webservices/">
   <soap:Header/>
   <soap:Body>
      <web:GetKnownDrivers>
         <web:kioskID>${kioskId}</web:kioskID>
         <web:from>${fromDate}</web:from>
         <web:start>${start}</web:start>
         <web:count>${count}</web:count>
      </web:GetKnownDrivers>
   </soap:Body>
</soap:Envelope>`;

console.log('\x1b[36m================================================================================\x1b[0m');
console.log('\x1b[36m SOAP 1.2 Web Service Test - GetKnownDrivers\x1b[0m');
console.log(`\x1b[36m Endpoint:     ${fullUrl}\x1b[0m`);
console.log(`\x1b[36m Method:       ${methodName}\x1b[0m`);
console.log(`\x1b[36m Kiosk ID:     ${kioskId}\x1b[0m`);
console.log(`\x1b[36m FromDate:     ${fromDate}\x1b[0m`);
console.log(`\x1b[36m Start:        ${start}\x1b[0m`);
console.log(`\x1b[36m Count:        ${count}\x1b[0m`);
console.log('\x1b[36m Content-Type: application/soap+xml; charset=utf-8\x1b[0m');
console.log('\x1b[36m================================================================================\x1b[0m');

console.log('\n\x1b[33m[REQUEST ENVELOPE]\x1b[0m');
console.log(soapEnvelope);
console.log('\n\x1b[33mSending request...\x1b[0m');

const parsedUrl = new URL(fullUrl);
const client = parsedUrl.protocol === 'https:' ? https : http;
const startTime = Date.now();

const req = client.request(
    parsedUrl,
    {
        method: 'POST',
        headers: {
            'Content-Type': 'application/soap+xml; charset=utf-8',
            'Content-Length': Buffer.byteLength(soapEnvelope, 'utf8'),
        },
        rejectUnauthorized: false,
        timeout: timeoutSec * 1000,
    },
    (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
            const elapsedMs = Date.now() - startTime;
            const rawXml = Buffer.concat(chunks).toString('utf8');

            if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log('\n\x1b[32m================================================================================\x1b[0m');
                console.log(`\x1b[32m [SUCCESS] HTTP ${res.statusCode} ${res.statusMessage || 'OK'} (in ${elapsedMs} ms)\x1b[0m`);
                console.log('\x1b[32m================================================================================\x1b[0m');

                const driverMatches = [...rawXml.matchAll(/<KnownDriver>([\s\S]*?)<\/KnownDriver>/g)];
                const dateMatches = [...rawXml.matchAll(/<DateModifiedUtc>([^<]+)<\/DateModifiedUtc>/g)];
                const returnedCount = driverMatches.length;
                const isCountValid = returnedCount <= count;

                const sentFromMs = Date.parse(fromDate);
                let allDatesGreater = true;
                for (const m of dateMatches) {
                    const dVal = Date.parse(m[1].trim());
                    if (!Number.isNaN(dVal) && !Number.isNaN(sentFromMs) && dVal <= sentFromMs) {
                        allDatesGreater = false;
                    }
                }

                console.log('\n\x1b[33m[VALIDATION CHECKS]\x1b[0m');
                console.log(
                    `  Records Returned <= Requested Count (${returnedCount} <= ${count}): ${
                        isCountValid ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
                    }`
                );
                console.log(
                    `  All DateModifiedUtc > FromDate (${fromDate}): ${
                        allDatesGreater ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
                    }`
                );

                console.log('\n\x1b[36m[RESPONSE BODY (FORMATTED XML)]\x1b[0m');
                console.log(formatXmlPretty(rawXml));
            } else {
                console.log('\n\x1b[31m================================================================================\x1b[0m');
                console.log(`\x1b[31m [FAILED] HTTP ${res.statusCode} on ${fullUrl}\x1b[0m`);
                console.log('\x1b[31m================================================================================\x1b[0m');
                console.log('\n\x1b[33mError Response Body (Formatted XML):\x1b[0m');
                console.log(formatXmlPretty(rawXml));
                process.exitCode = 1;
            }
        });
    }
);

req.on('error', (err) => {
    console.log('\n\x1b[31m================================================================================\x1b[0m');
    console.log(`\x1b[31m [FAILED] Request failed on ${fullUrl}\x1b[0m`);
    console.log('\x1b[31m================================================================================\x1b[0m');
    console.error(`\x1b[31mError Details: ${err.message}\x1b[0m`);
    process.exitCode = 1;
});

req.write(soapEnvelope);
req.end();
