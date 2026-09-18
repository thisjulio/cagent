// Mock MCP server for testing. Reads JSON-RPC from stdin, writes to stdout.
// Implements: initialize, initialized, tools/list, tools/call

function respond(id: number | string, result: unknown) {
  const response = { jsonrpc: "2.0", id, result };
  process.stdout.write(JSON.stringify(response) + "\n");
}

function handleError(id: number | string, message: string) {
  const response = {
    jsonrpc: "2.0",
    id,
    error: { code: -32603, message },
  };
  process.stdout.write(JSON.stringify(response) + "\n");
}

// Read stdin line by line
const input = process.stdin;
input.setEncoding("utf-8");

let buffer = "";
input.on("data", (chunk: string) => {
  buffer += chunk;
  let idx = 0;
  while (idx < buffer.length) {
    const newline = buffer.indexOf("\n", idx);
    if (newline === -1) break;
    const line = buffer.substring(idx, newline).trim();
    idx = newline + 1;
    if (!line) continue;

    try {
      const message = JSON.parse(line);
      handleRequest(message);
    } catch {
      // Ignore malformed
    }
  }
  buffer = buffer.substring(idx);
});

function handleRequest(message: Record<string, unknown>) {
  const id = message.id;
  const method = message.method as string;
  const params = message.params as Record<string, unknown>;

  switch (method) {
    case "initialize":
      respond(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "mock-server", version: "1.0.0" },
      });
      break;

    case "initialized":
      // Notification, no response
      break;

    case "tools/list":
      respond(id, {
        tools: [
          {
            name: "add",
            description: "Add two numbers",
            inputSchema: {
              type: "object",
              properties: {
                a: { type: "number" },
                b: { type: "number" },
              },
              required: ["a", "b"],
            },
          },
          {
            name: "echo",
            description: "Echo back the input",
            inputSchema: {
              type: "object",
              properties: {
                message: { type: "string" },
              },
              required: ["message"],
            },
          },
        ],
      });
      break;

    case "tools/call":
      const toolName = params.name as string;
      const args = params.arguments as Record<string, unknown>;

      if (toolName === "add") {
        const result = (args.a as number) + (args.b as number);
        respond(id, {
          content: [{ type: "text", text: String(result) }],
        });
      } else if (toolName === "echo") {
        respond(id, {
          content: [{ type: "text", text: args.message as string }],
        });
      } else {
        handleError(id, `Unknown tool: ${toolName}`);
      }
      break;

    default:
      handleError(id, `Unknown method: ${method}`);
  }
}
