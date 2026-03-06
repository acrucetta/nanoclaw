# Butler Migration

This repository can import the NanoClaw-compatible parts of a Butler install
without adding a permanent Butler compatibility layer to NanoClaw core.

The migration follows NanoClaw's normal model:

- apply NanoClaw skills for concrete capabilities
- copy only the needed credentials into `.env`
- register the main Telegram chat in NanoClaw's database
- mount only the directories a migrated capability actually needs

## Current Mapping

- `telegram` -> NanoClaw's existing `add-telegram` skill
- `brave-search`, `whoop`, `readwise`, `ynab`, `obsidian` -> NanoClaw's
  repo-local `add-butler-tools` skill
- `gmail`, `google-calendar`, `amazon-purchases` -> NanoClaw's repo-local
  `add-gog-google` skill over Butler's existing `gog` CLI workflow
- `orchestrator` -> NanoClaw's native scheduler/task model, not a ported
  subsystem

## Import Command

```bash
npx tsx scripts/import-butler-config.ts \
  --butler-root /path/to/butler \
  --nanoclaw-root /path/to/nanoclaw
```

## What The Importer Does

- applies NanoClaw skills only when the matching Butler capability is enabled
- writes a managed imported section into `.env`
- syncs `.env` into `data/env/env`
- updates `groups/main/CLAUDE.md` with imported tool notes
- copies Butler durable memory and selected session artifacts into
  `groups/main/imported-butler/`
- registers the main Telegram chat from `ORCH_OWNER_CHAT_ID`
- adds the Obsidian vault as an explicit NanoClaw mount when available
- clears cached per-group `agent-runner-src` directories so rebuilt behavior is
  picked up on restart

## Deliberate Non-Goals

- no generic external MCP loader in NanoClaw core
- no copied Butler skill runtime under `data/imported-skills`
- no direct Windows `gog.exe` dependency inside NanoClaw containers

## Current Caveat

The imported `gog` path expects a working Linux `gog` install plus readable
Google auth state under `~/.config/gogcli`. If Butler's old token store cannot
be decrypted after migration, re-run `gog auth login` on the SSH host to
refresh the Linux-side credentials.
