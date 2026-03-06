#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';

import { applySkill } from '../skills-engine/apply.js';
import { readState } from '../skills-engine/state.js';
import { ASSISTANT_NAME as DEFAULT_ASSISTANT_NAME } from '../src/config.js';
import {
  getRegisteredGroup,
  initDatabase,
  setRegisteredGroup,
} from '../src/db.js';
import type { AdditionalMount, RegisteredGroup } from '../src/types.js';

interface Args {
  butlerRoot: string;
  nanoclawRoot: string;
  assistantName: string;
  mainGroupName: string;
}

interface ButlerSkillManifest {
  id: string;
  name?: string;
  env?: string[];
}

interface MigrationSummary {
  enabledButlerSkills: string[];
  appliedSkills: string[];
  skippedSkills: string[];
  nativeMappings: string[];
  deferredSkills: Array<{ id: string; reason: string }>;
  importedEnvKeys: string[];
  importedMemoryFiles: number;
  importedSessionFiles: number;
  obsidianMountPath?: string;
  registeredMainChat: boolean;
}

const ENV_SECTION_START = '# BEGIN imported-butler-config';
const ENV_SECTION_END = '# END imported-butler-config';
const CLAUDE_SECTION_START = '<!-- BEGIN imported-butler-tools -->';
const CLAUDE_SECTION_END = '<!-- END imported-butler-tools -->';
const MEMORY_SECTION_START = '<!-- BEGIN imported-butler-memory -->';
const MEMORY_SECTION_END = '<!-- END imported-butler-memory -->';
const TELEGRAM_SKILL_DIR = '.claude/skills/add-telegram';
const BUTLER_TOOLS_SKILL_DIR = '.claude/skills/add-butler-tools';
const GOG_GOOGLE_SKILL_DIR = '.claude/skills/add-gog-google';
const TOOL_SKILLS = new Set([
  'brave-search',
  'whoop',
  'readwise',
  'ynab',
  'obsidian',
  'gmail',
  'google-calendar',
  'amazon-purchases',
]);
const OPENROUTER_ANTHROPIC_BASE_URL = 'https://openrouter.ai/api';

