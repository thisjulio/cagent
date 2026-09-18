import { describe, expect, it } from "bun:test";
import { McpClient } from "../src/client.ts";
import { StdioTransport } from "../src/transport-stdio.ts";
import path from "node:path";

const MOCK_SERVER = path.join(import.meta.dir, "../src/mock-server.ts");

describe("MCP client", () => {
  it("connects to mock server and lists tools", async () => {
    const transport = new StdioTransport("bun", ["run", MOCK_SERVER], {});
    const client = new McpClient(transport);

    const initResult = await client.initialize({
      name: "test-client",
      version: "1.0.0",
    });
    expect(initResult.protocolVersion).toBe("2024-11-05");
    expect(initResult.serverInfo.name).toBe("mock-server");

    const tools = await client.listTools();
    expect(tools.length).toBe(2);
    expect(tools[0].name).toBe("add");
    expect(tools[1].name).toBe("echo");

    await client.close();
  });

  it("calls tools successfully", async () => {
    const transport = new StdioTransport("bun", ["run", MOCK_SERVER], {});
    const client = new McpClient(transport);

    await client.initialize({ name: "test-client", version: "1.0.0" });

    const result = await client.callTool("add", { a: 5, b: 3 });
    expect(result.content[0].text).toBe("8");

    const echoResult = await client.callTool("echo", { message: "hello" });
    expect(echoResult.content[0].text).toBe("hello");

    await client.close();
  });
});
