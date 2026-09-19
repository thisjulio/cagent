# Task List: In-turn Message Queue

## Phase 1: Contract and Foundation
- [x] **Task 1 — Resolve SPEC open questions and approve queue behavior**
  - Acceptance: exact labels, grouping interval, restoration behavior, and turn-ID policy are recorded and approved.
  - Verification: Human decisions recorded in `tasks/plan.md`.
  - Dependencies: None.
  - Scope: XS; documentation/decision only.
- [ ] **Task 2 — Define queue domain and immutable state transitions**
  - Acceptance: focused domain module supports FIFO enqueue, grouping, processing/drain transitions, immutable records, and failure retention.
  - Verification: focused queue unit tests cover ordering, grouping, immutability, drain, and failure.
  - Dependencies: Task 1.
  - Scope: S; one domain module and one test file.

## Checkpoint: Foundation
- [ ] Focused queue tests pass.
- [ ] Accepted decisions are recorded before controller integration.
- [ ] Existing interruption and cancellation semantics are unchanged.

## Phase 2: Vertical Runtime Path
- [ ] **Task 3 — Accept busy submissions and continue with queued input**
  - Acceptance: normal busy submissions appear immediately, preserve FIFO order, do not interrupt active execution, and are incorporated with partial context at the next provider boundary.
  - Verification: controller/provider tests prove exact request ordering, same visible branch, and provider trajectory can change.
  - Dependencies: Task 2.
  - Scope: M; controller, submission/turn integration, and focused tests.
- [ ] **Task 4 — Persist and restore pending queue state**
  - Acceptance: queued records/status survive close/reopen, old sessions load with an empty queue, and failed active turns retain queued messages.
  - Verification: session persistence tests cover order, statuses, backward compatibility, and failure recovery.
  - Dependencies: Task 3.
  - Scope: M; session/state/controller integration and tests.

## Checkpoint: Runtime
- [ ] Controller tests pass for busy acceptance, FIFO grouping, no interruption, continuation, and active failure.
- [ ] Session tests pass for persistence/restoration.
- [ ] Existing idle, slash-command, interruption, cancellation, approval, and tool tests pass.

## Phase 3: UI and Release Verification
- [ ] **Task 5 — Render queued status and keep input available**
  - Acceptance: queued messages show textual status in history, input remains usable while busy, and queued/continuing prompt/header statuses match approved labels.
  - Verification: UI tests and `bun core/scripts/snap.tsx` are compared at 60, 80, and 120 columns.
  - Dependencies: Tasks 3 and 4.
  - Scope: M; presentation components/rendering and tests.
- [ ] **Task 6 — Complete verification and update the knowledge graph**
  - Acceptance: all spec criteria are demonstrated, no unrelated changes are overwritten, and graph state is current.
  - Verification: `bun run build`, `bun run typecheck`, `bun run lint`, `bun test`, and `graphify update .` all pass.
  - Dependencies: Task 5.
  - Scope: S; verification only.

## Checkpoint: Complete
- [ ] Human reviews final diff and snapshot comparison.
- [ ] All tasks above are complete.
