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
    "Use read_file immediately before every edit (records the hash and detects stale/reverted files); a formatter or any write invalidates earlier line numbers. read_file always returns a bounded line segment; use its nextOffset when hasMore=true. edit_file accepts blocks (<< SEARCH >>/<< REPLACE >>) or a patch (*** Begin Patch); the second failure asks for read_file and the third is fatal. replace_lines requires line numbers and old_content copied from the same, most recent read_file output; call read_file again after every successful edit. search (regex; use targets for multiple files/directories), list_files (glob), search_ast (AST with metavariables), write_file (creates/overwrites).",
  );
};

export default register;
