# Safe Exec MCP Server

Safe, whitelisted command execution MCP server for AI coding agents (Qwen Code, Claude Desktop, Gemini CLI, etc.).

## Install

```bash
npm install -g @fizyonops/safe-exec-mcp
```

## Run (manual)

```bash
ALLOWED_COMMANDS="git,ls,pwd,cat,node,npm" safe-exec-mcp
```

This process expects an MCP client over stdio (it will wait for a client). Use with clients that support MCP server configuration.

## Configure in MCP client (example)

For Claude Desktop, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "safe-exec": {
      "command": "safe-exec-mcp",
      "env": {
        "ALLOWED_COMMANDS": "git,ls,pwd,cat,node,npm",
        "EXEC_TIMEOUT_MS": "30000"
      }
    }
  }
}
```

## Development

```bash
npm install
npm run build
npm test
```

## Security Defaults

- No shell invocation; uses `spawn` with argv
- Whitelist `ALLOWED_COMMANDS`
- Per-invoke timeout via `EXEC_TIMEOUT_MS`

Use at your own risk; review and restrict allowed commands.
