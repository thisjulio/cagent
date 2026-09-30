import { expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildIndex } from "../src/indexer";

test("honors nested gitignore precedence, anchoring, negation and excluded parents without Git", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-map-ignore-"));
  try {
    const files = [
      "root.ts",
      "skip.ts",
      "keep.ts",
      "blocked/keep.ts",
      "src/root.ts",
      "src/skip.ts",
      "src/keep.ts",
      "src/local.ts",
      "other/local.ts",
    ];
    for (const file of files) {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await fs.writeFile(path.join(root, file), "export function example() {}");
    }
    await fs.writeFile(
      path.join(root, ".gitignore"),
      "/root.ts\nskip.ts\nkeep.ts\n!keep.ts\nblocked/\n!blocked/keep.ts\n",
    );
    await fs.writeFile(
      path.join(root, "src", ".gitignore"),
      "!skip.ts\nkeep.ts\n/local.ts\n",
    );
    const options = {
      root,
      cacheDirectory: path.join(root, ".cache"),
      warn: () => {},
    };
    expect((await buildIndex(options)).map((file) => file.file)).toEqual([
      "keep.ts",
      "other/local.ts",
      "src/root.ts",
      "src/skip.ts",
    ]);
    await fs.writeFile(
      path.join(root, "src", ".gitignore"),
      "!skip.ts\n!keep.ts\n/local.ts\n",
    );
    expect((await buildIndex(options)).map((file) => file.file)).toContain(
      "src/keep.ts",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
