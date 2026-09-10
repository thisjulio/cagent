---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round.

**You MUST ask every frontier question through the `question` tool** — one `question` call per round, carrying every frontier question as a `questions` entry. Never write the questions as plain markdown in the chat; the `question` tool is the only way the user answers them. Then wait for the answers before the next round.

Build each `questions` entry like this:

- `header` — the question title, truncated to 30 characters max.
- `question` — the full question body (may be multiple paragraphs and may list the choices).
- `options` — one option per reasonable answer, **your recommended answer first** with "(Recommended)" appended to its `label`, then the remaining alternatives. Keep each `label` short (1–5 words) and give each a one-line `description`.
- `multiple` — `false` unless the decision genuinely permits several answers at once.

Do not add an "Other"/catch-all option: the `question` tool appends a "Type your own answer" option automatically.

Each round the user answers reshapes the tree: read the returned labels (one per question) as the settled decisions, push the frontier outward, and unblock questions that depended on them. Recompute the frontier and ask the next round the same way. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
