---
name: add-butler-tools
description: Import the MCP-backed Butler tool suite into NanoClaw: Brave Search, Whoop, Readwise, YNAB, and Obsidian.
---

# Add Butler Tools

This skill ports the MCP-backed Butler capabilities that map cleanly onto NanoClaw's architecture.

What it adds:
- Brave Search MCP
- Whoop MCP
- Readwise MCP
- YNAB MCP
- Obsidian MCP

It does not add Butler's Google Gmail or Calendar flows. Those should be migrated separately with the repo-local `add-gws-google` skill.

## Phase 1: Apply

Run the skills engine:

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-butler-tools
```

This:
- Extends `src/container-runner.ts` so the Butler tool credentials can be passed into the container agent
- Extends `container/agent-runner/src/index.ts` with conditional MCP server registrations
- Records the skill in `.nanoclaw/state.yaml`

## Phase 2: Configure

Add any credentials you want to enable to `.env`:

```bash
BRAVE_API_KEY=
WHOOP_CLIENT_ID=
WHOOP_CLIENT_SECRET=
WHOOP_REDIRECT_URI=
WHOOP_SCOPES=
ACCESS_TOKEN=
YNAB_API_TOKEN=
```

Sync to the container environment:

```bash
mkdir -p data/env && cp .env data/env/env
```

### Obsidian vault

Obsidian uses a mounted directory instead of an env credential. Mount the vault into a group's container config at:

```text
/workspace/extra/obsidian-vault
```

## Phase 3: Rebuild

Tool definitions live in the agent runner, so rebuild the container image:

```bash
./container/build.sh
npm run build
```

If groups already exist, refresh their cached agent-runner source or restart NanoClaw after clearing `data/sessions/*/agent-runner-src`.

## Phase 4: Verify

Try a prompt that should force one of the imported tools:

- "Use Brave Search to find recent coverage of ..."
- "Check my latest Whoop recovery"
- "Fetch my recent Readwise highlights"
- "Show my YNAB budget summary"
- "Open my Obsidian note about ..."
