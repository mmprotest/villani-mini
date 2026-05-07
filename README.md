# Villani Mini v1

Local-first desktop agent built with Electron + React + TypeScript.

## Overview
Villani Mini turns open-ended user requests into a structured execution workspace: understanding, plan, compact state, evidence, actions, approvals, execution state, and final result.

## Model
Default model URL:
https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-IQ4_XS.gguf

Manual fallback:
`llama-server --model /path/to/Qwen3.5-4B-IQ4_XS.gguf --host 127.0.0.1 --port 34783 --ctx-size 8192`

## Architecture
- Electron main process handles setup, IPC, agent, browser, files, and persistence.
- React renderer shows setup and task workspace.
- SQLite persistence and typed actions via Zod.

## Security
- Local model by default.
- llama-server bound to `127.0.0.1`.
- Approval-first browser-changing actions.

## Scripts
- `npm run dev`
- `npm run build`
- `npm run test`
- `npm run test:watch`
- `npm run start`
- `npm run package`

## Troubleshooting
If local runtime is unavailable, verify model path, llama-server binary, and endpoint health.
