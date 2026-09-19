---
name: review-loop
description: Iterative code review loop that reviews, analyzes, fixes, and re-reviews until no findings remain. Use when the user wants continuous improvement, iterative review, "keep fixing until clean", or mentions looping through code review. Encourages subagent delegation for parallel work.
---

# Review Loop

Continuously cycle through code review, analysis, and fixes until the codebase is clean. Delegates work to subagents for parallelism.

## When to use
- User wants iterative code improvement until no issues remain
- User says "keep fixing until clean", "review loop", "keep reviewing"
- Pre-release cleanup where all findings must be resolved
- User explicitly wants to stress-test code quality

## Instructions

### Phase 1: Initial Setup

1. Use the `tasks` tool to create a master checklist:
   - "Run initial code review"
   - "Analyze findings and prioritize"
   - "Fix findings"
   - "Re-run review to verify"
   - "Repeat until clean"

2. Determine review scope with the user if not specified:
   - Entire codebase?
   - Specific branch/commit range?
   - Specific files or directories?

3. Set a maximum iteration limit (default: 5) to prevent infinite loops. Track iterations.

### Phase 2: Review (Delegate to Subagent)

1. Delegate the code review to a subagent using the `subagent` tool:
   ```
   name: "architecture-reviewer" or "general"
   task: "Review [scope] for bugs, code smells, security issues, performance problems, and style violations. Return a structured list of findings with severity (critical/high/medium/low), file, line, description, and suggested fix."
   ```

2. Capture the review findings. If no findings, proceed to Phase 5 (completion).

### Phase 3: Analyze and Prioritize

1. Categorize findings by severity:
   - **Critical**: Must fix immediately (bugs, security, crashes)
   - **High**: Should fix in this iteration (logic errors, performance)
   - **Medium**: Fix if time permits (code smells, minor improvements)
   - **Low**: Defer or note (style preferences, micro-optimizations)

2. Group findings by file to minimize context switching.

3. Create/update the task list with specific fix tasks for each finding group.

### Phase 4: Fix (Delegate to Subagents)

1. For each priority group, delegate fixes to subagents:
   - Critical findings: Fix immediately, one subagent per file
   - High findings: Fix in parallel where files don't conflict
   - Medium/Low: Batch together or defer

2. Use the `subagent` tool for each independent fix:
   ```
   name: "general"
   task: "Fix [specific finding] in [file]. [Finding details]. Verify the fix is correct."
   ```

3. After fixes, run relevant tests: `bun test` or the project's test command.

4. If tests fail, fix test failures before continuing the loop.

### Phase 5: Verify and Loop

1. Increment the iteration counter.

2. Check exit conditions:
   - If iteration limit reached: Report remaining findings and stop
   - If no critical/high findings remain: Stop and report success
   - Otherwise: Return to Phase 2 (Review)

3. After each loop, provide a brief status update to the user:
   - Iteration number
   - Findings found → fixed → remaining
   - Tests passing/failing

### Phase 6: Final Report

When the loop exits, provide:
- Total iterations completed
- Total findings found and fixed
- Any remaining findings (with severity)
- Test status
- Summary of changes made

## Output format

After each iteration:
```
Iteration [N]:
- Reviewed: [scope]
- Findings: [X] critical, [Y] high, [Z] medium, [W] low
- Fixed: [count]
- Remaining: [count]
- Tests: [pass/fail]
```

Final report includes cumulative totals and any deferred findings.

## Examples

User: "Run a review loop on the auth module until it's clean"
→ Review auth/ directory, fix findings, repeat until no critical/high issues.

User: "Keep reviewing and fixing until there are no more bugs"
→ Full codebase review loop, max 5 iterations.

## Common mistakes
- Not setting an iteration limit (infinite loop risk)
- Fixing low-priority style issues before critical bugs
- Not running tests after fixes
- Trying to fix everything in one subagent call (parallelize by file)
- Not reporting progress between iterations
