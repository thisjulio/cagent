import type { SkillCatalog, SkillRecord } from "./types";

const INSTRUCTIONS =
  "# Cagent development\n\n" +
  "You are helping extend cagent itself. Follow AGENTS.md, CONTEXT.md, and current ADRs\n" +
  "before changing code. Preserve the dependency direction:\n\n" +
  "  ui -> controller -> domain -> sdk\n\n" +
  "Prefer a new registered module over adding branches to an existing controller or loop.\n" +
  "Keep one responsibility per file, keep files under 500 lines, and test pure logic without\n" +
  "rendering.\n\n" +
  "## Creating a new skill\n\n" +
  "Skills teach cagent specialized workflows. Create them in .cagent/skills/<name>/SKILL.md\n" +
  "or .agents/skills/<name>/SKILL.md (project-local), or in the matching directory under\n" +
  "~/.cagent/skills/ or ~/.agents/skills/ to share them across projects.\n\n" +
  "### Interactive skill creation workflow\n\n" +
  "When the user wants to create a new skill, guide them through these steps interactively.\n" +
  "Ask questions, don't just generate files.\n\n" +
  "**Step 1: Understand the use case**\n\n" +
  "Ask the user:\n" +
  "- What repetitive task or workflow should this skill automate?\n" +
  "- Give me a concrete example of when you would invoke this skill.\n" +
  "- What input will the user provide? (arguments, file paths, etc.)\n" +
  "- What output should the user receive?\n\n" +
  "**Step 2: Define the trigger**\n\n" +
  "Help the user write a description that clearly states when to use the skill. The\n" +
  "description is how the model decides to apply the skill automatically. Include:\n" +
  "- What the skill does (one sentence)\n" +
  '- Trigger phrases: "Use when...", "Use for..."\n' +
  "- Specific keywords the user might say\n\n" +
  "Test: Could the model distinguish this skill from similar ones based on the description alone?\n\n" +
  "**Step 3: Draft the skill content**\n\n" +
  "Ask the user to walk you through the workflow step by step. Capture:\n" +
  "- Prerequisites and setup (what must be true before starting?)\n" +
  "- Each step in order, with specific commands or actions\n" +
  '- Decision points: "If X, do Y; otherwise do Z"\n' +
  "- Error handling: what to do when a step fails\n" +
  "- Success criteria: how does the user know it worked?\n\n" +
  "**Step 4: Write SKILL.md**\n\n" +
  "Create the file using this structure:\n\n" +
  "```markdown\n" +
  "---\n" +
  "name: skill-name\n" +
  "description: When and why to use this skill. Include trigger phrases.\n" +
  "---\n\n" +
  "# Skill Title\n\n" +
  "## When to use\n" +
  "- Trigger condition 1\n" +
  "- Trigger condition 2\n\n" +
  "## Instructions\n" +
  "Step-by-step workflow. Be specific and actionable.\n\n" +
  "### Phase 1: [Name]\n" +
  "1. Do this\n" +
  "2. Then that\n\n" +
  "### Phase 2: [Name]\n" +
  "1. ...\n\n" +
  "## Output format\n" +
  "Describe what the user should receive.\n\n" +
  "## Examples\n" +
  "Show a concrete example if helpful.\n\n" +
  "## Common mistakes\n" +
  "- What to avoid and why\n" +
  "```\n\n" +
  "**Step 5: Validate the skill**\n\n" +
  "After creating the skill, test it:\n" +
  '1. Ask cagent to use the skill by name: "Use the <skill-name> skill to..."\n' +
  "2. Verify the description triggers correctly with natural user phrasing\n" +
  "3. Check that all file references exist and are correct\n" +
  "4. Ensure instructions are complete enough for a fresh cagent session to follow\n" +
  '5. Ask: "Could someone who has never seen this workflow before follow these instructions?"\n\n' +
  "**Step 6: Iterate**\n\n" +
  "Based on the test, refine the skill. Common issues:\n" +
  "- Too vague: add specific commands, file paths, expected output\n" +
  "- Too long: move reference material to references/ subdirectory\n" +
  "- Wrong trigger: adjust description to be more specific\n" +
  "- Missing edge cases: add error handling sections\n\n" +
  "### Skill best practices\n\n" +
  "- Keep SKILL.md focused: maximum ~300 lines\n" +
  "- Put detailed references in a references/ subdirectory\n" +
  "- One skill = one job. If it does two things, split it.\n" +
  '- Be explicit about tools: name exact tools/functions to use (e.g., "use the tasks tool")\n' +
  "- Specify error handling: what to do when a step fails\n" +
  "- Include edge cases: missing input, ambiguous input, wrong format\n" +
  '- Use imperative mood: "Run this command" not "You should run this command"\n' +
  "- Test with the actual model: skills that work in theory often fail in practice\n\n" +
  "### Skill directory structure\n\n" +
  ".cagent/skills/\n" +
  "  skill-name/\n" +
  "    SKILL.md              # Required: instructions\n" +
  "    references/           # Optional: supporting documents\n" +
  "      template.md\n" +
  "      examples.md\n" +
  "    scripts/              # Optional: helper scripts (user must approve execution)\n\n" +
  "### When to use a skill vs. other mechanisms\n\n" +
  "- **Skill**: reusable workflow/pattern the user invokes repeatedly\n" +
  "- **Slash command**: single action with immediate effect\n" +
  "- **Plugin tool**: capability that needs external API access or complex logic\n" +
  "- **AGENTS.md rule**: permanent project convention that always applies\n\n" +
  "If the instruction applies to every task in the project, put it in AGENTS.md, not a skill.\n\n" +
  "## Creating a plugin\n\n" +
  "Put a plugin in plugins/<name>/, build it on @cagent/sdk, and export its registration\n" +
  "function from src/index.ts. Register tools or providers through PluginContext; do not\n" +
  "import plugins from core. Add tests and update configuration only when necessary.\n\n" +
  "Do not bypass the permission pipeline, execute untrusted skill scripts automatically, or\n" +
  "edit app.tsx for new functionality. Explain architectural changes and add an ADR when\n" +
  "changing an active decision.\n\n" +
  "## Repository language\n\n" +
  "All repository artifacts must be written in English: source code, identifiers, comments,\n" +
  "tests, documentation, configuration, skills, and generated files committed to the\n" +
  "repository. User-facing replies may follow the user's language, but files saved in the\n" +
  "repository must remain in English. Translate touched non-English material unless it is an\n" +
  "intentional fixture or external content.";

export function addBuiltinSkills(catalog: SkillCatalog): SkillCatalog {
  const record: SkillRecord = {
    metadata: {
      name: "cagent-development",
      description:
        "Create and maintain cagent skills and plugins while following its architecture and development rules.",
    },
    directory: "builtin:cagent-development",
    instructionFile: "builtin:cagent-development/SKILL.md",
    content: INSTRUCTIONS,
  };
  const byName = new Map(catalog.byName);
  byName.set(record.metadata.name, record);
  return { skills: [...catalog.skills, record], byName };
}
