import type { Plugin } from "@cagent/sdk";
import { editFileTool } from "./edit-file";
import { replaceLinesTool } from "./replace-lines";
import { globTool } from "./glob";
import { readTool } from "./read";
import { searchAstTool } from "./search-ast";
import { searchTool } from "./search";
import { writeFileTool } from "./write-file";

const register: Plugin = (ctx) => {
  ctx.registerTool(readTool(ctx));
  ctx.registerTool(searchTool(ctx));
  ctx.registerTool(globTool(ctx));
  ctx.registerTool(searchAstTool(ctx));
  ctx.registerTool(writeFileTool(ctx));
  ctx.registerTool(editFileTool(ctx));
  ctx.registerTool(replaceLinesTool(ctx));
  ctx.promptSection(
    "code-tools",
    "Use read_file before editing (records the hash and detects stale/reverted files). read_file always returns a bounded line segment; use its nextOffset when hasMore=true. edit_file accepts blocks (<< SEARCH >>/<< REPLACE >>) or a patch (*** Begin patch); the second failure asks for read_file and the third is fatal. replace_lines replaces ranges only when old_content exactly matches the lines from read_file. search (regex), list_files (glob), search_ast (AST with metavariables), write_file (creates/overwrites).",
  );
};

export default register;
