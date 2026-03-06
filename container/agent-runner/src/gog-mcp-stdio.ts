import { spawnSync } from 'child_process';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const GOG_BIN = process.env.GOG_BIN || '/home/node/bin/gog';
const DEFAULT_ACCOUNT = process.env.GOG_ACCOUNT;

const server = new McpServer({
  name: 'gog',
  version: '1.0.0',
});

function runGog(
  args: string[],
  account?: string,
): { stdout: string; stderr: string } {
  const commandArgs = ['--no-input', '--json'];
  const resolvedAccount = account || DEFAULT_ACCOUNT;
  if (resolvedAccount) {
    commandArgs.push('--account', resolvedAccount);
  }
  commandArgs.push(...args);

  const result = spawnSync(GOG_BIN, commandArgs, {
    encoding: 'utf-8',
    env: process.env,
    maxBuffer: 1024 * 1024 * 8,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const errorText = (result.stderr || result.stdout || 'gog command failed')
      .trim();
    throw new Error(errorText);
  }

  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function normalizeJsonOutput(stdout: string): string {
  if (!stdout) {
    return '[]';
  }

  try {
    return JSON.stringify(JSON.parse(stdout), null, 2);
  } catch {
    return stdout;
  }
}

server.tool(
  'gmail_search',
  'Search Gmail threads using Gmail query syntax via the host gog CLI. Read-only.',
  {
    query: z.string().describe('Gmail query syntax, e.g. from:amazon.com newer_than:30d'),
    max: z.number().int().min(1).max(100).optional().describe('Maximum number of results to return'),
    account: z.string().email().optional().describe('Optional Google account override'),
  },
  async (args: { query: string; max?: number; account?: string }) => {
    const stdout = normalizeJsonOutput(
      runGog(
        [
          'gmail',
          'search',
          args.query,
          '--max',
          String(args.max ?? 10),
        ],
        args.account,
      ).stdout,
    );

    return {
      content: [{ type: 'text' as const, text: stdout }],
    };
  },
);

server.tool(
  'calendar_events',
  'List Google Calendar events via the host gog CLI. Read-only.',
  {
    calendar_id: z.string().optional().describe('Calendar ID, defaults to primary'),
    from: z.string().optional().describe('Start time, e.g. 2026-03-06 or today'),
    to: z.string().optional().describe('End time, e.g. 2026-03-13'),
    days: z.number().int().min(0).max(90).optional().describe('Next N days'),
    max: z.number().int().min(1).max(100).optional().describe('Maximum number of results'),
    query: z.string().optional().describe('Free-text filter'),
    today: z.boolean().optional().describe('Only today'),
    tomorrow: z.boolean().optional().describe('Only tomorrow'),
    week: z.boolean().optional().describe('Current week'),
    all: z.boolean().optional().describe('Search across all calendars'),
    account: z.string().email().optional().describe('Optional Google account override'),
  },
  async (args: {
    calendar_id?: string;
    from?: string;
    to?: string;
    days?: number;
    max?: number;
    query?: string;
    today?: boolean;
    tomorrow?: boolean;
    week?: boolean;
    all?: boolean;
    account?: string;
  }) => {
    const command = ['calendar', 'events'];
    if (args.calendar_id) {
      command.push(args.calendar_id);
    }
    if (args.from) command.push('--from', args.from);
    if (args.to) command.push('--to', args.to);
    if (args.days != null) command.push('--days', String(args.days));
    if (args.max != null) command.push('--max', String(args.max));
    if (args.query) command.push('--query', args.query);
    if (args.today) command.push('--today');
    if (args.tomorrow) command.push('--tomorrow');
    if (args.week) command.push('--week');
    if (args.all) command.push('--all');

    const stdout = normalizeJsonOutput(runGog(command, args.account).stdout);
    return {
      content: [{ type: 'text' as const, text: stdout }],
    };
  },
);

server.tool(
  'calendar_search',
  'Search Google Calendar events via the host gog CLI. Read-only.',
  {
    query: z.string().describe('Free-text event search query'),
    from: z.string().optional().describe('Start time, e.g. 2026-03-06'),
    to: z.string().optional().describe('End time, e.g. 2026-03-13'),
    max: z.number().int().min(1).max(100).optional().describe('Maximum number of results'),
    account: z.string().email().optional().describe('Optional Google account override'),
  },
  async (args: {
    query: string;
    from?: string;
    to?: string;
    max?: number;
    account?: string;
  }) => {
    const command = ['calendar', 'search', args.query];
    if (args.from) command.push('--from', args.from);
    if (args.to) command.push('--to', args.to);
    if (args.max != null) command.push('--max', String(args.max));

    const stdout = normalizeJsonOutput(runGog(command, args.account).stdout);
    return {
      content: [{ type: 'text' as const, text: stdout }],
    };
  },
);

server.tool(
  'auth_status',
  'Check whether the host gog CLI currently has readable Google auth state.',
  {
    account: z.string().email().optional().describe('Optional Google account override'),
  },
  async (args: { account?: string }) => {
    const stdout = normalizeJsonOutput(
      runGog(['auth', 'list'], args.account).stdout,
    );
    return {
      content: [{ type: 'text' as const, text: stdout }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
