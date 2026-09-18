import type { SkillCatalog, SkillRecord } from "./types";

const INSTRUCTIONS = `# Cagent development

You are helping extend cagent itself. Follow AGENTS.md, CONTEXT.md, and current ADRs
before changing code. Preserve the dependency direction:

  ui -> controller -> domain -> sdk

Prefer a new registered module over adding branches to an existing controller or loop.
Keep one responsibility per file, keep files under 250 lines, and test pure logic without
rendering. Run bun test and graphify update . before finishing.

## Creating a new skill

Create .cagent/skills/<skill-name>/SKILL.md. Use lowercase kebab-case for the directory
and the YAML name. Keep the description specific enough for the model to recognize when
the skill applies. Put detailed material in references/ and keep SKILL.md focused.

## Creating a plugin

Put a plugin in plugins/<name>/, build it on @cagent/sdk, and export its registration
function from src/index.ts. Register tools or providers through PluginContext; do not
import plugins from core. Add tests and update configuration only when necessary.

Do not bypass the permission pipeline, execute untrusted skill scripts automatically, or
edit app.tsx for new functionality. Explain architectural changes and add an ADR when
changing an active decision.

## Repository language

All repository artifacts must be written in English: source code, identifiers, comments,
tests, documentation, configuration, skills, and generated files committed to the
repository. User-facing replies may follow the user's language, but files saved in the
repository must remain in English. Translate touched non-English material unless it is an
intentional fixture or external content.`;

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
