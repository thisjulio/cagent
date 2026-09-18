# Manual Context Validation Plan

This document defines a manual protocol for validating the context-window redesign. It is intentionally written as an executable checklist: follow the steps, collect the evidence, and record a pass or fail for every scenario.

## Goals

Validate that cagent:

- uses provider-reported usage instead of local token estimates;
- keeps a recent sliding window without destroying the transcript;
- preserves essential decisions and task state through compaction;
- can recover older context when retrieval is available;
- keeps tool-call sequences valid;
- recovers safely from provider context-limit errors;
- resumes compacted sessions correctly; and
- exposes useful, privacy-safe telemetry.

## 1. Prepare the test environment

### 1.1 Use a disposable project

Run:

```bash
mkdir -p /tmp/cagent-context-test
cd /tmp/cagent-context-test
git init
printf 'initial\n' > notes.txt
```

Do not run the destructive scenarios in the main repository.

### 1.2 Enable local telemetry

Create `/tmp/cagent-context-test/cagent.yml`:

```yaml
model: openai/your-model

observability:
  enabled: true
  file: /tmp/cagent-context-test/telemetry.jsonl

compact_keep_tokens: 32000
context_recent_messages: 24
compact_auto: true
```

Replace `openai/your-model` with a model route available in the local environment.

In a second terminal, watch telemetry:

```bash
tail -f /tmp/cagent-context-test/telemetry.jsonl
```

The session is persisted under:

```text
~/.cagent/sessions/<session-id>.jsonl
```

The status bar should show provider usage after a response, or `no usage yet` before usage is available. It must not show a value calculated by `characters / 4`.

### 1.3 Record evidence

Use this table for every scenario:

| Scenario | Result | Input tokens | Output tokens | Compacted? | Retrieved? | Notes |
|---|---|---:|---:|---|---|---|
| | | | | | | |

Record the prompt, response, executed tools, changed files, provider usage, telemetry events, session ID, and failures or repeated work.

## 2. Manual scenarios

### C1 — Short conversation baseline

**Purpose:** Confirm that ordinary conversation was not degraded.

**Steps:**

1. Start cagent with `cagent`.
2. Send:

   ```text
   Respond with exactly: CONTEXT_OK
   ```

3. Send:

   ```text
   What word did you respond with previously?
   ```

**Observe:**

- The first response is `CONTEXT_OK`.
- The second response remembers `CONTEXT_OK`.
- Provider usage appears after the response.
- A `prompt.assembled` event is emitted.
- No unnecessary compaction occurs.

**Pass:** The short conversation works and usage is provider-reported.

**Fail:** The second answer forgets the first, a fabricated usage value appears, or the session compacts unnecessarily.

### C2 — Sliding-window displacement

**Purpose:** Confirm that compaction limits the active context while the transcript remains available.

**Steps:**

Send these messages one at a time:

```text
FACT_01: the selected database is PostgreSQL.
```

```text
FACT_02: the API must use token authentication.
```

```text
FACT_03: tests must be written with Bun.
```

```text
FACT_04: the main file is src/main.ts.
```

```text
FACT_05: SDK compatibility has priority.
```

```text
FACT_06: no external dependencies may be added.
```

Then send:

```text
List every FACT_01 through FACT_06 that you can remember.
```

**Observe:**

- Before compaction, `prompt.assembled` includes the complete active history.
- After compaction, the request contains the checkpoint plus recent complete turns up to
  `compact_keep_tokens`; the legacy message count is only a compatibility fallback.
- Omitted turns remain in the session JSONL.
- The active request becomes smaller than the pre-compaction transcript only after compaction.
- Oversized tool outputs are pruned before the recent-context budget is applied.

**Pass:** Normal requests retain history; compaction creates a bounded checkpoint plus recent turns, without deleting the transcript.

**Fail:** Old records disappear from the session, normal requests are truncated before compaction, or compaction does not bound the request.

**Current limitation:** The checkpoint is generated during compaction; history search/read retrieval tools are not yet available for the model to recover details that were not preserved in that summary.

### C3 — Essential decision retention

**Purpose:** Confirm that important decisions survive compaction.

**Steps:**

1. Send:

   ```text
   ESSENTIAL DECISION:
   - never use SQLite;
   - PostgreSQL is the official database;
   - this decision must remain valid after compaction.
   Reply only: DECISION_RECORDED
   ```

2. Send several unrelated prompts:

   ```text
   Explain what a message queue is.
   ```

   ```text
   Explain REST versus GraphQL.
   ```

   ```text
   List three caching strategies.
   ```

   ```text
   Describe a CI pipeline.
   ```

