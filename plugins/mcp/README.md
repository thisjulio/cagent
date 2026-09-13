# MCP Plugin for cagent

Connects cagent to [Model Context Protocol](https://modelcontextprotocol.io/) servers as a client, discovering and registering their tools.

## Configuration

Add MCP server configuration to your `cagent.yml` (project) or `~/.cagent/config.yml` (global):

```yaml
plugins:
  mcp:
    enabled: true
    servers:
      filesystem:
        transport: stdio
        command: npx
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/root"]
      
      postgres:
        transport: stdio
        command: npx
        args: ["-y", "@modelcontextprotocol/server-postgres"]
        env:
          DATABASE_URL: "postgres://user:pass@localhost/db"
      
      remote-tools:
        transport: http
        url: "https://mcp.example.com/sse"
        auth:
          type: bearer
          token_env: MCP_REMOTE_TOKEN  # Reads from environment variable
```

## Tool Naming

Tools are registered with an `mcp` namespace and the server name to avoid
collisions and make their category visible:

- `mcp-filesystem-read_file`
- `mcp-postgres-query`
- `mcp-remote-tools-search`

## Timeouts

- Default init timeout: 10 seconds per server
- Default tool call timeout: 30 seconds per server
- Override per server with `timeout_ms`

## Error Handling

- Failed servers are reported to the terminal but don't block other servers
- Tool call errors are returned to the model as tool results
- Servers that time out are skipped

## Testing

```bash
# Run MCP plugin tests
bun test plugins/mcp/test/
```

The mock server at `src/mock-server.ts` implements a minimal MCP server for testing.