const DEFERRED_REASONS: Record<string, string> = {};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  process.chdir(args.nanoclawRoot);

  const butlerEnv = readEnvFile(path.join(args.butlerRoot, '.env'));
  const enabledSkillIds = loadEnabledSkillIds(args.butlerRoot);
  const manifests = loadSkillManifests(args.butlerRoot, enabledSkillIds);
  const summary: MigrationSummary = {
    enabledButlerSkills: enabledSkillIds,
    appliedSkills: [],
    skippedSkills: [],
    nativeMappings: [],
    deferredSkills: [],
    importedEnvKeys: [],
    importedMemoryFiles: 0,
    importedSessionFiles: 0,
    registeredMainChat: false,
  };

  if (args.assistantName === 'Andy') {
    args.assistantName = DEFAULT_ASSISTANT_NAME;
  }

  cleanupLegacyImportArtifacts(args.nanoclawRoot);

  if (butlerEnv.TELEGRAM_BOT_TOKEN) {
    await ensureSkillApplied(
      'telegram',
      path.join(args.nanoclawRoot, TELEGRAM_SKILL_DIR),
      summary,
    );
  }

  const enabledToolSkills = enabledSkillIds.filter((skillId) =>
    TOOL_SKILLS.has(skillId),
  );
  if (enabledToolSkills.length > 0) {
    await ensureSkillApplied(
      'butler-tools',
      path.join(args.nanoclawRoot, BUTLER_TOOLS_SKILL_DIR),
      summary,
    );
  }

  const enabledGoogleSkills = enabledSkillIds.filter((skillId) =>
    ['gmail', 'google-calendar', 'amazon-purchases'].includes(skillId),
  );
  if (enabledGoogleSkills.length > 0) {
    await ensureSkillApplied(
      'gog-google',
      path.join(args.nanoclawRoot, GOG_GOOGLE_SKILL_DIR),
      summary,
    );
  }

  summarizeNonSkillMappings(enabledSkillIds, summary);

  const importedEnv = buildImportedEnv(
    butlerEnv,
    manifests,
    [
      ...(butlerEnv.TELEGRAM_BOT_TOKEN ? ['TELEGRAM_BOT_TOKEN'] : []),
      'GOG_ACCOUNT',
      'GOG_KEYRING_PASSWORD',
    ],
  );
  summary.importedEnvKeys = Object.keys(importedEnv).sort();
  writeManagedEnv(
    path.join(args.nanoclawRoot, '.env'),
    importedEnv,
  );
  syncContainerEnv(args.nanoclawRoot);

  const obsidianMount = buildObsidianMount(
    enabledSkillIds,
    butlerEnv.OBSIDIAN_VAULT_PATH,
  );
  if (obsidianMount) {
    summary.obsidianMountPath = obsidianMount.hostPath;
  } else if (enabledSkillIds.includes('obsidian')) {
    summary.deferredSkills.push({
      id: 'obsidian',
      reason: 'obsidian_vault_path_missing_or_not_accessible_from_wsl',
    });
  }

  writeClaudeToolSection(
    path.join(args.nanoclawRoot, 'groups', 'main', 'CLAUDE.md'),
    enabledToolSkills,
    summary.deferredSkills,
  );
  const memoryImport = importButlerKnowledge(
    args.butlerRoot,
    path.join(args.nanoclawRoot, 'groups', 'main'),
    butlerEnv.ORCH_OWNER_CHAT_ID,
  );
  summary.importedMemoryFiles = memoryImport.memoryFilesImported;
  summary.importedSessionFiles = memoryImport.sessionFilesImported;
  writeClaudeMemorySection(
    path.join(args.nanoclawRoot, 'groups', 'main', 'CLAUDE.md'),
    memoryImport,
  );

  if (butlerEnv.ORCH_OWNER_CHAT_ID && butlerEnv.TELEGRAM_BOT_TOKEN) {
    initDatabase();
    const mainJid = `tg:${butlerEnv.ORCH_OWNER_CHAT_ID}`;
    const existing = getRegisteredGroup(mainJid);
    const registeredGroup = buildMainGroup(
      args.mainGroupName,
      args.assistantName,
      existing,
      obsidianMount ? [obsidianMount] : [],
    );
    setRegisteredGroup(mainJid, registeredGroup);
    summary.registeredMainChat = true;
  }

  refreshAgentRunnerCaches(args.nanoclawRoot);

  console.log(JSON.stringify(summary, null, 2));
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    butlerRoot: '',
    nanoclawRoot: process.cwd(),
    assistantName: 'Andy',
    mainGroupName: 'Butler Main',
  };

  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--butler-root':
        args.butlerRoot = argv[++i] || '';
        break;
      case '--nanoclaw-root':
        args.nanoclawRoot = argv[++i] || args.nanoclawRoot;
        break;
      case '--assistant-name':
        args.assistantName = argv[++i] || args.assistantName;
        break;
      case '--main-group-name':
        args.mainGroupName = argv[++i] || args.mainGroupName;
        break;
      default:
        break;
    }
  }

  if (!args.butlerRoot) {
    throw new Error(
      'Usage: tsx scripts/import-butler-config.ts --butler-root <path> [--nanoclaw-root <path>] [--assistant-name <name>] [--main-group-name <name>]',
    );
  }

  return args;
}

