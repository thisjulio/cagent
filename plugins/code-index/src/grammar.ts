import path from "node:path";

export const fileGrammars: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".cpp": "cpp",
  ".hh": "cpp",
  ".hxx": "cpp",
  ".hpp": "cpp",
  ".mm": "cpp",
  ".css": "css",
  ".html": "html",
  ".json": "json",
  ".toml": "toml",
};

export function grammarFor(file: string, source: string): string | undefined {
  const extension = path.extname(file);
  if (extension !== ".h") return fileGrammars[extension];
  // A .h file is ambiguous. Prefer the C grammar for headers without C++ constructs.
  // Match syntax rather than the file's directory or repository name.
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  return /\b(?:namespace\s+[\w:]+\s*\{|template\s*<|class\s+\w+|using\s+\w+\s*=|std::|extern\s+"C\+\+")/.test(
    code,
  )
    ? "cpp"
    : "c";
}
