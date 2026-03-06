---
name: add-gws-google
description: Add Gmail, Google Calendar, and Amazon-purchase lookups to NanoClaw through Google Workspace CLI's native MCP server.
---

# Add Google Workspace Tools

This skill exposes the host `gws` CLI to NanoClaw using `gws`'s built-in MCP
server instead of a custom wrapper.

What it adds:
- Gmail access through `gws mcp -s gmail,calendar`
- Google Calendar access through the same MCP server
- Amazon purchase lookups through Gmail search patterns

## Phase 1: Apply

Run:

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-gws-google
```

This:
- mounts `~/.config/gws` into the container
- mounts the host `gws` binary into the container
- passes optional Google Workspace CLI auth env vars through the runtime
- registers the native `google_workspace` MCP server in the agent runner
- syncs the runtime skill instructions in `container/skills/google-workspace`

## Phase 2: Authenticate

On the host:

```bash
gws auth login
mkdir -p ~/.config/gws
gws auth export --unmasked > ~/.config/gws/credentials.json
```

NanoClaw expects the exported credentials at
`~/.config/gws/credentials.json` so the container can use them without the host
OS keyring.

## Phase 3: Rebuild

```bash
./container/build.sh
npm run build
```

If groups already exist, clear cached per-group runner copies before restart:

```bash
rm -r data/sessions/*/agent-runner-src 2>/dev/null || true
```

## Phase 4: Verify

From the SSH host:

```bash
gws mcp -s gmail,calendar
```

Then ask NanoClaw:

- `@Andy check my recent emails`
- `@Andy what have I gotten from Amazon recently?`
- `@Andy what is on my calendar this week?`
