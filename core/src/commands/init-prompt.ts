export type ProjectDocs = {
  agentsMd?: string;
  otherInstructions: string[];
  references: string[];
};

export type InitPromptOptions = {
  docs: ProjectDocs;
  focus: string;
  readOnly: boolean;
};

const INVESTIGATE = `## Phase 1 - Investigate (read-only)
Use read/search/glob/search_ast (and lsp when available) before bash. Bash is for git history and listing only.
1. Inspect manifests, toolchain, scripts, lint/format configuration, and workspace structure.
2. Verify real commands in manifests and CI workflows. CI is the source of truth for what "passing" means.
3. Map top-level directories, packages, entry points, test locations, and how to run one test.
4. Identify architecture and dependency direction, registries, architecture tests, ADRs, and glossary documents.
5. Find non-obvious conventions, such as naming, file limits, error handling, forbidden imports, and commit style (git log --oneline -30).
6. Record traps: generated directories, required environment variables, and follow-up steps after changes.
For large monorepos, you may delegate one package per @general subagent and merge the findings.`;

const WRITE_RULES = `## Phase 2 - Write
Target the root AGENTS.md. Include only useful, verified material:
- A concise project overview and stack.
- Exact, copy-pasteable install, build, test, single-test, lint, typecheck, and run commands.
- Layout, architecture/dependency rules, conventions, gotchas, and CI definition of done.

Rules:
- Every command and path must have been observed in this session. Never invent scripts or paths.
- Prefer specific, verifiable rules; omit generic advice.
- Describe structure rather than listing every file. Link to longer docs.
- Keep the file to about 150 lines or fewer.
- Put directory-specific rules in .cagent/rules/<name>.md with paths: frontmatter, not nested AGENTS.md files. cagent loads AGENTS.md only from the working directory and its ancestors.
- Write in the language of existing project documentation; default to English.`;

function modeSection(docs: ProjectDocs): string {
  if (!docs.agentsMd)
    return "## Mode: create\nNo root AGENTS.md exists. Create it at the repository root.";
  return `## Mode: update
${docs.agentsMd} already exists. Treat its current contents as the baseline:
- Read it fully first. Preserve its structure, voice, and sections that remain accurate.
- Correct facts contradicted by the current repository and add only important omissions.
- Remove a rule only with evidence that it is obsolete; list every removal in the final summary.
- Preserve content owned by other tools (for example graphify blocks) verbatim.
- Edit in place with minimal changes; do not rewrite the whole file.`;
}

function sourcesSection(docs: ProjectDocs): string {
  const lines: string[] = [];
  if (docs.otherInstructions.length)
    lines.push(
      `Existing agent instructions to reconcile (incorporate useful rules without duplication): ${docs.otherInstructions.join(", ")}`,
    );
  if (docs.references.length)
    lines.push(
      `Reference documents to inspect and link: ${docs.references.join(", ")}`,
    );
  return lines.length ? `## Known sources\n${lines.join("\n")}` : "";
}

export function buildInitPrompt({
  docs,
  focus,
  readOnly,
}: InitPromptOptions): string {
  const finish = readOnly
    ? "Read-only mode is active: do NOT write files. Print the complete proposed AGENTS.md (or a unified diff in update mode) in your answer."
    : "Write the file with the editing tools, then read it back to verify.";
  return [
    "# /init - create or update AGENTS.md from this repository's current state",
    "AGENTS.md is project documentation for future coding sessions. Make it useful and accurate, not a generic checklist.",
    "Use the tasks tool to track investigation, drafting, writing, and verification.",
    modeSection(docs),
    sourcesSection(docs),
    focus ? `## User focus\nGive extra attention to: ${focus}` : "",
    INVESTIGATE,
    WRITE_RULES,
    `## Phase 3 - Finish\n${finish}\nEnd with a short summary of additions, changes, removals (and evidence for each removal), and anything you could not verify.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
