/**
 * Fixture lineage (WEBLAB-15) — makes deliberate contract refreshes visible.
 *
 * When a live capture is re-taken (because the probe caught drift), the OLD
 * fixture stays frozen as drift history and the registry declares the
 * relationship: the new entry carries `supersedes: <old-name>`, the old one
 * `supersededBy: <new-name>`. These helpers derive the lineage for the UI
 * from the FixtureMeta list — pure, unit-tested, never guessing.
 */

import type { FixtureMeta } from './types';

/**
 * The fixture that REPLACED `name`, or null.
 * Prefers the fixture's own `supersededBy` declaration, falls back to scanning
 * for any fixture that declares `supersedes: name` (newest capture wins).
 */
export function findSupersedingFixture(fixtures: FixtureMeta[], name: string): FixtureMeta | null {
  const self = fixtures.find((f) => f.name === name);
  if (self !== undefined && typeof self.supersededBy === 'string' && self.supersededBy.length > 0) {
    const target = fixtures.find((f) => f.name === self.supersededBy);
    if (target !== undefined) return target;
  }
  const candidates = fixtures
    .filter((f) => f.supersedes === name && f.name !== name)
    .sort((a, b) => (a.capturedAt ?? '').localeCompare(b.capturedAt ?? ''));
  return candidates[candidates.length - 1] ?? null;
}

/** The fixture that `name` REPLACED (its own `supersedes` declaration), or null. */
export function findSupersededFixture(fixtures: FixtureMeta[], name: string): FixtureMeta | null {
  const self = fixtures.find((f) => f.name === name);
  const declared = self?.supersedes;
  if (typeof declared !== 'string' || declared.length === 0) return null;
  return fixtures.find((f) => f.name === declared) ?? null;
}
