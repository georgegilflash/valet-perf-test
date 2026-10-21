#!/usr/bin/env node
/**
 * Cross-platform (Windows / macOS / Linux) Single-Request SOAP 1.2 Tester
 * for Kiosk GetKnownDriverChanges (/device/kiosk.asmx)
 *
 * Usage:
 *   node ./scripts/test-known-driver-changes.js
 *   node ./scripts/test-known-driver-changes.js --kioskId=... --year=2026 --month=10 --day=25 --total=2 --burnt=2
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
let year = cliArgs.year ? parseInt(cliArgs.year, 10) : 0;
let month = cliArgs.month ? parseInt(cliArgs.month, 10) : 0;
let day = cliArgs.day ? parseInt(cliArgs.day, 10) : 0;
const dateMin = cliArgs.dateMin || '2026-10-25';
const dateMax = cliArgs.dateMax || '2026-10-25';
let total = cliArgs.total ? parseInt(cliArgs.total, 10) : 0;
const totalMin = cliArgs.totalMin !== undefined ? parseInt(cliArgs.totalMin, 10) : 1;
const totalMax = cliArgs.totalMax !== undefined ? parseInt(cliArgs.totalMax, 10) : 2;
const burnt = cliArgs.burnt !== undefined ? parseInt(cliArgs.burnt, 10) : 2;
const randomFromPool = cliArgs.random === 'true';
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

// 2. Resolve Random Date (Year, Month, Day) within range [DateMin, DateMax] if not explicitly passed
if (year <= 0 || month <= 0 || day <= 0) {
    const minMs = Date.parse(`${dateMin}T00:00:00Z`);
    const maxMs = Date.parse(`${dateMax}T00:00:00Z`);
    const lo = Math.min(minMs, maxMs);
    const hi = Math.max(minMs, maxMs);
    const rangeDays = Math.floor((hi - lo) / 86400000);
    const randomDays = Math.floor(Math.random() * (rangeDays + 1));
    const picked = new Date(lo + randomDays * 86400000);
    if (year <= 0) year = picked.getUTCFullYear();
    if (month <= 0) month = picked.getUTCMonth() + 1;
    if (day <= 0) day = picked.getUTCDate();
}

// 3. Resolve Random Total within range [TotalMin, TotalMax] if not explicitly passed
if (total <= 0) {
    const lo = Math.min(totalMin, totalMax);
    const hi = Math.max(totalMin, totalMax);
    total = lo + Math.floor(Math.random() * (hi - lo + 1));
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
const methodName = 'GetKnownDriverChanges';
const fullUrl = `${baseUrl.replace(/\/+$/, '')}/${servicePath.replace(/^\/+/, '')}`;

const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <GetKnownDriverChanges xmlns="http://kleverlogic.com/webservices/">
      <kioskID>${kioskId}</kioskID>
      <client>
        <DatabaseChange>
          <Year xmlns="urn:KleverLogic.FlashParcs.Web">${year}</Year>
          <Month xmlns="urn:KleverLogic.FlashParcs.Web">${month}</Month>
          <Day xmlns="urn:KleverLogic.FlashParcs.Web">${day}</Day>
          <Total xmlns="urn:KleverLogic.FlashParcs.Web">${total}</Total>
          <Burnt xmlns="urn:KleverLogic.FlashParcs.Web">${burnt}</Burnt>
        </DatabaseChange>
      </client>
    </GetKnownDriverChanges>
  </soap12:Body>
</soap12:Envelope>`;

console.log('\x1b[36m================================================================================\x1b[0m');
console.log('\x1b[36m SOAP 1.2 Web Service Test - GetKnownDriverChanges\x1b[0m');
console.log(`\x1b[36m Endpoint:     ${fullUrl}\x1b[0m`);
console.log(`\x1b[36m Method:       ${methodName}\x1b[0m`);
console.log(`\x1b[36m Kiosk ID:     ${kioskId}\x1b[0m`);
console.log(`\x1b[36m Date (Y-M-D): ${year}-${month}-${day} (Range: ${dateMin} -> ${dateMax})\x1b[0m`);
console.log(`\x1b[36m Total:        ${total} (Range: ${totalMin} -> ${totalMax}, Burnt: ${burnt})\x1b[0m`);
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

                let isDateSame = true;
                let isTotalValid = true;
                let returnedTotal = 0;

                const yearMatch = rawXml.match(/<Year[^>]*>(\d+)<\/Year>/);
                const monthMatch = rawXml.match(/<Month[^>]*>(\d+)<\/Month>/);
                const dayMatch = rawXml.match(/<Day[^>]*>(\d+)<\/Day>/);
                const totalMatch = rawXml.match(/<Total[^>]*>(\d+)<\/Total>/);

                if (yearMatch && monthMatch && dayMatch) {
                    if (
                        parseInt(yearMatch[1], 10) !== year ||
                        parseInt(monthMatch[1], 10) !== month ||
                        parseInt(dayMatch[1], 10) !== day
                    ) {
                        isDateSame = false;
                    }
                }
                if (totalMatch) {
                    returnedTotal = parseInt(totalMatch[1], 10);
                    isTotalValid = returnedTotal <= total;
                }

                console.log('\n\x1b[33m[VALIDATION CHECKS]\x1b[0m');
                console.log(
                    `  Response Date matches Sent Date (${year}-${month}-${day}): ${
                        isDateSame ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
                    }`
                );
                console.log(
                    `  Response Total <= Requested Total (${returnedTotal} <= ${total}): ${
                        isTotalValid ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
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
