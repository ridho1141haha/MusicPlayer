/**
 * Fixture naming for live captures (WEB-LAB-9).
 *
 * Pure + unit-tested so the Search Playground can suggest a deterministic,
 * collision-friendly name like `search_live_2026-10-12_lathi.json` that matches
 * the built-in capture naming convention — and always passes the strict
 * API-side pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.json$`.
 */

const ALLOWED = /[^a-z0-9]+/g; // letters/digits only — every separator (space, dash, punct) becomes "_"

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(ALLOWED, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
    .replace(/_+$/g, '');
}

/**
 * Suggest a fixture file name for a live capture.
 * - date part comes from the caller (ISO instant) so the function stays pure;
 * - non-ASCII queries (Indonesian, emoji…) slug to `_` runs which are collapsed;
 * - a fully stripped query falls back to `query` so the name is never empty;
 * - the result always matches the API's NAME_PATTERN (letters/digits/._- only).
 */
export function suggestFixtureName(query: string, now: Date): string {
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const slug = slugify(query);
  const safeSlug = slug.length > 0 ? slug : 'query';
  return `search_live_${date}_${safeSlug}.json`;
}

/** Client-side pre-check mirroring the API NAME_PATTERN for early, honest feedback. */
export function isValidFixtureName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.json$/.test(name) && !name.includes('..') && !name.includes('/');
}
