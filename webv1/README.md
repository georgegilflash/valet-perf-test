# ⚡ Lucerna

An interactive Web Testing Studio, Drag-and-Drop Multi-Step Scenario Builder, JSON Pre-Flight Validator (`test-performance-script`), Real-Time Telemetry Dashboard, and Automated HTML Report Generator (Global & Per-Endpoint with **p50, p90, p95, and p99**) powered by **Grafana k6** and **Docker**.

---

## 📋 Table of Contents
- [Architecture & Directory Structure](#-architecture--directory-structure)
- [Quick Start](#-quick-start)
  - [Option 1: Docker (Recommended)](#option-1-docker-recommended)
  - [Option 2: Local Development](#option-2-local-development)
  - [Hot-Reloading in Docker](#hot-reloading-in-docker)
- [5-Step Workflow Walkthrough](#-5-step-workflow-walkthrough)
  - [Step 1: Global Config & Stages](#step-1-global-config--stages)
  - [Step 2: Scenarios & Steps Builder (Drag & Drop)](#step-2-scenarios--steps-builder-drag--drop)
  - [Step 3: test-performance-script (Pre-Flight Check & JSON)](#step-3-test-performance-script-pre-flight-check--json)
  - [Step 4: Live Execution Dashboard](#step-4-live-execution-dashboard)
  - [Step 5: Reports History](#step-5-reports-history)
- [Multi-Step Scenarios & Concurrency Model](#-multi-step-scenarios--concurrency-model)
- [Data Pools & Confirmed IDs](#-data-pools--confirmed-ids)
- [Metrics & SLA Reporting (p50, p90, p95, p99)](#-metrics--sla-reporting-p50-p90-p95-p99)
- [Adding New Endpoint Templates](#-adding-new-endpoint-templates)

---

## 🏗️ Architecture & Directory Structure

The web application is located in `webv1/`, isolated with its own `package.json`, `Dockerfile`, and `docker-compose.yml`:

```text
webv1/
├── Dockerfile                              # Multi-stage build with Node.js 20 + Grafana k6 binary
├── docker-compose.yml                      # Production/development container with live volume mounts
├── package.json                            # Scripts & backend dependencies (Express)
├── data/                                   # Default ID & User GUID data pools
│   ├── location-ids.json                   # Location GUIDs for PMS / Valet services
│   ├── kiosk-ids.json                      # Kiosk GUIDs for Kiosk services
│   └── user-guids.json                     # User GUIDs for authentication & session tracking
├── reports/                                # Timestamped execution artifacts (persisted via Docker volume)
│   └── run-YYYY-MM-DD_HH-mm-ss/
│       ├── report-general.html             # Consolidated HTML executive report across all scenarios
│       ├── report-<endpointId>.html        # Dedicated HTML report per endpoint
│       ├── test-performance-script.json    # Exact audit snapshot (VUs, stages, IDs, assertions)
│       ├── raw-summary.json                # Complete k6 metrics (p50, p90, p95, p99, min, avg, max)
│       └── execution.log                   # Full k6 stdout/stderr log
└── src/
    ├── catalog/                            # Endpoint definitions & parameter defaults
    │   ├── index.js                        # Catalog aggregator
    │   ├── callPmsNewMessages.template.js  # PMS NewMessages SOAP template
    │   └── callKioskPing.template.js       # Kiosk Ping SOAP template
    ├── validator/                          # Strict schema validation for test-performance-script.json
    │   └── script-validator.js
    ├── k6/                                 # k6 test runner, multi-scenario JS generator & HTML builder
    │   ├── runner.js                       # Spawns k6 process, translates JSON spec to k6 ES6 script
    │   ├── report-generator.js             # Generates standalone Tailwind-styled HTML reports
    │   └── utils/xml-helper.js             # XML builders and response extraction utilities
    └── web/                                # Express server + SSE live stream + SPA frontend
        ├── server.js                       # Express API endpoints & Server-Sent Events (SSE) broadcaster
        └── public/
            ├── index.html                  # 5-step view UI layout
            ├── app.js                      # UI state manager, drag-and-drop, SSE handler, Chart.js
            └── style.css                   # Custom scrollbars and animations
```

---

## 🚀 Quick Start

### Option 1: Docker (Recommended)
No local k6 or Node installation required.

```bash
cd webv1
docker compose up -d --build
```

Then open your browser at:
👉 **[http://localhost:3000](http://localhost:3000)**

To view container logs:
```bash
docker compose logs -f
```

To stop:
```bash
docker compose down
```

### Option 2: Local Development
Requires **Node.js 18+** and **[k6](https://grafana.com/docs/k6/latest/set-up/install-k6/)** installed locally on your PATH:

```bash
cd webv1
npm install
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**. `npm run dev` uses `node --watch` for automatic backend restarts.

### Hot-Reloading in Docker
`docker-compose.yml` mounts `./src:/app/src` and `./data:/app/data` directly into the container. Any edits made to HTML, CSS, JavaScript, or data pools are reflected immediately in the browser upon refreshing (**F5** / **Ctrl+F5**), without needing to rebuild or restart the container.

---

## 🔄 5-Step Workflow Walkthrough

The interface is structured into 5 independent views to streamline test creation, pre-flight review, execution, and analysis:

### Step 1: Global Config & Stages
- **Global Parameters**:
  - **Test Name**: Descriptive name for the test run.
  - **Environment Selector**: Choose between `QA1`, `QA2`, or `QA3`. Automatically updates the Base URL (`https://intserver.qaX.flashparking.dev`) and persists the selected environment in browser `localStorage`.
  - **Base URL**: Editable target service URL.
- **Global Stages Configuration**:
  - Configure the duration of each test stage (e.g., `Stage 1 (Warm-up): 30s`, `Stage 2 (Ramp-up): 1m`, `Stage 3 (Peak Load): 2m`, etc.).
  - Add or delete stages dynamically.
  - Stage durations are automatically saved in `localStorage` so they persist across browser refreshes.
  - Displays real-time **Total Duration** badge.
- Click **"Continue to Scenarios & Steps →"** to advance.

### Step 2: Scenarios & Steps Builder (Drag & Drop)
- **Endpoint Catalog** (Left Palette):
  - Lists available SOAP service templates (`callPMSNewMessages`, `callKioskPing`, etc.).
  - Drag any endpoint card directly into the dropzone of the active scenario on the right.
  - Alternatively, choose the target scenario in the dropdown and click **"+ Add Step"** (responsive and styled).
- **Scenario Selector Tabs** (Right Panel):
  - Shows scenario tabs with badges displaying peak VUs and step counts.
  - Clicking a scenario tab switches the view to show **only** that scenario's configuration.
  - **"+ Add Scenario"**: Creates a new independent scenario running concurrently.
- **Scenario Configuration**:
  - Rename scenarios or toggle them on/off.
  - Define target **Virtual Users (VUs)** per stage specifically for this scenario.
  - Reorder steps within a scenario using drag-and-drop or **↑ / ↓** buttons.
  - **Configure IDs & SLA Drawer**:
    - Step timeout and post-step think time (seconds).
    - p95 SLA threshold (ms).
    - Confirmed ID list selection mode: **Random per Request** or **Dedicated per VU (`__VU`)**.
    - Confirmed IDs textarea (edit, add, or restore default / all pool IDs).
    - Toggle individual assertions per step.
- Click **"Continue to test-performance-script →"** to advance.

### Step 3: test-performance-script (Pre-Flight Check & JSON)
- Review the generated master JSON specification before execution.
- **JSON Pre-Flight Validator**:
  - Live syntax check and schema validation (ensures valid durations, non-empty stages, positive VUs, valid endpoints, and proper IDs).
  - Validation banner indicates whether the script is ready to run or highlights missing parameters.
- **Actions**:
  - **📂 Import JSON**: Load a previously saved test configuration.
  - **💾 Export JSON**: Download the current JSON for source control or CI/CD pipelines.
  - **↻ Regenerate from Form**: Re-sync JSON from UI form settings.
  - **Run Performance Test 🚀**: Disabled until JSON passes validation.

### Step 4: Live Execution Dashboard
- Streams live telemetry via Server-Sent Events (SSE) while k6 runs inside the container or host.
- **Real-Time KPIs**:
  - Active VUs, Total Requests, Total Errors, Error Rate %, Average Latency, and Current Elapsed Time / Progress %.
- **Real-Time Charts (Chart.js)**:
  - **Current Active Requests ("Requests Now")**: Gauges in-flight activity and server load.
  - **Throughput (Requests/sec & Errors/sec)**.
  - **Response Latency (p50, p95, p99, Avg)**.
- **Live Endpoint Metrics Table**:
  - Real-time breakdown per endpoint: Requests, Errors, Max VUs, p50, p90, p95, p99, and Avg latency.
- **Live Console Output**:
  - Terminal logs streamed in real time with auto-scroll and manual **"Stop Test"** control.

### Step 5: Reports History
- Displays historical test executions stored in the `reports/` directory.
- For each execution:
  - Timestamp, test name, total requests, error rate, p95 latency, and duration.
  - **View HTML Report**: Opens a comprehensive, self-contained HTML report with interactive latency distribution, timing breakdowns (DNS, connect, TLS, waiting, receiving), and per-endpoint details.
  - **JSON**: Direct link to the audit `test-performance-script.json`.
  - **Logs**: View raw k6 execution log.

---

## 👥 Multi-Step Scenarios & Concurrency Model

### Parallel Scenarios vs. Sequential Steps
- **Scenarios run in PARALLEL**:
  - Each scenario defines its own independent VU allocation per stage.
  - Scenario 1 and Scenario 2 execute simultaneously, competing for server resources.
- **Steps run SEQUENTIALLY within a Scenario**:
  - Each Virtual User assigned to a scenario executes steps in linear order:
    $$\text{Step 1} \longrightarrow \text{Step 2} \longrightarrow \text{Step 3} \dots$$
  - Once all steps in the scenario complete, the VU waits for the configured `thinkTimeSec` before starting the next iteration.

### Example Configuration:
```json
{
  "scenarios": [
    {
      "id": "scenario_1",
      "name": "Valet Check-in & Message Polling",
      "enabled": true,
      "usersPerStage": [5, 10, 20, 10, 0],
      "steps": [
        { "endpointId": "callKioskPing", "timeout": "30s", "thinkTimeSec": 1 },
        { "endpointId": "callPMSNewMessages", "timeout": "60s", "thinkTimeSec": 2 }
      ]
    }
  ]
}
```

---

## 🗂️ Data Pools & Confirmed IDs

The suite provides pre-configured data pools in `webv1/data/`:
- `location-ids.json`: Company and location identifiers used by PMS and Valet web services.
- `kiosk-ids.json`: Kiosk device identifiers for Kiosk endpoints.
- `user-guids.json`: User GUIDs for authenticated user simulation.

### Selection Modes:
1. **Random per Request**: Each execution of the step randomly selects an ID from the confirmed list.
2. **Dedicated per VU (`__VU`)**: Deterministically assigns IDs to Virtual Users using modulo indexing:
   $$\text{ID} = \text{confirmedIds}[(\text{VU\_ID} - 1) \pmod{\text{length}}]$$
   Ensures predictable, collision-free allocation across concurrent users.

---

## 📊 Metrics & SLA Reporting (p50, p90, p95, p99)

The studio calculates and displays complete percentile metrics:

| Metric | Description |
|---|---|
| **p50 (Median)** | 50% of requests completed faster than this time |
| **p90** | 90% percentile response time |
| **p95** | 95% percentile response time (standard SLA baseline) |
| **p99** | 99% percentile latency (tail latency indicator) |
| **Avg / Min / Max** | Arithmetic mean, absolute fastest, and slowest requests |
| **Error Rate** | Percentage of requests failing HTTP status checks or containing SOAP Faults |

---

## 👩‍💻 Adding New Endpoint Templates

To add a new SOAP or REST endpoint to the catalog:

1. **Create Template**: Add `webv1/src/catalog/<endpointName>.template.js`:
   ```javascript
   export default {
     id: 'callMyEndpoint',
     name: 'callMyEndpoint',
     displayName: 'My New Endpoint',
     service: '/device/my-service.asmx',
     soapAction: 'http://tempuri.org/MyAction',
     soapVersion: '1.2',
     defaultTimeout: '60s',
     defaultThinkTimeSec: 1.0,
     dataRequirements: {
       primaryIdPool: {
         key: 'locationIds',
         poolFile: 'location-ids.json',
         xmlElement: 'locationId',
         label: 'Location IDs',
         defaultCount: 10,
         defaultSelectionMode: 'random'
       }
     },
     assertions: [
       { id: 'status_200', label: 'HTTP 200', type: 'status_200', enabled: true },
       { id: 'no_soap_fault', label: 'No SOAP Fault', type: 'no_soap_fault', enabled: true }
     ]
   };
   ```
2. **Register Template**: Import and add it to `catalog` in `webv1/src/catalog/index.js`.
3. **Add Envelope Builder**: In `webv1/src/k6/runner.js`, define the SOAP body generation inside `buildSoapEnvelope()`.
4. Refresh the studio browser tab — the new endpoint will immediately appear in the **Endpoint Catalog** palette.
