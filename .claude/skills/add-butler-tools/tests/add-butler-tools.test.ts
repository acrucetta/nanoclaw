import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('add-butler-tools skill package', () => {
  const skillDir = path.resolve(__dirname, '..');

  it('declares the butler-tools skill', () => {
    const manifestPath = path.join(skillDir, 'manifest.yaml');
    const content = fs.readFileSync(manifestPath, 'utf-8');

    expect(content).toContain('skill: butler-tools');
    expect(content).toContain('BRAVE_API_KEY');
    expect(content).toContain('YNAB_API_TOKEN');
  });

  it('adds Butler MCP servers to the modified agent runner', () => {
    const filePath = path.join(
      skillDir,
      'modify',
      'container',
      'agent-runner',
      'src',
      'index.ts',
    );
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain("'mcp__brave-search__*'");
    expect(content).toContain("'mcp__whoop__*'");
    expect(content).toContain("'mcp__readwise__*'");
    expect(content).toContain("'mcp__ynab__*'");
    expect(content).toContain("'mcp__obsidian__*'");
  });
});
