import { defineTool, type Plugin } from "@cagent/sdk";

const register: Plugin = (ctx) => {
  ctx.registerTool(
    defineTool(
      "echo",
      "Repeats the provided text.",
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
