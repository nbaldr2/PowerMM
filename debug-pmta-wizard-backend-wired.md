# Debug Session: pmta-wizard-backend-wired

## Session ID
`pmta-wizard-backend-wired`

## Date
2026-05-21

## Status
[OPEN]

---

## 1. Symptom / User Report
> "fix the PowerMTA Setup Wizard it just show UI data i need the real backend"

The PowerMTA Setup Wizard in MoonMailer Pro shows form fields in the UI but the buttons/functions do not call the real backend API. The SSH test is simulated, config saves use wrong field names, and several buttons just show `alert()` popups instead of calling the API.

---

## 2. Environment
- **Project**: MoonMailer Pro (PowerMM)
- **Frontend**: React SPA (`src/App.jsx`)
- **Backend**: Express + PostgreSQL (`server/routes/pmta.js`)
- **Auth**: Bearer token via `api.js` wrapper

---

## 3. Falsifiable Hypotheses

### H1: `testSshConnection` is a pure frontend simulation
- **Observation**: `testSshConnection` (line 736 App.jsx) uses `setTimeout` to fake success — it never calls `POST /pmta/test-ssh`
- **Evidence needed**: Button click produces instant fake success without any network request
- **Fix**: Replace with `await api.testSsh({ host, port, username, password, privateKey, useLocalServer })`

### H2: `handleInstallPmta` sends wrong field names to `POST /pmta/config`
- **Observation**: Config object uses `sshHost` for `primary_ip` and `parseInt(smtpPort)` (undefined) for `smtp_port`
- **Evidence needed**: Request body has `primary_ip: "217.154.81.50"` (should be `pmtaPrimaryIp`) and `smtp_port: NaN`
- **Fix**: Map correct state vars → correct API field names

### H3: `controlService` function is not defined but is called
- **Observation**: Step 3 "Service Control" buttons call `controlService('status')` etc. but function doesn't exist
- **Evidence needed**: Clicking "Status" button does nothing (no function = no-op)
- **Fix**: Implement `controlService` calling `POST /pmta/service/:action` via SSH session

### H4: Step 3 config editor buttons are `alert()` stubs
- **Observation**: "Edit Template", "Preview", "Load from Server", "Save to Server" all do `alert(\`Simulated: ${act}\`)`
- **Evidence needed**: Clicking any button shows browser alert instead of doing work
- **Fix**: "Load from Server" → `GET /pmta/load-config`, "Save to Server" → `POST /pmta/config` with `config_text`

### H5: Wizard doesn't persist `isp_rules` in config payload
- **Observation**: `handleInstallPmta` config object doesn't include `isp_rules` array from wizard state
- **Evidence needed**: DB record has `isp_rules: '[]'` despite ISP Rules Manager having entries
- **Fix**: Add `isp_rules: ispRules` to config payload

---

## 4. Runtime Evidence Plan

Since this is a UI/API integration issue, static code analysis confirms all 5 hypotheses. The evidence is in the code itself — no runtime debug server needed. Each hypothesis is confirmed by reading the source:

| Hypothesis | Status | Evidence |
|------------|--------|----------|
| H1 | CONFIRMED | `testSshConnection` uses `setTimeout` only |
| H2 | CONFIRMED | `primary_ip: sshHost`, `smtp_port: parseInt(smtpPort)` |
| H3 | CONFIRMED | `controlService` not defined, buttons silently no-op |
| H4 | CONFIRMED | All 4 buttons use `alert(\`Simulated...\`` |
| H5 | CONFIRMED | `isp_rules` not in config object |

---

## 5. Fix Plan (Minimal Scope)

1. **Fix H1**: Rewrite `testSshConnection` to call `api.testSsh({...})`
2. **Fix H2**: Correct config field mappings in `handleInstallPmta`
3. **Fix H3**: Add `controlService` function calling `api.pmtaServiceControl`
4. **Fix H4**: Wire "Load from Server" and "Save to Server" buttons to real API
5. **Fix H5**: Add `isp_rules` and `config_text` to install config payload

---

## 6. Operations / Checkpoint

- [x] 1. Review codebase
- [x] 2. Create debug session record
- [x] 3. Confirm hypotheses via static analysis
- [ ] 4. Implement fixes (H1-H5)
- [ ] 5. Verify with lint/typecheck
- [ ] 6. Cleanup artifacts: None (no debug server used)