function readEnvFile(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function loadEnabledSkillIds(butlerRoot: string): string[] {
  const configPath = path.join(butlerRoot, '.data', 'skills', 'config.json');
  if (!fs.existsSync(configPath)) {
    return [];
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
    enabledSkills?: unknown;
  };
  if (!Array.isArray(parsed.enabledSkills)) {
    return [];
  }

  return parsed.enabledSkills.filter(isNonEmptyString);
}

function loadSkillManifests(
  butlerRoot: string,
  skillIds: string[],
): ButlerSkillManifest[] {
  return skillIds
    .map((skillId) => {
      const manifestPath = path.join(
        butlerRoot,
        'skills',
        skillId,
        'skill.json',
      );
      if (!fs.existsSync(manifestPath)) {
        return null;
      }

      return JSON.parse(
        fs.readFileSync(manifestPath, 'utf-8'),
      ) as ButlerSkillManifest;
    })
    .filter((manifest): manifest is ButlerSkillManifest => manifest !== null);
}

async function ensureSkillApplied(
  skillName: string,
  skillDir: string,
  summary: MigrationSummary,
): Promise<void> {
  if (isSkillApplied(skillName)) {
    summary.skippedSkills.push(skillName);
    return;
  }

  const result = await applySkill(skillDir);
  if (!result.success) {
    throw new Error(
      `Failed to apply skill ${skillName}: ${result.error ?? 'unknown error'}`,
    );
  }

  summary.appliedSkills.push(skillName);
}

function isSkillApplied(skillName: string): boolean {
  try {
    return readState().applied_skills.some((skill) => skill.name === skillName);
  } catch {
    return false;
  }
}

function summarizeNonSkillMappings(
  enabledSkillIds: string[],
  summary: MigrationSummary,
): void {
  for (const skillId of enabledSkillIds) {
    if (TOOL_SKILLS.has(skillId)) {
      continue;
    }

    if (skillId === 'orchestrator') {
      summary.nativeMappings.push(skillId);
      continue;
    }

    const reason = DEFERRED_REASONS[skillId];
    if (reason) {
      summary.deferredSkills.push({ id: skillId, reason });
      continue;
    }

    summary.deferredSkills.push({
      id: skillId,
      reason: 'no_nanoclaw_skill_mapping_defined',
    });
  }
}

function buildImportedEnv(
  butlerEnv: Record<string, string>,
  manifests: ButlerSkillManifest[],
  extraKeys: string[],
): Record<string, string> {
  const toolEnvKeys = manifests
    .filter((manifest) => TOOL_SKILLS.has(manifest.id))
    .flatMap((manifest) => manifest.env ?? []);
  const selectedKeys = [...new Set([...extraKeys, ...toolEnvKeys])];

  const importedEnv = Object.fromEntries(
    selectedKeys
      .filter((key) => isNonEmptyString(key) && isNonEmptyString(butlerEnv[key]))
      .map((key) => [key, butlerEnv[key]]),
  );

  if (isNonEmptyString(butlerEnv.OPENROUTER_API_KEY)) {
    importedEnv.ANTHROPIC_BASE_URL = OPENROUTER_ANTHROPIC_BASE_URL;
    importedEnv.ANTHROPIC_AUTH_TOKEN = butlerEnv.OPENROUTER_API_KEY;
    importedEnv.ANTHROPIC_API_KEY = '';
  }

  return importedEnv;
}

function writeManagedEnv(
  envPath: string,
  values: Record<string, string>,
): void {
  const renderedBlock = [
    ENV_SECTION_START,
    ...Object.entries(values)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${quoteEnvValue(value)}`),
    ENV_SECTION_END,
  ].join('\n');

  const existing = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, 'utf-8')
    : '';
  const next = replaceManagedSection(
    existing,
    ENV_SECTION_START,
    ENV_SECTION_END,
    renderedBlock,
  );
  fs.writeFileSync(envPath, next.endsWith('\n') ? next : `${next}\n`, 'utf-8');
}

function syncContainerEnv(nanoclawRoot: string): void {
  const envPath = path.join(nanoclawRoot, '.env');
  const destPath = path.join(nanoclawRoot, 'data', 'env', 'env');
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, destPath);
  }
}

function buildObsidianMount(
  enabledSkillIds: string[],
  rawVaultPath: string | undefined,
): AdditionalMount | undefined {
  if (!enabledSkillIds.includes('obsidian') || !isNonEmptyString(rawVaultPath)) {
    return undefined;
  }

  const hostPath = normalizeHostPath(rawVaultPath);
  if (!hostPath || !fs.existsSync(hostPath)) {
    return undefined;
  }

  return {
    hostPath,
    containerPath: 'obsidian-vault',
    readonly: false,
  };
}

function normalizeHostPath(rawPath: string): string | undefined {
  if (/^[A-Za-z]:\\/.test(rawPath)) {
    const drive = rawPath[0].toLowerCase();
    const rest = rawPath.slice(2).replace(/\\/g, '/');
    return `/mnt/${drive}${rest.startsWith('/') ? rest : `/${rest}`}`;
  }

  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }

  return undefined;
}

function buildMainGroup(
  mainGroupName: string,
  assistantName: string,
  existing: (RegisteredGroup & { jid: string }) | undefined,
  additionalMounts: AdditionalMount[],
): RegisteredGroup {
  const currentMounts =
    existing?.containerConfig?.additionalMounts?.filter(
      (mount) => mount.containerPath !== 'obsidian-vault',
    ) ?? [];
  const mergedMounts = [...currentMounts, ...additionalMounts];
  const containerConfig =
    mergedMounts.length > 0
      ? {
          ...(existing?.containerConfig ?? {}),
          additionalMounts: mergedMounts,
        }
      : existing?.containerConfig;

  return {
    name: mainGroupName,
    folder: existing?.folder ?? 'main',
    trigger: existing?.trigger ?? `@${assistantName}`,
    added_at: existing?.added_at ?? new Date().toISOString(),
    requiresTrigger: false,
    isMain: true,
    containerConfig,
  };
}

function refreshAgentRunnerCaches(nanoclawRoot: string): void {
  const sessionsDir = path.join(nanoclawRoot, 'data', 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    return;
  }

  for (const groupFolder of fs.readdirSync(sessionsDir)) {
    const agentRunnerDir = path.join(sessionsDir, groupFolder, 'agent-runner-src');
    if (fs.existsSync(agentRunnerDir)) {
      fs.rmSync(agentRunnerDir, { recursive: true, force: true });
    }
  }
}

function cleanupLegacyImportArtifacts(nanoclawRoot: string): void {
  for (const relPath of ['data/external-mcp', 'data/imported-skills']) {
    fs.rmSync(path.join(nanoclawRoot, relPath), {
      recursive: true,
      force: true,
    });
  }
}

function writeClaudeToolSection(
  claudeMdPath: string,
  enabledToolSkills: string[],
  deferredSkills: Array<{ id: string; reason: string }>,
): void {
  if (!fs.existsSync(claudeMdPath)) {
    return;
  }

  const activeTools = enabledToolSkills
    .map((skillId) => {
      switch (skillId) {
        case 'brave-search':
          return '- Brave Search via MCP when `BRAVE_API_KEY` is configured';
        case 'whoop':
          return '- Whoop via MCP when Whoop OAuth env vars are configured';
        case 'readwise':
          return '- Readwise via MCP when `ACCESS_TOKEN` is configured';
        case 'ynab':
          return '- YNAB via MCP when `YNAB_API_TOKEN` is configured';
        case 'obsidian':
          return '- Obsidian via MCP when the vault is mounted at `/workspace/extra/obsidian-vault`';
        case 'gmail':
          return '- Gmail search via the host `gog` CLI when `GOG_KEYRING_PASSWORD` is configured';
        case 'google-calendar':
          return '- Google Calendar via the host `gog` CLI when `GOG_KEYRING_PASSWORD` is configured';
        case 'amazon-purchases':
          return '- Amazon purchase lookups via Gmail search patterns over the host `gog` CLI';
        default:
          return `- ${skillId}`;
      }
    })
    .sort();

  const deferredLines = deferredSkills
    .filter((skill) => skill.id === 'gmail' || skill.id === 'google-calendar')
    .map((skill) => `- ${skill.id}: ${skill.reason}`);

  const block = [
    CLAUDE_SECTION_START,
    '## Imported Butler Tools',
    '',
    ...(activeTools.length > 0
      ? activeTools
      : ['- No Butler MCP tools are currently configured.']),
    '',
    '## Deferred Butler Integrations',
    '',
    ...(deferredLines.length > 0
      ? deferredLines
      : ['- None.']),
    CLAUDE_SECTION_END,
  ].join('\n');

  const existing = fs.readFileSync(claudeMdPath, 'utf-8');
  const next = replaceManagedSection(
    existing,
    CLAUDE_SECTION_START,
    CLAUDE_SECTION_END,
    block,
  );
  fs.writeFileSync(
    claudeMdPath,
    next.endsWith('\n') ? next : `${next}\n`,
    'utf-8',
  );
}

function importButlerKnowledge(
  butlerRoot: string,
  mainGroupDir: string,
  ownerChatId: string | undefined,
): {
  importRoot: string;
  memoryFilesImported: number;
  sessionFilesImported: number;
} {
  const importRoot = path.join(mainGroupDir, 'imported-butler');
  const memoryDestDir = path.join(importRoot, 'memory');
  const sessionsDestDir = path.join(importRoot, 'sessions');
  fs.mkdirSync(memoryDestDir, { recursive: true });
  fs.mkdirSync(sessionsDestDir, { recursive: true });

  let memoryFilesImported = 0;
  let sessionFilesImported = 0;

  const butlerMemorySummary = path.join(butlerRoot, 'MEMORY.md');
  if (fs.existsSync(butlerMemorySummary)) {
    fs.copyFileSync(
      butlerMemorySummary,
      path.join(importRoot, 'BUTLER_MEMORY.md'),
    );
    memoryFilesImported += 1;
  }

  const butlerMemoryDir = path.join(butlerRoot, 'memory');
  if (fs.existsSync(butlerMemoryDir)) {
    for (const relPath of listFilesRecursively(butlerMemoryDir)) {
      const srcPath = path.join(butlerMemoryDir, relPath);
      const destPath = path.join(memoryDestDir, relPath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      memoryFilesImported += 1;
    }
  }

  const sessionRoot = path.join(butlerRoot, '.data', 'worker', 'sessions');
  const importedSessionRelPaths: string[] = [];
  if (fs.existsSync(sessionRoot)) {
    const selected = selectSessionFiles(sessionRoot, ownerChatId);
    for (const relPath of selected) {
      const srcPath = path.join(sessionRoot, relPath);
      const destPath = path.join(sessionsDestDir, relPath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      importedSessionRelPaths.push(relPath);
      sessionFilesImported += 1;
    }
  }

  const readmeLines = [
    '# Imported Butler Context',
    '',
    'This directory contains Butler memory and selected session artifacts imported into NanoClaw.',
    '',
    '## Files',
    '',
    '- `BUTLER_MEMORY.md`: durable Butler memory summary',
    '- `memory/`: daily notes, reminders, reading list, and notes-to-self files',
    '- `sessions/`: selected owner-chat and proactive session logs preserved for reference',
    '',
    `Imported memory files: ${memoryFilesImported}`,
    `Imported session files: ${sessionFilesImported}`,
  ];
  fs.writeFileSync(
    path.join(importRoot, 'README.md'),
    `${readmeLines.join('\n')}\n`,
    'utf-8',
  );

  fs.writeFileSync(
    path.join(sessionsDestDir, 'SESSION_INDEX.md'),
    [
      '# Imported Butler Session Index',
      '',
      ...(
        importedSessionRelPaths.length > 0
          ? importedSessionRelPaths.map((relPath) => `- ${relPath}`)
          : ['- No Butler session files matched the current import filter.']
      ),
      '',
    ].join('\n'),
    'utf-8',
  );

  return {
    importRoot,
    memoryFilesImported,
    sessionFilesImported,
  };
}

function listFilesRecursively(rootDir: string): string[] {
  const result: string[] = [];

  const walk = (currentDir: string): void => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      result.push(path.relative(rootDir, fullPath));
    }
  };

  walk(rootDir);
  return result.sort();
}

function selectSessionFiles(
  sessionRoot: string,
  ownerChatId: string | undefined,
): string[] {
  const includePatterns = [
    ownerChatId ? `telegram_${ownerChatId}` : '',
    'proactive_heartbeat',
    'cron_morning-checkin',
    'cron_system_',
  ].filter(isNonEmptyString);
  const excludePatterns = [
    'smoke',
    'test',
    'dummy',
    'healthcheck',
    'fresh-test',
    'butler-tui',
  ];

  return listFilesRecursively(sessionRoot).filter((relPath) => {
    const normalized = relPath.replace(/\\/g, '/');
    if (!normalized.endsWith('.jsonl') && !normalized.endsWith('.md')) {
      return false;
    }
    if (excludePatterns.some((pattern) => normalized.includes(pattern))) {
      return false;
    }
    return includePatterns.some((pattern) => normalized.includes(pattern));
  });
}

function writeClaudeMemorySection(
  claudeMdPath: string,
  imported: {
    importRoot: string;
    memoryFilesImported: number;
    sessionFilesImported: number;
  },
): void {
  if (!fs.existsSync(claudeMdPath)) {
    return;
  }

  const block = [
    MEMORY_SECTION_START,
    '## Imported Butler Memory',
    '',
    'Use these files for durable context about what the user is up to:',
    '',
    '- `/workspace/group/imported-butler/BUTLER_MEMORY.md` for the high-level durable memory summary',
    '- `/workspace/group/imported-butler/memory/` for daily notes, reminders, and reading list files',
    '- `/workspace/group/imported-butler/sessions/SESSION_INDEX.md` for preserved Butler session references',
    '',
    `Imported memory files: ${imported.memoryFilesImported}`,
    `Imported session files: ${imported.sessionFilesImported}`,
    MEMORY_SECTION_END,
  ].join('\n');

  const existing = fs.readFileSync(claudeMdPath, 'utf-8');
  const next = replaceManagedSection(
    existing,
    MEMORY_SECTION_START,
    MEMORY_SECTION_END,
    block,
  );
  fs.writeFileSync(
    claudeMdPath,
    next.endsWith('\n') ? next : `${next}\n`,
    'utf-8',
  );
}

function replaceManagedSection(
  existing: string,
  startMarker: string,
  endMarker: string,
  replacement: string,
): string {
  const pattern = new RegExp(
    `${escapeRegex(startMarker)}[\\s\\S]*?${escapeRegex(endMarker)}\\n?`,
    'm',
  );

  if (pattern.test(existing)) {
    return existing.replace(pattern, `${replacement}\n`);
  }

  if (existing.trim().length === 0) {
    return `${replacement}\n`;
  }

  return `${existing.replace(/\n*$/, '\n\n')}${replacement}\n`;
}

function quoteEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
