/**
 * Live-search → diff glue (WEB-LAB-9).
 *
 * The fixture diff works on `ParseResult`s produced by `parseWithTrace`. Live
 * searches go through `/api/lab/search`, which parses server-side with the SAME
 * parser but ships the pieces (sections/trace/rendererStats/continuationToken)
 * over JSON. This module reassembles a ParseResult from that payload — a pure,
 * total function with an honest type guard (no silent "empty parse" on shape
 * mismatch; a malformed payload yields null and the UI says so).
 */

import type { ParseResult, SearchSection, TraceEntry } from './types';

export interface LiveSearchPayload {
  ok: true;
  httpStatus: number;
  durationMs: number;
  query: string;
  byteLength: number;
  sections: SearchSection[] | null;
  trace: TraceEntry[];
  rendererStats: Array<{ type: string; count: number }>;
  continuationToken: string | null;
  note: string | null;
}

/** Structural type guard — every field checked, nothing assumed. */
export function isLiveSearchPayload(value: unknown): value is LiveSearchPayload {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v['ok'] !== true) return false;
  if (typeof v['httpStatus'] !== 'number') return false;
  if (typeof v['query'] !== 'string') return false;
  if (!Array.isArray(v['trace'])) return false;
  if (!Array.isArray(v['rendererStats'])) return false;
  // sections: null (null-root parse) or array of {title, tracks[]}
  if (v['sections'] !== null) {
    if (!Array.isArray(v['sections'])) return false;
    for (const section of v['sections']) {
      if (section === null || typeof section !== 'object') return false;
      const s = section as Record<string, unknown>;
      if (typeof s['title'] !== 'string' || !Array.isArray(s['tracks'])) return false;
    }
  }
  return true;
}

/** Reassemble a ParseResult. Returns null (honest) when the payload shape is unexpected. */
export function parseResultFromLivePayload(payload: unknown): ParseResult | null {
  if (!isLiveSearchPayload(payload)) return null;
  return {
    sections: payload.sections,
    trace: payload.trace,
    rendererStats: payload.rendererStats,
    continuationToken: payload.continuationToken,
  };
}
