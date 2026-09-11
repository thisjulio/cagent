import { defineTool, type PluginContext, type ToolArgs } from "@cagent/sdk";
import { atomicWrite } from "./atomic-write";
import { errorText } from "./errors";
import { guardPath } from "./guards";
import { recordRead, recordWrite } from "./state";

export function writeFileTool(ctx: PluginContext) {
  return defineTool(
    "write_file",
    "Cria ou sobrescreve um arquivo com o conteúdo dado (escrita atômica).",
    {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo (relativo ao workspace ou absoluto)" },
        content: { type: "string", description: "Conteúdo completo do arquivo" },
      },
      required: ["path", "content"],
    },
    async (args: ToolArgs) => {
      const input = String(args.path ?? "");
      const content = String(args.content ?? "");
      let abs: string;
      try {
        abs = guardPath(input);
      } catch (e) {
        return { output: errorText("E_PATH", `${input}: ${e instanceof Error ? e.message : String(e)}`), isError: true };
      }
      try {
        atomicWrite(abs, content);
      } catch (e) {
        return { output: errorText("E_WRITE", `${input}: ${e instanceof Error ? e.message : String(e)}`), isError: true };
      }
      recordRead(abs);
      recordWrite(abs, content);
      ctx.emit("code-tools/write", { path: abs });
      return { output: `gravado ${abs}` };
    },
  );
}
