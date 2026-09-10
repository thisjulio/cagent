import { defineTool, type Plugin } from "@cagent/sdk";

const register: Plugin = (ctx) => {
  ctx.registerTool(
    defineTool(
      "echo",
      "Repete o texto informado.",
      {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
      async (args) => ({ output: String(args.text) }),
    ),
  );
};

export default register;
