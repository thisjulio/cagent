import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { composeSkill } from "../src/skills/composition";
import {
  createReadSkillTool,
  refreshReadSkillTool,
} from "../src/skills/read-tool";
import { renderSkillCatalog } from "../src/skills/catalog";
import { discoverSkills } from "../src/skills/discovery";
import { listSkillResources, readSkillResource } from "../src/skills/resources";
import type { SkillCatalog } from "../src/skills/types";
import { applySkillArguments } from "../src/skills/arguments";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cagent-skills-"));
  temporaryDirectories.push(directory);
  return directory;
}

function catalog(): SkillCatalog {
  const grilling = {
    metadata: { name: "grilling", description: "Ask design questions." },
    directory: "/tmp/grilling",
    instructionFile: "/tmp/grilling/SKILL.md",
    content: "Ask questions about $ARGUMENTS.",
  };
  const manual = {
    metadata: {
      name: "manual",
      description: "Manual workflow.",
      disableModelInvocation: true,
    },
    directory: "/tmp/manual",
    instructionFile: "/tmp/manual/SKILL.md",
    content: "Manual only.",
  };
  return {
    skills: [grilling, manual],
    byName: new Map([
      ["grilling", grilling],
      ["manual", manual],
    ]),
  };
}

describe("skills", () => {
  it("explains the exact name and resource contract in the catalog", () => {
    const text = renderSkillCatalog(catalog());
    expect(text).toContain('exact skill name as the "name" argument');
    expect(text).toContain('omit "resource" to load its SKILL.md');
    expect(text).toContain("exact relative path from the skill_files list");
    expect(text).not.toContain("- manual:");
  });

  it("constrains tool calls to model-invocable names and refreshes after reload", () => {
    const skills = catalog();
    const tool = createReadSkillTool(skills);
    const properties = tool.parameters.properties as Record<
      string,
      { enum?: string[] }
    >;
    expect(properties.name.enum).toEqual(["grilling"]);

    const nextSkill = {
      metadata: { name: "review", description: "Review code." },
      directory: "/tmp/review",
      instructionFile: "/tmp/review/SKILL.md",
    };
    skills.byName.set("review", nextSkill);
    refreshReadSkillTool(tool, skills);
    expect(properties.name.enum).toEqual(["grilling", "review"]);
  });

  it("discovers nested standard skills even when explicit roots are configured", async () => {
    const cwd = await temporaryDirectory();
    const skillDirectory = path.join(cwd, ".agents/skills/team/review");
    await fs.mkdir(skillDirectory, { recursive: true });
    await fs.writeFile(
      path.join(skillDirectory, "SKILL.md"),
      "---\nname: review\ndescription: Review changes.\n---\nInstructions.",
    );

    const skills = discoverSkills(cwd, ["custom/skills"]);
    expect(skills.byName.get("review")?.directory).toBe(skillDirectory);
  });

  it("lists and reads relative skill resources", async () => {
    const directory = await temporaryDirectory();
    await fs.mkdir(path.join(directory, "references"));
    await fs.writeFile(path.join(directory, "SKILL.md"), "instructions");
    await fs.writeFile(path.join(directory, "references/guide.md"), "guide");

    await expect(listSkillResources(directory)).resolves.toEqual([
      "references/guide.md",
    ]);
    await expect(
      readSkillResource(directory, "references/guide.md"),
    ).resolves.toBe("guide");
  });

  it("shows available resource paths when loading a skill", async () => {
    const directory = await temporaryDirectory();
    await fs.mkdir(path.join(directory, "references"));
    await fs.writeFile(
      path.join(directory, "SKILL.md"),
      "Read references/guide.md.",
    );
    await fs.writeFile(
      path.join(directory, "references/guide.md"),
      "Detailed guide.",
    );
    const skill = {
      metadata: { name: "guided", description: "Guided skill." },
      directory,
      instructionFile: path.join(directory, "SKILL.md"),
    };
    const skills: SkillCatalog = {
      skills: [skill],
      byName: new Map([[skill.metadata.name, skill]]),
    };
    const tool = createReadSkillTool(skills);

    const main = await tool.execute({ name: "guided" });
    expect(main.output).toContain("<file>references/guide.md</file>");
    const resource = await tool.execute({
      name: "guided",
      resource: "references/guide.md",
    });
    expect(resource.output).toContain("Detailed guide.");
  });

  it("rejects traversal and symlinks escaping a skill directory", async () => {
    const directory = await temporaryDirectory();
    const outside = path.join(await temporaryDirectory(), "secret.md");
    await fs.writeFile(outside, "secret");
    await fs.symlink(outside, path.join(directory, "secret.md"));

    await expect(
      readSkillResource(directory, "../secret.md"),
    ).resolves.toBeUndefined();
    await expect(
      readSkillResource(directory, "secret.md"),
    ).resolves.toBeUndefined();
  });

  it("renders explicit arguments into composed instructions", async () => {
    await expect(
      composeSkill(catalog(), "grilling", { arguments: "clipboard support" }),
    ).resolves.toContain("clipboard support");
  });

  it("expands arguments without composing another skill", () => {
    expect(applySkillArguments("Task: $ARGUMENTS", "clipboard support")).toBe(
      "Task: clipboard support",
    );
  });

  it("does not expose manual-only skills to model invocation", async () => {
    const result = await createReadSkillTool(catalog()).execute({
      name: "manual",
    });
    expect(result).toEqual({
      output:
        "skill is user-invocable only: manual. Ask the user to invoke it with /skill manual.",
      isError: true,
    });
  });

  it("returns corrective guidance for missing or invalid skill names", async () => {
    const result = await createReadSkillTool(catalog()).execute({
      resource: "full",
    });
    expect(result.output).toContain("(missing name)");
    expect(result.output).toContain("Available skills: grilling");
    expect(result.output).not.toContain("manual");
    expect(result.isError).toBe(true);
  });

  it("returns the full skill payload in the native tool envelope", async () => {
    const result = await createReadSkillTool(catalog()).execute({
      name: "grilling",
    });
    expect(result.output).toContain('<skill_content name="grilling">');
    expect(result.output).toContain(
      "Base directory for this skill: /tmp/grilling",
    );
    expect(result.output).toContain("Ask questions about $ARGUMENTS.");
  });
});
