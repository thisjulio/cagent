# Spec: In-turn Message Queue

## Objective

Allow users to send additional messages while the agent is processing the current turn. The input remains available and clearly indicates that new submissions will be queued. Queued messages are shown immediately in the main chat history, retain submission order, and are processed after the current turn completes.

The target user is a cagent user who wants to add instructions during a long-running response without interrupting the agent. Messages submitted during one active interval are grouped into one follow-up turn, preserving their order within that group. The queue is persisted with the session and restored when the session is reopened.

## Scope and Behavior

- While the agent is busy, submitting a normal user message appends it to the visible chat and the pending queue instead of rejecting it.
- Queued messages are immutable after submission and have a textual queued status in the UI.
- A queued message is a mid-turn continuation request, not a separate independent turn and not a request to wait for the entire current execution to finish.
- At a provider continuation boundary, the controller incorporates all queued messages received so far into the next provider request, preserving submission order and including the partial/current turn context.
- The agent may continue, revise, or branch its work in light of the queued request; it is not modeled as blindly resuming the previous plan or answering each queued message separately.
- The UI keeps the interaction within the same visible turn branch and does not render a completed-turn boundary before the queued continuation.
- If the active execution fails, queued messages are not silently discarded and remain available for recovery or continuation.
- The queue has no feature-specific count or character limit; existing context and provider limits remain authoritative.
- Pending messages and their statuses survive session close/reopen through the existing session persistence mechanism.
- Existing commands, cancellation, interruption, tool approval, and session restoration behavior must remain compatible unless explicitly updated in the implementation plan.

## Tech Stack

- Bun and TypeScript.
- Existing cagent core architecture: UI -> controller -> domain -> SDK.
- OpenTUI terminal UI.
- Existing JSONL session persistence unless a design review demonstrates that an extension is required.
- No new dependency is expected. Adding one requires prior approval.

## Commands

Run from the project root:

```sh
bun install
bun run build
bun run typecheck
bun run lint
bun test
bun run verify
```

Focused tests may be run with:

```sh
bun test core/test/<relevant-test-file>.test.ts
```

For UI changes, also run:

```sh
bun core/scripts/snap.tsx
```

After code changes, update the knowledge graph:

```sh
graphify update .
```

## Project Structure

- `core/src/controller/` — orchestration of submission, active turns, and queue draining.
- `core/src/session.ts` and `core/src/controller/sessions.ts` — session records and restoration.
- `core/src/ui/components/` — OpenTUI presentation of the input and chat history.
- `core/src/ui/render/` — pure formatting and status rendering.
- `core/test/` — controller, session, loop, and UI-adjacent behavior tests.
- `docs/` — architectural decisions or supporting design documentation when required.

The implementation should introduce a focused queue domain module rather than embedding queue rules in a UI component. UI components remain responsible only for layout and formatting; controller/domain code owns state transitions and persistence.

## Code Style

Follow the repository rules: English repository artifacts, one responsibility per file, dependency direction, no UI imports in logic modules, and no forbidden generic filenames.

Example style:

```ts
export type QueuedMessage = {
  id: string;
  content: string;
  submittedAt: number;
  status: "queued" | "processing";
};

export function enqueueMessage(
  queue: readonly QueuedMessage[],
  message: QueuedMessage,
): QueuedMessage[] {
  return [...queue, message];
}
```

Use explicit domain names, immutable transformations where practical, narrow functions, and options objects when more than four parameters would otherwise be required. Comments must explain non-obvious decisions, using `// ponytail:` only where appropriate.

## Testing Strategy

- Add focused pure tests for FIFO ordering, grouping, immutable queued records, draining after completion, and behavior when the active turn fails.
- Add controller tests proving that submissions are accepted while busy, reflected immediately in chat, and do not interrupt the active turn.
- Add session tests proving queued messages/status metadata are persisted and restored without losing order.
- Add regression tests proving existing idle submission, interruption, cancellation, slash command, and tool-related behavior remains unchanged.
- Add UI/snapshot coverage for the input's queued-state indication, queued-message status, and removal of queue status after the combined response completes.
- Run the complete mandatory pipeline: build, typecheck, lint, and all tests. No test may be removed or skipped to make the pipeline pass.

## Prototype Layout Reference

