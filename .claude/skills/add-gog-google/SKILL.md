---
name: add-gog-google
description: Add Gmail, Google Calendar, and Amazon-purchase lookups to NanoClaw through the host gog CLI that Butler already used.
---

# Add Gog Google Tools

This skill keeps the Butler Google workflow intact by exposing the host `gog`
CLI to NanoClaw as MCP tools.

What it adds:
- Gmail search via `gog`
- Google Calendar event listing/search via `gog`
- Amazon-purchase lookups through Gmail search patterns

## Phase 1: Apply

Run:

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-gog-google
```

This:
- mounts `~/.config/gogcli` into the container
- mounts `~/go/bin/gog` into the container
- passes `GOG_ACCOUNT` and `GOG_KEYRING_PASSWORD` through the runtime env
- adds a local `gog` MCP server to the agent runner
- syncs the runtime skill instructions in `container/skills/google-gog`

## Phase 2: Configure

Set these in `.env`:

```bash
GOG_ACCOUNT=
GOG_KEYRING_PASSWORD=
```

Then sync:

```bash
mkdir -p data/env && cp .env data/env/env
```

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
~/go/bin/gog auth list
~/go/bin/gog --account "$GOG_ACCOUNT" gmail search "in:inbox newer_than:7d" --max 3
~/go/bin/gog --account "$GOG_ACCOUNT" calendar events --days 7 --max 5
```

Then ask NanoClaw:

- `@Andy check my recent emails`
- `@Andy what have I gotten from Amazon recently?`
- `@Andy what is on my calendar this week?`

## Caveat

If Butler's migrated token store cannot be decrypted in Linux, re-run
`gog auth login` on the SSH host to refresh the Linux-side auth files before
expecting NanoClaw to use Gmail or Calendar successfully.
