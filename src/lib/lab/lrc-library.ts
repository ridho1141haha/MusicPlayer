/**
 * Browser-local saved-LRC library (WEBLAB-12) — pure list operations so the
 * persistence contract is unit-testable without localStorage.
 *
 * Provenance contract: entries live in the browser (zustand localStorage) and
 * are NEVER uploaded to a server — mirrors the upload note in Lyrics Lab.
 */

export interface SavedLrcEntry {
  /** Unique key (the user-chosen name); re-saving the same name replaces it. */
  name: string;
  content: string;
  savedAt: number;
  sizeBytes: number;
}

/** Maximum stored entries — the cap keeps localStorage bounded and honest. */
export const LRC_LIBRARY_CAP = 12;

/** Guard against accidental multi-MB pastes flooding localStorage. */
export const MAX_LRC_CONTENT_BYTES = 256 * 1024;

export type UpsertLrcResult =
  | { ok: true; library: SavedLrcEntry[]; replaced: boolean }
  | { ok: false; reason: 'empty-name' | 'too-large' };

/**
 * Insert-or-replace by name: a re-save of an existing name replaces that entry
 * in place (keeping its original position); a new name is prepended. When the
 * cap is exceeded the OLDEST entries fall off the tail. Empty names and
 * oversized content are rejected explicitly (honest failure, never silent).
 */
export function upsertLrcEntry(
  library: readonly SavedLrcEntry[],
  entry: { name: string; content: string; savedAt: number },
  cap = LRC_LIBRARY_CAP,
): UpsertLrcResult {
  const name = entry.name.trim();
  if (name.length === 0) return { ok: false, reason: 'empty-name' };
  const sizeBytes = new TextEncoder().encode(entry.content).length;
  if (sizeBytes > MAX_LRC_CONTENT_BYTES) return { ok: false, reason: 'too-large' };
  const next: SavedLrcEntry = { name, content: entry.content, savedAt: entry.savedAt, sizeBytes };
  const existingIdx = library.findIndex((e) => e.name === name);
  if (existingIdx >= 0) {
    const library2 = [...library];
    library2[existingIdx] = next;
    return { ok: true, library: library2, replaced: true };
  }
  return { ok: true, library: [next, ...library].slice(0, cap), replaced: false };
}

/** Remove by name; removing an unknown name is a no-op (idempotent). */
export function removeLrcEntry(library: readonly SavedLrcEntry[], name: string): SavedLrcEntry[] {
  return library.filter((e) => e.name !== name);
}

/** Sorting for the library chips: newest save first, ties broken by name A→Z. */
export function sortLrcLibrary(library: readonly SavedLrcEntry[]): SavedLrcEntry[] {
  return [...library].sort((a, b) => (a.savedAt === b.savedAt ? a.name.localeCompare(b.name) : b.savedAt - a.savedAt));
}