3. Ask:

   ```text
   Which database was selected, and which database was explicitly forbidden?
   ```

**Observe:** The agent says PostgreSQL was selected and SQLite was forbidden. The decision remains in the transcript and, once retention classification is wired to task state, is represented as `essential`.

**Pass:** The decision remains precise after history growth or compaction.

**Fail:** The summary says only that a database was discussed, or reverses the decision.

### C4 — Manual compaction

**Purpose:** Confirm checkpoint creation and preservation of recent context.

**Steps:**

1. Accumulate a few meaningful turns.
2. Run:

   ```text
   /compact
   ```

3. If supported, use:

   ```text
   /compact preserve decisions, constraints, changed files, and next steps
   ```

4. Inspect the session file:

   ```bash
   ls -lt ~/.cagent/sessions/*.jsonl | head
   grep -n 'compacted\|usage' ~/.cagent/sessions/<session-id>.jsonl
   ```

**Observe:**

- The UI reports that a history checkpoint was created.
- The recent window remains available.
- The original transcript remains persisted.
- The checkpoint preserves decisions and next steps.
- No local token estimate is displayed or persisted.

**Pass:** Compaction changes the active representation without destroying the transcript.

**Fail:** The transcript is replaced permanently, recent tool output disappears, or the result contains invalid tool-message ordering.

### C5 — Continue a task after compaction

**Purpose:** Confirm that compaction preserves actionable task state.

**Steps:**

1. Send:

   ```text
   Create plan.md with these tasks:
   1. add a greet function;
   2. add a test for greet;
   3. run the tests.
   Do not execute anything yet. Return only the plan.
   ```

2. Send:

   ```text
   Implement only task 1 and stop.
   ```

3. Run:

   ```text
   /compact
   ```

4. Send:

   ```text
   Continue from the plan. Implement the next pending task and then run the tests.
   ```

**Observe:** The agent does not repeat task 1, implements task 2, runs the tests, and reports the actual result.

**Pass:** The task continues from the correct state.

**Fail:** Completed work is repeated, the wrong task is selected, or tests are claimed without execution.

### C6 — Tool-heavy context growth

**Purpose:** Exercise the dominant long-session growth pattern.

**Steps:**

Send:

```text
Inspect this project deeply. Use the available tools to:
1. list files;
2. search for context-related functions;
3. check git status;
4. read the relevant files;
5. run the tests.
At the end, explain which files matter.
```

Then repeat with:

```text
Search again for files related to sessions.
```

```text
Read the compaction-related files again.
```

```text
Run the tests again and compare the result.
```

```text
Check the git diff again.
```

**Observe:**

- Large tool outputs do not dominate every later request.
- Unchanged files are not needlessly reread forever.
- Successful command output can be summarized while errors and relevant lines remain.
- Tool-call and tool-result pairs stay valid.
- Real input usage is recorded for each provider request.

Inspect:

```bash
jq -c 'select(.type == "event")' /tmp/cagent-context-test/telemetry.jsonl
```

**Pass:** The agent continues finding the right files without premature context failure or repetitive work.

**Fail:** The agent repeatedly rereads identical content without reason, loses tool state, or hits the context limit unnecessarily.

### C7 — Recover an old decision

**Purpose:** Validate model-driven retrieval of older context.

**Steps:**

1. At the beginning of a session, send:

   ```text
   OLD RULE:
   Never change package.json without my explicit approval.
   Reply: RULE_SAVED
   ```

2. Perform 8–12 unrelated turns.
3. Ask:

   ```text
   You need to add a dependency to package.json. Can you do it directly?
   ```

**Expected result:** The agent says explicit approval is required.

**Observe:** Ideally, the model calls a history search/read tool and receives the old rule with its turn reference. Retrieved content should be temporary for the current request, not permanently duplicated into the transcript.

**Pass:** The rule is recovered and respected.

**Current limitation:** This scenario will expose the known gap if history retrieval tools have not yet been integrated. The assembler already accepts retrieved turns, but the model currently lacks an end-to-end history search/read tool.

### C8 — Resume a compacted session

**Purpose:** Confirm persistence across process restarts.

**Steps:**

1. Send:

   ```text
   Important decisions for this session:
   - use PostgreSQL;
   - preserve SDK compatibility;
   - do not add dependencies without approval.
   ```

2. Run `/compact`.
3. Note the session ID.
4. Exit with `Ctrl+C`.
5. Resume:

   ```bash
   cagent --session <session-id>
   ```

6. Ask:

   ```text
   What were the three important decisions from this session?
   ```

