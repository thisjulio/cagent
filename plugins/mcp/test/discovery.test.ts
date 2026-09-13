import { describe, expect, it } from "bun:test";
import { discoverMcpServers } from "../src/discovery.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("MCP .mcp.json discovery", () => {
  it("discovers servers from project .mcp.json", () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-test-"));
    const mcpJson = {
      mcpServers: {
        testserver: {
          command: "echo",
          args: ["test"],
          env: { FOO: "bar" },
        },
      },
    };
    fs.writeFileSync(path.join(tmpdir, ".mcp.json"), JSON.stringify(mcpJson));

    const servers = discoverMcpServers(tmpdir);
    expect(servers.length).toBe(1);
    expect(servers[0].name).toBe("testserver");
    expect(servers[0].transport).toBe("stdio");
    expect(servers[0].command).toBe("echo");
    expect(servers[0].args).toEqual(["test"]);
    expect(servers[0].env).toEqual({ FOO: "bar" });

    fs.rmSync(tmpdir, { recursive: true });
  });

  it("discovers http servers from .mcp.json", () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-test-"));
    const mcpJson = {
      mcpServers: {
        remote: {
          url: "https://example.com/mcp",
        },
      },
    };
    fs.writeFileSync(path.join(tmpdir, ".mcp.json"), JSON.stringify(mcpJson));

    const servers = discoverMcpServers(tmpdir);
    expect(servers.length).toBe(1);
    expect(servers[0].transport).toBe("http");
    expect(servers[0].url).toBe("https://example.com/mcp");

    fs.rmSync(tmpdir, { recursive: true });
  });

  it("returns empty when no .mcp.json exists", () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-test-"));
    const servers = discoverMcpServers(tmpdir);
    expect(servers.length).toBe(0);
    fs.rmSync(tmpdir, { recursive: true });
  });
});