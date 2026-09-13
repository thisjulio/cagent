import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { MemoryEntry } from "./storage";

export type SqliteStore = {
  db: Database.Database;
  close(): void;
  entries(): MemoryEntry[];
  replace(entry: MemoryEntry): void;
  remove(id: string): void;
  lexical(query: string, limit?: number): MemoryEntry[];
  vector(query: number[], model: string, limit?: number): MemoryEntry[];
};

export function openStore(file: string): SqliteStore {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM schema_version);
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY, content TEXT NOT NULL, scope TEXT NOT NULL, kind TEXT NOT NULL,
      status TEXT NOT NULL, confidence REAL NOT NULL, source TEXT NOT NULL, project TEXT,
      conflict INTEGER NOT NULL DEFAULT 0, supersedes TEXT, normalized_text TEXT, embedding_model TEXT,
      embedding_dimension INTEGER, embedding TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(id UNINDEXED, content);`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
    INSERT INTO entries_fts(id, content) VALUES (new.id, new.content);
  END;
  CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE OF content ON entries BEGIN
    DELETE FROM entries_fts WHERE id = old.id;
    INSERT INTO entries_fts(id, content) VALUES (new.id, new.content);
  END;
  CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
    DELETE FROM entries_fts WHERE id = old.id;
  END;`);
  return wrap(db);
}

function cosine(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return -1;
  let dot = 0; let leftNorm = 0; let rightNorm = 0;
  for (let index = 0; index < left.length; index++) { dot += left[index] * right[index]; leftNorm += left[index] ** 2; rightNorm += right[index] ** 2; }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : -1;
}

function wrap(db: Database.Database): SqliteStore {
  return {
    db,
    close: () => db.close(),
    entries: () => (db.prepare("SELECT * FROM entries ORDER BY created_at").all() as Record<string, unknown>[]).map(fromRow),
    replace: (entry) => {
      db.prepare(`INSERT INTO entries (id,content,scope,kind,status,confidence,source,project,conflict,supersedes,normalized_text,embedding_model,embedding_dimension,embedding,created_at,updated_at)
        VALUES (@id,@content,@scope,@kind,@status,@confidence,@source,@project,@conflict,@supersedes,@normalizedText,@embeddingModel,@embeddingDimension,@embedding,@createdAt,@updatedAt)
        ON CONFLICT(id) DO UPDATE SET content=@content,scope=@scope,kind=@kind,status=@status,confidence=@confidence,source=@source,project=@project,conflict=@conflict,supersedes=@supersedes,normalized_text=@normalizedText,embedding_model=@embeddingModel,embedding_dimension=@embeddingDimension,embedding=@embedding,updated_at=@updatedAt`).run({ ...entry, conflict: entry.conflict ? 1 : 0, supersedes: entry.supersedes ?? null, project: entry.project ?? null, normalizedText: entry.normalizedText ?? entry.content.toLocaleLowerCase(), embeddingModel: entry.embeddingModel ?? null, embeddingDimension: entry.embeddingDimension ?? null, embedding: entry.embedding ? JSON.stringify(entry.embedding) : null });
    },
    remove: (id) => db.prepare("DELETE FROM entries WHERE id = ?").run(id),
    lexical: (query, limit = 5) => (db.prepare(`SELECT e.* FROM entries_fts f JOIN entries e ON e.id = f.id
      WHERE entries_fts MATCH ? AND e.status = 'approved' ORDER BY bm25(entries_fts) LIMIT ?`).all(query, limit) as Record<string, unknown>[]).map(fromRow),
    vector: (query, model, limit = 5) => db.prepare("SELECT * FROM entries WHERE status = 'approved' AND embedding_model = ? AND embedding_dimension = ?").all(model, query.length).map((row) => ({ row, score: cosine(query, JSON.parse(String((row as Record<string, unknown>).embedding ?? "[]"))) })).sort((a, b) => b.score - a.score).slice(0, limit).map((item) => fromRow(item.row as Record<string, unknown>)),
  };
}

function fromRow(row: Record<string, unknown>): MemoryEntry {
  return { id: String(row.id), content: String(row.content), scope: row.scope as MemoryEntry["scope"], kind: row.kind as MemoryEntry["kind"], status: row.status as MemoryEntry["status"], confidence: Number(row.confidence), source: String(row.source), project: row.project ? String(row.project) : undefined, conflict: row.conflict === 1, supersedes: row.supersedes ? String(row.supersedes) : undefined, normalizedText: row.normalized_text ? String(row.normalized_text) : undefined, embeddingModel: row.embedding_model ? String(row.embedding_model) : undefined, embeddingDimension: row.embedding_dimension ? Number(row.embedding_dimension) : undefined, embedding: row.embedding ? JSON.parse(String(row.embedding)) : undefined, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
