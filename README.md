# API Performance Testing Suite with Grafana k6

A modular, production-ready performance testing project built with **Grafana k6**. Supports both **REST (JSON)** and **SOAP (XML)** web services using a structured **5-stage ramp-up load profile**.

---

## 📋 Features

- **5-Stage Ramp-Up Profile**: Warm-up $\rightarrow$ Moderate Load $\rightarrow$ Peak Load $\rightarrow$ Sustained Plateau $\rightarrow$ Cooldown.
- **REST & SOAP Support**: Built-in support for REST APIs (JSON) and SOAP 1.1 / 1.2 Web Services (XML, SOAPAction, WS-Security).
- **Environment-Driven Configuration**: Fully configurable via `.env` file or CLI `-e` flags (Base URL, tokens, credentials, stage targets, thresholds).
- **Multiple Auth Schemes Supported**: Bearer (JWT) tokens, API Keys (`x-api-key`), HTTP Basic Authentication, and SOAP WS-Security (UsernameToken).
- **Modular Architecture**: Clean separation between configuration, API client, test scenarios, metrics, and reporters.
- **Custom Metrics & SLA Thresholds**: Automatic tracking of p95/p99 latency limits, error rates, and SOAP Fault checks.
- **Multi-Platform Runners**: Ready-to-use PowerShell (`run.ps1`) and Bash (`run.sh`) runners that automatically load `.env`.

---

## 🏗 Project Architecture

```
valet/
├── config/
│   └── env.js              # Centralized environment variable parsing and defaults
├── src/
│   ├── client/
│   │   └── api-client.js   # Reusable HTTP & SOAP client with auth headers and standard methods
│   ├── scenarios/
│   │   ├── ramp-up.js      # 5-stage ramp-up options and performance thresholds
│   │   ├── test-flow.js    # VU execution dispatcher (REST, SOAP, or BOTH)
│   │   └── soap-flow.js    # Dedicated SOAP test flow with XML envelope generation
│   └── utils/
│       ├── metrics.js      # Custom k6 metrics (Trend, Rate, Counter)
│       ├── summary.js      # Report generation (terminal summary & reports/summary.json)
│       ├── tokens.js       # SharedArray token manager and VU-to-token validation
│       └── xml.js          # XML/SOAP envelope builders & response tag extractors
├── scripts/
│   ├── generate-tokens.js  # Node.js script to create deduplicated tokens.json from TXT
│   ├── generate-tokens.ps1 # PowerShell script to create deduplicated tokens.json from TXT
│   ├── run.ps1             # PowerShell runner with automatic .env loading (Windows)
│   └── run.sh              # Bash runner with automatic .env loading (Linux/macOS)
├── login-token-QA1.txt     # Raw source token pool (2,591 tokens)
├── tokens.json             # Deduplicated JSON array loaded by k6
├── .env.example            # Template for all environment variables
├── .env                    # Local environment configuration file
├── .gitignore              # Ignores sensitive .env files and test reports
├── package.json            # Convenient npm scripts
├── main.js                 # Primary test entry point
└── README.md               # Documentation
```

---

## 📈 5-Stage Ramp-Up Profile

The test simulates realistic traffic behavior across 5 distinct phases:

| Stage | Name | Default Target | Default Duration | Objective |
|---|---|---|---|---|
| **1** | Warm-Up | 1 VU | 1m | Initial single-user connection and cache warm-up |
| **2** | Moderate Load | 2 VUs | 2m | Concurrency test with 2 active virtual users |
| **3** | Peak Ramp-Up | 3 VUs | 2m | Ramp traffic up to the maximum target of 3 VUs |
| **4** | Peak Plateau | 3 VUs | 3m | Sustain 3 concurrent long-polling connections |
| **5** | Cooldown | 0 VUs | 1m | Gracefully ramp down to 0 VUs |

*Total default duration: 9 minutes (customizable via `.env`).*

---

## 🧼 Does k6 Support SOAP Calls?

**Yes!** SOAP web services run over HTTP/HTTPS using `POST` requests with XML envelopes. Because k6 natively supports custom HTTP methods, headers, and string payloads, it fully supports SOAP 1.1 and 1.2:

1. **SOAP 1.1**: Uses `Content-Type: text/xml; charset=utf-8` and requires the `SOAPAction: "..."` header.
2. **SOAP 1.2**: Uses `Content-Type: application/soap+xml; charset=utf-8; action="..."`.
3. **Authentication**: Supports HTTP Basic Auth, Bearer Token, API Key, or WS-Security (`wsse:UsernameToken`) inside the `<soap:Header>`.
4. **Validation**: k6 checks HTTP status code (200), ensures the body does not contain a `<soap:Fault>`, and parses XML elements via `extractXmlValue()`.

---

## 🔑 Multi-User Token Pool Management (`tokens.json`)

To simulate distinct concurrent users without token reuse:

1. **Generating the JSON**: Run the token generator to extract deduplicated tokens from `login-token-QA1.txt`:
   ```powershell
   # Generate tokens for 100 users:
   npm run tokens -- 100
   
   # Or using PowerShell directly:
   .\scripts\generate-tokens.ps1 -Count 100
   
   # Or export ALL 2,591 unique tokens:
   npm run tokens
   ```
2. **Automated Safety Guard**:
   - **If `.env` requires 100 users and `tokens.json` only has 50**: k6 immediately aborts with an error before running any requests to prevent duplicate users.
   - **If `tokens.json` has 200 tokens and `.env` asks for 100**: k6 automatically selects only the first 100 tokens, leaving the rest unused.
   - **1-to-1 Mapping**: Virtual User 1 uses `token[0]`, Virtual User 2 uses `token[1]`, etc.

---

## ⚙️ Prerequisites & k6 Installation

If you don't have k6 installed yet, install it using your preferred package manager:

### Windows
```powershell
# Using Winget (recommended)
winget install k6 --source winget

# OR using Chocolatey
choco install k6

# OR using Scoop
scoop install k6
```

### macOS
```bash
brew install k6
```

### Linux (Debian / Ubuntu)
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### Docker
```bash
docker pull grafana/k6
```

---

## 🚀 Quick Start

### 1. Set Up Environment Variables

Configure your local `.env` file:

```powershell
# Copy the template if you don't already have .env
Copy-Item .env.example .env
```

Open `.env` and set `TEST_TYPE`:
- `TEST_TYPE=REST` (default): Runs REST endpoints (`GET` and `POST`)
- `TEST_TYPE=SOAP`: Runs SOAP Web Service requests
- `TEST_TYPE=BOTH`: Runs both REST and SOAP in each iteration

---

### 2. Run the Test

#### Option A: Using PowerShell Runner (Recommended for Windows)
The runner parses `.env` automatically and passes all variables to k6:
```powershell
.\scripts\run.ps1
```

#### Option B: Testing SOAP Directly
```powershell
# Run SOAP performance test with npm
npm run test:soap

# OR directly with k6
k6 run -e TEST_TYPE=SOAP main.js
```

#### Option C: Testing REST Directly
```powershell
npm test
# OR quick 50-second test
npm run test:quick
```

#### Option D: Direct k6 CLI with Custom Flags
```powershell
k6 run -e TEST_TYPE=SOAP -e BASE_URL="https://soap.yourcompany.com" -e SOAP_ACTION="GetAccount" main.js
```

---

## 🧼 Working with SOAP in This Project

