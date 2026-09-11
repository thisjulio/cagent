import type { Plugin } from "@cagent/sdk";
import { editFileTool } from "./edit-file";
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
  ctx.promptSection(
    "code-tools",
    "read_file antes de editar (registra o hash e detecta stale/reversão). edit_file aceita blocks (<< SEARCH >>/<< REPLACE >>) ou patch (*** Begin patch); 2ª falha pede read_file, 3ª é fatal. search (regex), list_files (glob), search_ast (AST com metavariáveis), write_file (cria/sobrescreve).",
  );
};

export default register;
