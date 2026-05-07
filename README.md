# Villani Mini v1

Local-first desktop agent built with Electron + React + TypeScript.

## Setup
1. Install dependencies:
   - `npm install`
2. Optional model backend env (for external OpenAI-compatible backend):
   - `OPENAI_BASE_URL=https://your-endpoint/v1`
   - `OPENAI_MODEL=your-model`

## Backend configuration
- App backend mode/config is stored in the model backend store and is shared by chat + task runner.
- Agent/Chat both configure provider endpoint as `<endpoint>/chat/completions` and model name from current config.
- `model_backend_config` events are emitted in task runs with sanitized endpoint/model details.

## Running the app
- Dev: `npm run dev`
- Build: `npm run build`
- Start built app: `npm run start`

## Tests and checks
- Unit/integration tests: `npm test`
- Typecheck: `npm run typecheck`
- Controller smoke (live-backend aware): `npm run smoke:task`
  - Skips clearly if backend env is not configured.

## Current limitations
- Desktop/browser actions are bounded and approval-gated for sensitive operations.
- No claim of full autonomous desktop control; user approvals and safe path constraints still apply.
- Managed browser robustness suite includes skipped cases in CI-constrained environments.
