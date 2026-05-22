# Debug Session: sse-install-stuck

## Session ID
`sse-install-stuck`

## Date
2026-05-21

## Status
[OPEN]

---

## 1. Symptom / User Report
> "after clicking install it stops at Triggering remote installation / still shows SSE debug messages"

The PowerMTA installer UI is still showing internal SSE debug messages such as:
- `SSE status: 200 OK`
- `SSE reader ready, waiting for events...`

Expected behavior:
- The UI should show only real backend install progress messages from `/pmta/install`
- The install flow should continue past the initial trigger and stream actual remote steps

---

## 2. Initial Hypotheses

### H1: The VPS is serving an older frontend build
- Observation to collect: built JS bundle still contains `SSE status` strings

### H2: The browser is loading a cached bundle or service-worker-like stale asset
- Observation to collect: network/build asset names differ from latest local build

### H3: The production app is not serving the repo/frontend bundle that was edited
- Observation to collect: deployed `dist` files on VPS differ from local `dist`

### H4: The install flow is entering a different code path than `src/App.jsx`
- Observation to collect: runtime instrumentation proves whether `handleInstallPmta` and `api.installPmta()` from current source are executing

### H5: Authentication/public-access mismatch breaks `/pmta/install` before real SSE events are emitted
- Observation to collect: backend route receives request and either rejects auth or closes stream early

---

## 3. Evidence Plan

1. Inspect local source and built assets for stale/debug strings
2. Instrument frontend install flow with runtime reporting markers
3. Instrument backend `/pmta/install` entry and auth/session checkpoints
4. Compare pre-fix and post-fix evidence

---

## 4. Progress Log

- Created debug session file
