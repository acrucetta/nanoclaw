# Intent: src/container-runner.ts modifications

## What changed
Allow the NanoClaw container runner to pass through the env credentials needed by the imported Butler MCP tools.

## Key sections
- Extended the `readSecrets()` allowlist with Brave Search, Whoop, Readwise, and YNAB credentials

## Invariants
- Existing Anthropic and Claude auth handling stays unchanged
- Secrets are still passed over stdin only and never written into mounted files
- No new generic plugin loader is introduced
