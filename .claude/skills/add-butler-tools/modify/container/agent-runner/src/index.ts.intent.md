# Intent: container/agent-runner/src/index.ts modifications

## What changed
Added conditional MCP server registrations for the Butler tools that map cleanly into NanoClaw.

## Key sections
- Builds `allowedTools` from the base NanoClaw tools plus any configured Butler tools
- Builds `mcpServers` from the built-in `nanoclaw` server plus any configured Butler MCP servers
- Obsidian activates only when the expected vault mount exists

## Invariants
- `nanoclaw` MCP server remains unchanged
- Missing credentials do not fail startup; the corresponding Butler tool stays disabled
- No generic external MCP config file is loaded at runtime
