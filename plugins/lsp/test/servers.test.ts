import { describe, expect, test } from "bun:test";
import { configuredServers, serverForFile } from "../src/servers";

describe("LSP server configuration", () => {
  test("enables the supported language defaults", () => {
    const servers = configuredServers(undefined);

    expect(Object.keys(servers)).toEqual([
      "typescript",
      "biome",
      "python",
      "rust",
    ]);
    expect(serverForFile(servers, "/workspace/app.ts")?.[0]).toBe("typescript");
    expect(serverForFile(servers, "/workspace/app.js")?.[0]).toBe("typescript");
    expect(serverForFile(servers, "/workspace/config.json")?.[0]).toBe("biome");
    expect(serverForFile(servers, "/workspace/app.py")?.[0]).toBe("python");
    expect(serverForFile(servers, "/workspace/app.rs")?.[0]).toBe("rust");
  });

  test("allows disabling and overriding servers", () => {
    const servers = configuredServers({
      python: false,
      typescript: {
        command: ["custom-ts-server"],
        extensions: [".custom"],
      },
    });

    expect(servers.python).toBeUndefined();
    expect(servers.typescript.command).toEqual(["custom-ts-server"]);
    expect(serverForFile(servers, "/workspace/app.custom")?.[0]).toBe(
      "typescript",
    );
    expect(serverForFile(servers, "/workspace/app.py")).toBeUndefined();
  });
});
