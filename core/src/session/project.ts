import path from "node:path";
import { getGitInfo } from "../gitinfo";
import type { SessionRecord } from "./types";

export type ProjectMeta = {
  cwd: string;
  branch?: string;
};

export function captureProjectMeta(cwd: string = process.cwd()): ProjectMeta {
  const info = getGitInfo(cwd);
  return {
    cwd: path.resolve(cwd),
    branch: info.branch ?? undefined,
  };
}

export function projectMetaRecord(meta: ProjectMeta): SessionRecord {
  return {
    ts: Date.now(),
    type: "meta",
    payload: {
      kind: "project",
      cwd: meta.cwd,
      ...(meta.branch ? { branch: meta.branch } : {}),
    },
  };
}
