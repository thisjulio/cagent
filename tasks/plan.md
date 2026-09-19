# Implementation Plan: In-turn Message Queue

## Overview
Add a controller-owned FIFO queue for normal user messages submitted while an agent turn is active. Queued messages will appear immediately in chat, remain immutable and recoverable, be grouped into the next provider continuation request in submission order, and persist across session close/reopen. Existing commands, interruption, cancellation, tool approval, restoration, and provider contracts remain compatible.

## Current Context
- `SPEC.md` is the governing specification; it requires approval and resolution of four open questions before implementation.
- The current submission guard in `core/src/controller/controller.ts` rejects all input while `state.busy` is true.
- `core/src/controller/submission.ts` owns normal-turn setup and calls `executeTurn()`; `core/src/controller/turn.ts` and the loop define provider continuation/tool boundaries.
- `core/src/controller/state.ts` owns UI state; `core/src/controller/sessions.ts` reconstructs chat from JSONL records.
- `core/src/ui/components/InputArea.tsx` currently shows a busy/processing status and is presentation-only.
- `core/src/ui/render/blocks.ts` already derives turn blocks from flat chat items; queue metadata must not introduce controller logic into UI components.
- The working tree already contains unrelated modifications (`SPEC.md`, `core/src/ui/components/AgentTurnBlock.tsx`); implementation must not overwrite them.

## Dependency Graph
```text
Queue open-question decisions
        |
        v
Pure queue domain + queue state contract/tests
        |
        +--> Controller accepts busy submissions and appends visible queued records
        |          |
        |          v
        |   Provider continuation assembly/draining + failure recovery
        |
        +--> Session JSONL persistence/restoration
        |
        v
UI queued labels/input status
        |
        v
Regression, snapshots, graph update, full verification
```

## Architecture Decisions
- Queue rules live in a focused domain module under `core/src/controller/`; UI only renders state.
- Queue records are immutable and identified by stable IDs; enqueueing and draining use pure transformations.
- FIFO order is preserved; messages received during one active interval are combined at the next continuation boundary.
- Queue state is persisted through the existing JSONL session mechanism, with backward-compatible optional fields.
- Queued messages remain available after active-turn failure; no silent discard.
- No new dependency, queue-specific limit, memory-specific branch, or public SDK change is planned.
- The existing turn-block model remains the UI source of visible grouping; continuation must not create a completed-turn boundary before the follow-up.

## Task List

### Phase 1: Contract and Foundation
1. Resolve SPEC open questions and approve exact queue semantics.
2. Define the queue domain and immutable state transitions with focused tests.

### Checkpoint: Foundation
- Focused queue tests pass.
- Accepted decisions are recorded before controller integration.
- No existing interruption/cancellation semantics changed.

### Phase 2: Vertical Runtime Path
3. Implement busy submission acceptance, immediate chat rendering, and continuation request assembly/draining.
4. Persist and restore pending queue records, including failure recovery and backward compatibility.

### Checkpoint: Runtime
- Controller tests prove FIFO grouping, no interruption, continuation with partial context, and queue retention after failure.
- Session tests prove close/reopen order and status restoration.
- Existing idle, slash-command, interruption, cancellation, approval, and tool tests remain green.

### Phase 3: UI and Release Verification
5. Render queued status in the main history and keep the input available with explicit queued/continuing status.
6. Run regression tests, 60/80/120-column snapshots, graph update, and the mandatory build/typecheck/lint/test pipeline.

### Checkpoint: Complete
- All acceptance criteria in `SPEC.md` are demonstrated by tests or snapshots.
- `bun run build`, `bun run typecheck`, `bun run lint`, and `bun test` pass.
- `graphify update .` completes.
- Human reviews the final diff and snapshot comparison.

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Provider continuation boundary is not explicit in current flow | High | Trace `executeTurn`/loop request assembly first; add a narrow continuation seam rather than duplicating turn execution. |
| Queue records and canonical provider messages diverge | High | Treat queued chat/session records and provider message insertion as one controller transaction, with tests for exact ordering. |
| Active failure loses queued input | High | Keep queue outside transient turn state and test failure paths explicitly. |
| Existing interruption/cancellation behavior regresses | High | Preserve `interrupt`/`forceCancel` paths and run existing controller/loop tests at each checkpoint. |
| Old JSONL sessions lack queue metadata | Medium | Make new fields optional and infer empty queue for old records. |
| UI snapshots differ at narrow widths | Medium | Run `bun core/scripts/snap.tsx` at all required widths and compare against `SPEC.md` prototypes. |

## Approved Queue Semantics
1. Use the labels `[queued]`, `prompt · queued while agent is working`, and `continuing turn`.
2. Group all messages received before the active turn completes.
3. Restore pending messages without automatically resuming processing.
4. Keep the active turn ID and visible branch for continuations.

These decisions were approved by the user on 2026-09-19.

## Acceptance Criteria
- Busy normal submissions are accepted, visible immediately, FIFO, and do not interrupt the active turn.
- Queued records are immutable, textual-statused, persisted, and recoverable after failure/reopen.
- The next provider request receives partial/current context plus queued additions in exact order.
- Continuation remains in the same visible branch without a premature completed-turn boundary.
- Incorporated messages lose queue status and render as ordinary user content.
- Existing command, cancellation, interruption, approval, restoration, and tool behavior remains compatible.
- Full mandatory verification and graph update pass.

## Human Review Gate
Resolved on 2026-09-19. Task 2 may begin.