### 1. Dedicated `apiClient.soap()` Method
The `ApiClient` class in [src/client/api-client.js](file:///c:/Users/george.gil/Documents/valet/src/client/api-client.js) has a dedicated `soap()` method:

```javascript
import { apiClient } from '../client/api-client.js';

const xmlEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetUserDetails xmlns="http://tempuri.org/">
      <UserId>1024</UserId>
    </GetUserDetails>
  </soap:Body>
</soap:Envelope>`;

const res = apiClient.soap('/ws/users.asmx', 'http://tempuri.org/GetUserDetails', xmlEnvelope);
```

### 2. XML Helpers ([src/utils/xml.js](file:///c:/Users/george.gil/Documents/valet/src/utils/xml.js))
- `extractXmlValue(xml, 'TagName')`: Extracts value from `<TagName>...</TagName>` or `<ns:TagName>...</ns:TagName>`.
- `isSoapFault(xml)`: Checks if the service returned a SOAP `<Fault>` or `<soap:Fault>`.
- `buildSoap11Envelope(body, header)`: Wraps body and headers in SOAP 1.1 syntax.
- `buildSoap12Envelope(body, header)`: Wraps body and headers in SOAP 1.2 syntax.
- `buildWsSecurityHeader(user, pass)`: Generates standard WS-Security `wsse:UsernameToken` XML.

### 3. SOAP Customization Example ([src/scenarios/soap-flow.js](file:///c:/Users/george.gil/Documents/valet/src/scenarios/soap-flow.js))
Simply adjust the body in `getSoapRequestBody()` to match your service's XML schema.

---

## 🔐 Authentication Modes

### 1. Bearer / JWT Token
```ini
API_TOKEN=eyJhbGciOi...
TOKEN_TYPE=Bearer
```
Sends: `Authorization: Bearer <API_TOKEN>`

### 2. API Key Header
```ini
API_KEY=my-secret-api-key
```
Sends: `x-api-key: my-secret-api-key`

### 3. HTTP Basic Auth
```ini
API_USERNAME=admin
API_PASSWORD=secret
```
Sends: `Authorization: Basic <base64(admin:secret)>`

### 4. SOAP WS-Security (UsernameToken)
When `API_USERNAME` and `API_PASSWORD` are provided, the SOAP flow automatically injects a `wsse:Security` block into the `<soap:Header>`.

---

## 📝 Configuration Reference (`.env`)

| Variable | Default Value | Description |
|---|---|---|
| `TEST_TYPE` | `REST` | Protocol to test: `REST`, `SOAP`, or `BOTH` |
| `BASE_URL` | `https://httpbin.test.k6.io` | API root address (without trailing slash) |
| `API_TOKEN` | *(empty)* | Bearer/JWT token string |
| `TOKEN_TYPE` | `Bearer` | Auth header prefix (`Bearer`, `Token`, etc.) |
| `API_KEY` | *(empty)* | Custom `x-api-key` header value |
| `API_USERNAME` | *(empty)* | Basic auth username / WS-Security user |
| `API_PASSWORD` | *(empty)* | Basic auth password / WS-Security pass |
| `GET_ENDPOINT` | `/get` | Relative path for REST GET step |
| `POST_ENDPOINT` | `/post` | Relative path for REST POST step |
| `SOAP_ENDPOINT` | `/webservicesserver/NumberConversion.wso` | Path or URL for SOAP service |
| `SOAP_ACTION` | `NumberToWords` | SOAPAction header URI |
| `SOAP_VERSION` | `1.1` | SOAP version (`1.1` or `1.2`) |
| `STAGE_1_TARGET` | `10` | Virtual users target for Stage 1 |
| `STAGE_1_DURATION` | `30s` | Duration for Stage 1 |
| `STAGE_2_TARGET` | `25` | Virtual users target for Stage 2 |
| `STAGE_2_DURATION` | `1m` | Duration for Stage 2 |
| `STAGE_3_TARGET` | `50` | Virtual users target for Stage 3 (peak) |
| `STAGE_3_DURATION` | `2m` | Duration for Stage 3 |
| `STAGE_4_TARGET` | `50` | Virtual users target for Stage 4 (plateau) |
| `STAGE_4_DURATION` | `2m` | Duration for Stage 4 |
| `STAGE_5_TARGET` | `0` | Virtual users target for Stage 5 (cooldown) |
| `STAGE_5_DURATION` | `30s` | Duration for Stage 5 |
| `THRESHOLD_P95` | `500` | p95 latency threshold in ms |
| `THRESHOLD_P99` | `1000` | p99 latency threshold in ms |
| `THRESHOLD_ERROR_RATE` | `0.01` | Maximum failure rate tolerance (`0.01` = 1%) |
| `THINK_TIME_SEC` | `0.5` | Sleep time (seconds) between requests per VU |
| `REQUEST_TIMEOUT` | `10s` | Request timeout duration |

---

## 📊 Reports & Analysis

When a test run completes:

1. **Terminal Summary**: Total requests, error rate, average latency, p95, and p99 values.
2. **JSON Summary File**: Exported to `reports/summary.json` for CI/CD metrics collection.
3. **Threshold Gates**: If p95 exceeds your limit or error rate exceeds 1%, k6 exits with non-zero exit code (`99`), automatically failing CI/CD pipelines.
