export function applySkillArguments(content: string, args: string): string {
  return content.replace(/\$ARGUMENTS\b/g, args);
}
