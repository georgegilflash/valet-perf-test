# AI Agent Endpoint Implementation & Extension Guide

This guide is intended for AI coding agents and developers looking to add, update, or chain SOAP/REST endpoints within the Valet Performance Testing suite (`webv1`).

---

## 1. Architectural Overview

```
webv1/
├── src/
│   ├── catalog/                          <-- Endpoint templates & Catalog Registry
│   │   ├── index.js                      <-- Master catalog registration
│   │   ├── callKioskIssueTicket2.template.js
│   │   └── callKioskGetTicket.template.js
│   ├── k6/
│   │   ├── runner.js                     <-- k6 test executor, multi-step scenario runner
│   │   └── utils/
│   │       └── xml-helper.js             <-- SOAP 1.1/1.2 builder, GUID generator, XML parser
│   └── web/
│       ├── server.js                     <-- Express API (/api/catalog, /api/run, /api/ws)
│       └── public/
│           └── modules/
│               ├── scenarios.view.js     <-- Drag & drop UI, step drawer parameters, step pairing
│               ├── script.view.js        <-- JSON configuration import/export & validation
│               └── state.js              <-- Global frontend application state
```

---

## 2. Step-by-Step: Adding a New Endpoint

When adding a new endpoint, follow these 4 steps:

### Step 2.1: Create the Catalog Template (`src/catalog/<endpointName>.template.js`)

Create a template file returning the specification for the endpoint.

Example for SOAP 1.2 endpoint:
```javascript
export default function getTemplate() {
  return {
    id: 'callKioskIssueTicket2',
    name: 'callKioskIssueTicket2',
    displayName: 'Issue Ticket (IssueTicket2)',
    category: 'Kiosk Service',
    description: 'Issues a new parking ticket into Kiosk.asmx with dynamic ticketID (GUID) and ticketNumber.',
    enabled: true,
    protocol: 'SOAP',
    soapVersion: '1.2',
    service: '/device/kiosk.asmx',
    soapAction: 'http://kleverlogic.com/webservices/IssueTicket2',
    operationName: 'IssueTicket2',
    xmlNamespace: 'http://kleverlogic.com/webservices/',
    timeout: '30s',
    thinkTimeSec: 1.0,
    dataRequirements: {
      primaryIdPool: {
        key: 'kioskIds',
        label: 'Kiosk IDs (Target Kiosks)',
        xmlElement: 'kioskID',
        poolFile: 'kiosk_ids.txt',
        defaultCount: 5
      }
    },
    defaultUsersPerStage: [5, 10, 20, 20, 0],
    thresholds: {
      p95MaxDurationMs: 5000,
      maxFailRate: 0.05
    },
    assertions: [
      { id: 'status_200', label: 'HTTP 200 OK', type: 'http_status', expected: 200, enabled: true },
      { id: 'no_soap_fault', label: 'No SOAP Fault', type: 'no_soap_fault', enabled: true },
      { id: 'body_success', label: 'Response contains Success', type: 'body_contains', expected: 'Success', enabled: true }
    ],
    data: {
      selectionMode: 'random',
      prefix: 'PERF-'
    }
  };
}
```

### Step 2.2: Register the Template in Catalog Index (`src/catalog/index.js`)

1. Import the template.
2. Add it to `ENDPOINT_CATALOG`.

```javascript
import callKioskIssueTicket2Template from './callKioskIssueTicket2.template.js';
import callKioskGetTicketTemplate from './callKioskGetTicket.template.js';

export const ENDPOINT_CATALOG = [
  // ... existing endpoints
  callKioskIssueTicket2Template(),
  callKioskGetTicketTemplate()
];
```

### Step 2.3: Build the SOAP Request Envelope in `src/k6/utils/xml-helper.js`

Add the XML envelope generation branch inside `buildSoapEnvelope(endpointConfig, selectedIdValue, context)`:

```javascript
// Specific handler for IssueTicket2 (SOAP 1.2)
if (opName === 'IssueTicket2' || endpointConfig.id === 'callKioskIssueTicket2') {
  const ticketID = context?.ticketID || endpointConfig.data?.ticketID || generateRandomGuid();
  const ticketNumber = context?.ticketNumber || endpointConfig.data?.ticketNumber || `PERF-${Date.now()}`;
  const nowIso = new Date().toISOString().slice(0, 19);
  const calledAt = endpointConfig.data?.calledAt || nowIso;
  const issuedAt = endpointConfig.data?.issuedAt || nowIso;

  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <IssueTicket2 xmlns="http://kleverlogic.com/webservices/">
      <kioskID>${selectedIdValue || ''}</kioskID>
      <calledAt>${calledAt}</calledAt>
      <ticketID>${ticketID}</ticketID>
      <ticketNumber>${ticketNumber}</ticketNumber>
      <issuedAt>${issuedAt}</issuedAt>
    </IssueTicket2>
  </soap12:Body>
</soap12:Envelope>`;
}
```

> **Important notes for k6 runtime:**
> - k6 executes in an embedded Go JavaScript runtime (goja).
> - Standard Node `crypto.randomUUID()` is **not** available in k6 script context.
> - Always use the portable `generateRandomGuid()` utility from `src/k6/utils/xml-helper.js`.

### Step 2.4: Configure Context & Chained Steps (`src/k6/runner.js`)

In `runScenarioSteps()`, an `iterationContext` object is initialized at the start of every iteration of a Virtual User (VU):

```javascript
const iterationContext = {
  ticketID: generateRandomGuid(),
  ticketNumber: `PERF-${Date.now()}`
};

