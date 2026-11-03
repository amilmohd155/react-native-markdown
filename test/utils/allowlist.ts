import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SpecSuite } from './specReader';

/** One known divergence from the spec. Format: testing-harness.md#allowlist-format */
export interface AllowlistEntry {
  backend: string;
  suite: SpecSuite;
  example: number;
  section: string;
  reason: string;
  issue: string;
}

const BACKEND = 'markdown-it';

export function loadAllowlist(): Map<string, AllowlistEntry> {
  const raw: unknown = JSON.parse(
    readFileSync(join(__dirname, '..', 'fixtures', 'allowlist.json'), 'utf8')
  );
  if (!Array.isArray(raw)) {
    throw new Error('test/fixtures/allowlist.json must be a JSON array');
  }

  const entries = new Map<string, AllowlistEntry>();
  for (const entry of raw as AllowlistEntry[]) {
    if (!entry.reason || !entry.issue) {
      throw new Error(
        `Allowlist entry ${entry.suite} #${entry.example} needs a reason and an issue`
      );
    }
    if (entry.backend === BACKEND) {
      entries.set(`${entry.suite}:${entry.example}`, entry);
    }
  }
  return entries;
}
