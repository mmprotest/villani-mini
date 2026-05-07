# Integration test plan

## Covered
- Preload/runtime API and renderer global typing parity for `window.villani`.
- Planner-visible action protocol and context packet payload bounds.
- Chat task lifecycle message stability for approval/question/completion/blocked updates.
- Renderer wiring for approval/question cards, task event subscription, and setup retry IPC calls.
- Setup retry wiring (`retryAssets`, `retryBackend`, `retryAll`) and awaited full retry path.

## Intentionally not covered
- Live LLM/provider calls.
- Real production backend/server/bootstrap.
- Internet/network browser navigation.
- Full Electron window lifecycle and OS-level desktop capture.

## How to run
- `npm run test:integration`
- `npm run test:integration:watch`

## Stub/fake usage
- Deterministic fake `window.villani` APIs in renderer tests.
- Fake `AgentController` run output in chat lifecycle tests.
- No live backend/model/browser required.

## Electron / Playwright requirements
- These tests do **not** require Electron runtime or Playwright browser launch.
- Browser manager deep-resolution behaviors remain in existing non-integration suites.

## Expected limitations
- Preload/global parity is validated via source inspection + TS assertions, not by launching Electron.
- UI checks validate wiring/behavior for actionable cards, not pixel layout.
