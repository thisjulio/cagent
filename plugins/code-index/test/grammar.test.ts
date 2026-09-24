import { expect, test } from "bun:test";
import { grammarFor } from "../src/grammar";
import { parseFile } from "../src/tags";

test("indexes named JS private class fields and methods without exposing locals", async () => {
  const tags = await parseFile(
    "benchmarker.js",
    "class Benchmarker {\n #suites = [];\n async #runScenario() { const noise = 1; }\n}",
    "javascript",
  );
  expect(tags.find((tag) => tag.name === "suites")).toMatchObject({
    kind: "m",
    scope: ["Benchmarker"],
  });
  expect(tags.find((tag) => tag.name === "runScenario")).toMatchObject({
    kind: "m",
    scope: ["Benchmarker"],
  });
  expect(tags.find((tag) => tag.name === "noise")?.isLocal).toBe(true);
});

test("indexes C++ template specializations, typedefs, and function declarations", async () => {
  const tags = await parseFile(
    "format.hpp",
    "namespace fmt {\ntemplate <> struct formatter<int> { int value; void format(); };\ntypedef int old_type;\nint format(int input);\ntemplate <> auto digits10<int>() -> int { return 1; }\n}",
    "cpp",
  );
  expect(tags.find((tag) => tag.name === "formatter")).toMatchObject({
    kind: "s",
    scope: ["fmt"],
  });
  expect(tags.find((tag) => tag.name === "old_type")?.kind).toBe("t");
  expect(
    tags.find((tag) => tag.name === "format" && tag.line === 4)?.kind,
  ).toBe("f");
  expect(tags.find((tag) => tag.name === "digits10")?.kind).toBe("f");
});

test("selects C++ grammar for C++ headers and C grammar for C headers", () => {
  expect(
    grammarFor("format.h", "// docs\nnamespace fmt { class Buffer {}; }"),
  ).toBe("cpp");
  expect(
    grammarFor(
      "fmt-c.h",
      "/* namespace ignored */\ntypedef struct Buffer Buffer;",
    ),
  ).toBe("c");
});

test("C and C++ headers retain syntax-specific definitions", async () => {
  const cpp =
    "namespace fmt { template <class T> class Buffer { void run(); }; }";
  const c = "typedef struct Buffer { int size; } Buffer;";
  expect(
    (
      await parseFile("include/fmt/format.h", cpp, grammarFor("format.h", cpp))
    ).map((tag) => tag.name),
  ).toEqual(expect.arrayContaining(["fmt", "Buffer", "run"]));
  expect(
    (await parseFile("include/buffer.h", c, grammarFor("buffer.h", c))).map(
      (tag) => tag.name,
    ),
  ).toContain("Buffer");
});

test("indexes individual CSS selectors and Python assignments", async () => {
  const css = await parseFile(
    "theme.css",
    ".one,\n.two { color: red; }",
    "css",
  );
  expect(css.map((tag) => tag.name)).toEqual([".one", ".two"]);

  const python = await parseFile(
    "release.py",
    "VERSION = '1'\ndef release():\n    branch = 'main'\n",
    "python",
  );
  expect(python.find((tag) => tag.name === "VERSION")).toMatchObject({
    kind: "v",
    scope: [],
  });
  expect(python.find((tag) => tag.name === "branch")).toMatchObject({
    kind: "v",
    scope: ["release"],
    isLocal: true,
  });
});

test("indexes TypeScript declaration-file function signatures", async () => {
  const tags = await parseFile(
    "index.d.ts",
    "export function limitFunction<T>(value: T): T;",
    "typescript",
  );
  expect(tags).toContainEqual(
    expect.objectContaining({ name: "limitFunction", kind: "f", line: 1 }),
  );
});