for (let i = 0; i < sc.steps.length; i++) {
  const step = sc.steps[i];
  if (step && step.enabled !== false) {
    executeStep(step, i + 1, sc, iterationContext);
  }
}
```

This guarantees that:
- Step 1 (`IssueTicket2`) creates the ticket using `iterationContext.ticketID`.
- Step 2 (`GetTicket`) looks up that exact `iterationContext.ticketID`.
- Both steps share the same dynamic identifiers across the iteration.

---

## 3. UI Integration & Configuration Drawer (`scenarios.view.js`)

### Step 3.1: Think Time & Randomizer Range (Min-Max)

Every step in a scenario supports either a fixed think time or a randomized range:
- `step.thinkTimeSec`: Fixed seconds to sleep after step completion (default: `1.0`).
- `step.thinkTimeRange`: `{ enabled: boolean, min: number, max: number }`. When enabled, k6 will sleep a uniform random interval between `min` and `max` seconds after each request for every VU iteration.
- The step drawer includes a **"Random Range"** toggle with dedicated `min` and `max` inputs.

---

### Step 3.2: Automatic Step Pairing
When an action naturally pairs with a verification step (like `IssueTicket2` followed by `GetTicket`), handle this in `addStepToScenario(scenarioId, endpointId, insertIndex)`:

```javascript
if (endpointId === 'callKioskIssueTicket2') {
  const pairStep = createStepInstanceFromTemplate('callKioskGetTicket', false);
  if (pairStep) {
    const pairIdx = insertIndex !== null && insertIndex >= 0 ? insertIndex + 1 : sc.steps.length;
    sc.steps.splice(pairIdx, 0, pairStep);
  }
}
```

The user retains full control to:
- Disable `GetTicket` via the step checkbox.
- Delete `GetTicket` with the ✕ button.
- Re-order steps with ↑/↓ or drag & drop.

### Step 3.2: Custom Parameters Drawer UI
Render custom inputs for your endpoint inside `renderSelectedEndpointsConfig()` in `scenarios.view.js`:

```javascript
${
  step.endpointId === 'callKioskIssueTicket2' || step.id === 'callKioskIssueTicket2'
    ? `
  <div class="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-3 space-y-2.5">
    <div class="flex items-center justify-between">
      <h5 class="text-xs font-bold text-emerald-300">🎟️ IssueTicket2 Settings</h5>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      <div class="bg-slate-950 border border-slate-800 rounded-lg p-2">
        <label class="block text-[10px] text-slate-400 mb-1">Ticket Number Prefix</label>
        <input type="text" value="${escapeHtml(step.data?.prefix || 'PERF-')}"
          oninput="updateStepDataField('${sc.id}', ${stepIdx}, 'prefix', this.value)"
          class="..." />
      </div>
    </div>
  </div>`
    : ''
}
```

### Step 3.3: Step Gap / Think Time
Every step has a configurable **Think Time After Step (s)** field located in the step configuration drawer.
- Governed by `step.thinkTimeSec` (default: 1.0s).
- Controls the delay / pause before the runner proceeds to the next step.
- Completely adjustable per scenario and per step in the UI.

---

## 4. Verification Checklist

1. **Syntax Check**: Run `node --check` on all modified files:
   ```bash
   node --check webv1/src/catalog/<endpoint>.template.js webv1/src/catalog/index.js webv1/src/k6/utils/xml-helper.js webv1/src/k6/runner.js webv1/src/web/public/modules/scenarios.view.js
   ```
2. **Catalog Import Test**:
   ```bash
   node -e "import('./webv1/src/catalog/index.js').then(m => console.log(m.ENDPOINT_CATALOG.map(e => e.id)))"
   ```
3. **Envelope Generation Test**:
   ```bash
   node -e "import('./webv1/src/k6/utils/xml-helper.js').then(x => console.log(x.buildSoapEnvelope({ id: 'callKioskIssueTicket2' }, 'KIOSK-1', { ticketID: 'GUID', ticketNumber: 'PERF-123' })))"
   ```
