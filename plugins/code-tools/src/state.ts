import fs from "node:fs";
import path from "node:path";
import { LruMap } from "./lru-map";

// root() resolves the workspace per call - cwd can change between loads (tests).
export function root(): string {
  return path.resolve(process.cwd());
}

// ponytail: djb2 fingerprint, not a security hash.
export function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// ponytail: LRU Maps with 1000-entry cap prevent unbounded growth in long sessions.
const reads = new LruMap<string, { hash: string; mtimeMs: number }>(1000);
const failures = new LruMap<string, number>(1000);
const lastWrite = new LruMap<string, string>(1000);
const lineAnchor = new LruMap<string, true>(1000);

export function recordRead(absPath: string): void {
  const buf = fs.readFileSync(absPath);
  reads.set(absPath, {
    hash: hash(buf.toString("utf8")),
    mtimeMs: fs.statSync(absPath).mtimeMs,
  });
  lineAnchor.set(absPath, true);
}

export function getRead(
  absPath: string,
): { hash: string; mtimeMs: number } | undefined {
  return reads.get(absPath);
}

export function fileHash(absPath: string): string {
  return hash(fs.readFileSync(absPath).toString("utf8"));
}

export function bumpFailure(absPath: string, seed: string): number {
  const k = absPath + "\u0000" + hash(seed);
  const n = (failures.get(k) ?? 0) + 1;
  failures.set(k, n);
  return n;
}

export function clearFailures(absPath: string): void {
  for (const k of [...failures.keys()])
    if (k.startsWith(absPath + "\u0000")) failures.delete(k);
}

export function recordWrite(absPath: string, content: string): void {
  lastWrite.set(absPath, hash(content));
  lineAnchor.delete(absPath);
}

export function hasLineAnchor(absPath: string): boolean {
  return lineAnchor.has(absPath);
}

// ponytail: reverted = hash differs between the last write and the next read.
export function wasReverted(absPath: string): boolean {
  const prev = lastWrite.get(absPath);
  return prev !== undefined && fileHash(absPath) !== prev;
}
