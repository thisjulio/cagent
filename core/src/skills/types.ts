export interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  allowedTools?: string[];
}

export interface SkillRecord {
  metadata: SkillMetadata;
  directory: string;
  instructionFile: string;
  content?: string;
}

export interface SkillCatalog {
  skills: SkillRecord[];
  byName: Map<string, SkillRecord>;
}