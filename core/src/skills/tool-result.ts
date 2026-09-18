export function formatSkillToolOutput(
  name: string,
  directory: string,
  content: string,
  files: string[] = [],
): string {
  return [
    `<skill_content name="${name}">`,
    `# Skill: ${name}`,
    "",
    content.trim(),
    "",
    `Base directory for this skill: ${directory}`,
    "Relative paths in this skill are relative to this base directory.",
    "Note: file list is sampled.",
    "",
    "<skill_files>",
    ...files.map((file) => `<file>${file}</file>`),
    "</skill_files>",
    "</skill_content>",
  ].join("\n");
}