**Observe:** The resumed session knows the checkpoint, recent window, decisions, tasks, and title. The JSONL includes original records and compaction metadata.

**Pass:** The answer survives the process restart.

**Fail:** The result depended on in-memory state or the transcript was lost.

### C9 — Provider without usage

**Purpose:** Ensure missing provider usage is not replaced with a local estimate.

**Setup:** Use a test provider or provider mode that omits usage from its finish chunk.

**Steps:**

```text
Respond only: PROVIDER_WITHOUT_USAGE
```

**Observe:** The status shows `no usage yet`, or clearly retains the last known usage without pretending that a new measurement exists. It must not show a value derived from message length.

**Pass:** Unknown usage remains unknown.

**Fail:** cagent displays a fabricated token count.

### C10 — Real context-limit recovery

**Purpose:** Validate recovery from a provider-enforced context limit.

**Steps:**

1. Use a provider/model with a small context window, or a test provider that deliberately returns a context-limit error.
2. Send enough content to exceed that window.

**Expected sequence:**

```text
provider context error
→ context-limit notice
→ compaction
→ retry
```

**Observe:**

- The retry count is bounded.
- The transcript is preserved.
- The task continues if the compacted request fits.
- A clear error is shown if it still cannot fit.

**Pass:** Recovery is safe and finite.

**Fail:** Infinite retry, destructive history loss, or repeated compaction without progress.

### C11 — Tool-call atomicity

**Purpose:** Confirm that compaction never splits a tool exchange when retaining the recent window.

**Steps:**

1. Ask for a task that reads a file, edits it, and runs tests.
2. While the session has tool exchanges, run `/compact`.
3. If possible, inspect the provider request captured by a test provider.

**Observe:** There must never be a tool result without its corresponding assistant tool call, or an assistant tool call without the required tool result. The active selection must remove complete turns/blocks, not arbitrary messages.

**Pass:** Every provider request has valid tool-message ordering.

**Fail:** The provider rejects the request or receives orphaned tool messages.

### C12 — Interrupt compaction safely

**Purpose:** Confirm that interruption does not destroy the session.

**Steps:**

1. Accumulate a meaningful history.
2. Run `/compact`.
3. While the UI shows `preparing history`, press `Esc`.
4. Continue the session with a normal prompt.

**Observe:**

- Compaction reports interruption.
- The transcript remains intact.
- No partial checkpoint is treated as complete.
- The session remains usable.

**Pass:** Interruption is safe and reversible.

## 3. Inspect telemetry

Show bounded events with:

```bash
jq -c 'select(.type == "event")' /tmp/cagent-context-test/telemetry.jsonl
```

Important events include:

```text
prompt.assembled
provider.error
compaction.started
compaction.completed
compaction.requested
turn.completed
tool.completed
```

Current assembly telemetry includes:

```text
context.included
context.omitted
context.recent_turns
```

The future target is:

```text
context.essential_items
context.retrieved_items
context.obsolete_items
context.sliding_window_turns
context.checkpoint_id
context.retrieval_count
context.compaction_count
usage.input_tokens
usage.output_tokens
latency.context_assembly_ms
latency.retrieval_ms
latency.compaction_ms
```

Telemetry must not contain prompts, complete responses, file contents, complete tool output, credentials, or secrets.

## 4. Approval checklist

- [ ] Short conversation works.
- [ ] Usage comes only from the provider.
- [ ] Missing usage remains unknown.
- [ ] The recent window limits the active request.
- [ ] The original transcript remains persisted.
- [ ] Essential decisions survive compaction.
- [ ] The task continues from the correct point after compaction.
- [ ] Older context can be recovered when retrieval is enabled.
- [ ] Large tool outputs do not dominate the active context indefinitely.
- [ ] Tool-call sequences remain valid.
- [ ] Session resume works.
- [ ] Context-limit recovery is finite and safe.
- [ ] Interruption does not destroy history.
- [ ] Telemetry is useful and privacy-safe.

## 5. Interpretation

- C1–C5 passing means the basic conversation, window, and compaction flows are stable.
- C6 passing demonstrates improvement for long coding tasks.
- C7 passing demonstrates end-to-end historical retrieval.
- C8 passing demonstrates transcript and active-context separation across restart.
- C9 passing confirms local token estimation is gone.
- C10–C12 passing demonstrates robustness against provider failures and malformed context.

A change is better only when it maintains task correctness while reducing unnecessary active context, repeated work, context-limit failures, or latency in long sessions. Passing unit tests alone is not sufficient evidence of improvement.