The prototype must follow the current cagent snapshot language rather than introducing a new chat layout. The reference below is based on the existing 80-column `core/scripts/snap.tsx` output: header status, indented turn blocks, `You`/`cagent` labels, separator lines, prompt footer, workspace footer, and context footer.

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│ cagent | (f42424) | queued input                                         working │
│────────────────────────────────────────────────────────────────────────────────│
│                                                                                  │
│  You 06:26 PM                                                                    │
│  └─ explain the current implementation                                           │
│                                                                                  │
│  cagent 06:26 PM                                                                 │
│  │                                                                               │
│  ├─ ⋯ response is still streaming...                                            │
│  │                                                                               |
|                                                                                  │   
│  You 06:26 PM                                                                    │
│  └─ [queued] also explain the persistence behavior                               │
│                                                                                  │
│  You 06:26 PM                                                                    │
│  └─ [queued] include failure recovery                                             │
│                                                                                  │
│────────────────────────────────────────────────────────────────────────────────│
│ ◌ prompt · queued while agent is working                                          │
│ ╭────────────────────────────────────────────────────────────────────────────╮   │
│ │ > type your next instruction                                               │   │
│ │                                                                            │   │
│ ╰────────────────────────────────────────────────────────────────────────────╯   │
│────────────────────────────────────────────────────────────────────────────────│
│ 📁 ~/Público/cagent                                               ⎇ main ↑1 ⚠2   │
│stub/stub-model               0/100000 [--------------------] 0% context · /help │
│                                                                                  │
└────────────────────────────────────────────────────────────────────────────────┘
```

When the active execution reaches a provider continuation boundary, queued messages are incorporated into the next provider request in submission order. The active turn does not first become a completed, closed turn; it branches into a continuation that includes the partial work already visible and the new user request. The provider may change direction based on the added request. The prototype is:

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│ cagent | (f42424) | continuing turn                                      working │
│────────────────────────────────────────────────────────────────────────────────│
│  You 06:26 PM                                                                    │
│  └─ list 10 directories                                                          │
│                                                                                  │
│  cagent 06:26 PM                                                                 │
│  │                                                                               │
│  ├─ 1. /etc                                                                      │
│  ├─ 2. /home                                                                     │
│  └─ 3. /usr                                                                      │
│                                                                                  │
│  You 06:26 PM                                                                    │
│  └─ the next directories should be from root folder X                             │
│                                                                                  │
│  cagent 06:26 PM                                                                 │
│  │                                                                               │
│  ├─ 4. /X/projects                                                               │
│  ├─ 5. /X/src                                                                     │
│  └─ 6. /X/tests                                                                   │
│                                                                                  │
│────────────────────────────────────────────────────────────────────────────────│
│ ◌ prompt · continuing turn with additional input                                  │
│ ╭────────────────────────────────────────────────────────────────────────────╮   │
│ │ > type your next instruction                                               │   │
│ │                                                                            │   │
│ ╰────────────────────────────────────────────────────────────────────────────╯   │
│────────────────────────────────────────────────────────────────────────────────│
│ 📁 ~/Público/cagent                                               ⎇ main ↑1 ⚠2   │
│stub/stub-model               0/100000 [--------------------] 0% context · /help │
└────────────────────────────────────────────────────────────────────────────────┘
```

The additional message is rendered as an ordinary user block once incorporated into the continuation; it is not labeled as a completed or separate turn. The UI must not show a completed-turn boundary before the continuation. Provider-request tests must prove that partial context and queued additions are sent together, in order, and that the provider can change the previous trajectory rather than merely resume it.

Snapshot acceptance requires preserving the current cagent visual grammar at 60, 80, and 120 columns: the existing header/footer regions remain present, user messages use the current `You` turn block, agent output uses the current `cagent` block, queued messages are visibly marked with textual status, and the input remains usable while the header/prompt status indicates working or queued processing. The implementation must run `bun core/scripts/snap.tsx` and compare all generated snapshots against this prototype before UI implementation is approved.

## Boundaries

### Always do

- Preserve FIFO submission order.
- Keep the input available while a turn is active and show that submissions will be queued.
- Display queued messages immediately in the main history with a textual status.
- Persist pending messages and restore them when reopening the session.
- Process queued messages after the active turn, grouped by the defined active interval.
- Process the queue even when the active turn fails.
- Preserve the UI -> controller -> domain -> SDK dependency direction.
- Run the mandatory verification pipeline and `graphify update .` after implementation.

### Ask first

- Adding a dependency.
- Changing a public SDK or event interface.
- Changing the session record format in a backward-incompatible way.
- Changing existing interruption, cancellation, error, or tool approval semantics.
- Introducing a new user-visible queue limit or a new configuration setting.

### Never do

- Discard queued messages silently.
- Reorder, edit, or mutate a queued message after submission.
- Block the input solely because the agent is busy.
- Interrupt the active turn merely because a message was queued.
- Remove or weaken existing tests, checks, or architecture constraints.
- Commit secrets or modify vendor/dependency directories.

## Success Criteria

1. During streaming, a user can submit one or more normal messages without interrupting the active execution.
2. Each submitted message appears immediately in the main history with a textual queued status.
3. At the next provider continuation boundary, queued messages and partial turn context are sent together in exact order.
4. The continuation remains within the same visible turn branch and has no completed-turn boundary.
5. The provider can alter its trajectory based on the queued additions, rather than merely resuming the previous plan.
6. A failed active execution does not lose or silently discard queued messages.
7. Once a queued message is incorporated, its queue state and label are removed and it renders as an ordinary user turn.
8. Reopening the session restores only genuinely pending queue state, not stale queued labels.
9. Existing idle submission and interruption behavior remains covered and passing.
10. `bun run build`, `bun run typecheck`, `bun run lint`, and `bun test` all pass.

## Open Questions

- What exact textual labels should distinguish queued and processing states before the queue state is removed?
- How is the "same interval" for grouping defined: all messages received before the active turn completes, or a short debounce window after completion begins?
- Should restored pending messages resume automatically when a session opens, or remain queued until the user submits/continues?
- Does a queued follow-up count as a new turn ID for persistence and observability?

## Approval Gate

This specification is ready for review. No implementation should begin until the user approves it and resolves the open questions above.
