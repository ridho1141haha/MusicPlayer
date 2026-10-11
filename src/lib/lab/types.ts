/**
 * Shared Web Lab types.
 *
 * `LabTrack` mirrors the Java `com.ridho.music.domain.model.Track` shape for the
 * fields the web harness needs. Field names and semantics are kept identical so
 * JSON produced/consumed here stays compatible with the Android side
 * (extra Android-only fields — artworkPath, streamUri, lyrics, addedAtMs — are
 * simply absent on the web side; see FASE 2 architecture note in worklog.md).
 */

export type TrackSourceId = 'ytm' | 'local' | (string & {});

export interface LabTrack {
  /** Same id semantics as Android: "ytm:<videoId>" | "ytm-album:<browseId>" | "ytm-artist:<browseId>". */
  id: string;
  sourceId: TrackSourceId;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number;
  artworkUrl: string | null;
}

export interface SearchSection {
  title: string;
  tracks: LabTrack[];
}

/** One line of the parser explanation panel (accepted / rejected / info). */
export interface TraceEntry {
  /** Compact location inside the response, e.g. `blocks[3] > item[0]`. */
  path: string;
  kind: 'accepted' | 'rejected' | 'info';
  reason: string;
  detail?: string;
  /** Present on accepted entries. */
  trackId?: string;
}

export interface RendererStat {
  type: string;
  count: number;
}

export interface ParseResult {
  /** null only when the input root itself was null (Java contract). */
  sections: SearchSection[] | null;
  trace: TraceEntry[];
  rendererStats: RendererStat[];
  /** Continuation token if the response ever carries one (currently never, verified 2026-10-11). */
  continuationToken: string | null;
}

/** Fixture registry entry served by /api/lab/fixtures. */
export interface FixtureMeta {
  name: string;
  origin: 'real-capture' | 'legacy-inline-fixture' | 'synthetic' | 'user-added';
  capturedAt: string | null;
  query: string | null;
  description: string;
  sizeBytes: number;
}

/** A QA suite result as recorded by scripts/run-qa.sh (real executions only). */
export interface QaSuiteResult {
  name: string;
  command: string;
  status: 'pass' | 'fail' | 'skipped';
  passed: number | null;
  failed: number | null;
  skipped: number | null;
  durationMs: number | null;
  exitCode: number | null;
  detail: string;
}

export interface QaResults {
  recordedAt: string;
  suites: QaSuiteResult[];
  apk: {
    exists: boolean;
    path: string;
    sizeBytes: number | null;
    sha256: string | null;
    versionName: string | null;
    versionCode: number | null;
  } | null;
  /** Summary of previous runs (newest first, kept by scripts/run-qa.sh). */
  history?: Array<{
    recordedAt: string;
    passed: number;
    failed: number;
    skipped: number;
    allPassed: boolean;
  }>;
}

/** Feature-parity row (hand-maintained, evidence-backed; see src/data/parity.ts). */
export type FeatureStatus = 'untested' | 'pass' | 'fail' | 'needs-device' | 'blocked' | 'not-applicable';

export interface ParityRow {
  feature: string;
  androidImplemented: boolean;
  logicTests: FeatureStatus;
  logicTestsNote: string;
  browserTests: FeatureStatus;
  browserTestsNote: string;
  androidBuild: FeatureStatus;
  androidBuildNote: string;
  deviceTests: FeatureStatus;
  deviceTestsNote: string;
  policy: string | null;
}
