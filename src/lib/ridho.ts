/**
 * Shared types, constants and formatting helpers for the Ridho Music
 * delivery dashboard. Imported by both API routes (server) and
 * dashboard components (client).
 */

/** Repository-relative root of the Android project. */
export const ANDROID_ROOT = 'android';

/** File extensions the /api/file endpoint is allowed to serve as text. */
export const VIEWABLE_EXTENSIONS = [
  '.java',
  '.xml',
  '.md',
  '.gradle',
  '.properties',
  '.pro',
  '.json',
  '.gitignore',
  '.txt',
] as const;

export function isViewableFileName(name: string): boolean {
  return VIEWABLE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** Human-readable byte size, e.g. 10240525 -> "9.8 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** "2026-10-11T13:26:xx" -> "Oct 11, 2026" (safe fallback for bad input). */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown date';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// /api/project payload
// ---------------------------------------------------------------------------

export interface ApkAvailable {
  name: string;
  available: true;
  sizeBytes: number;
  mtime: string;
  /** SHA-256 of the artifact actually on disk (WEBLAB-16 — evidence, not claims). */
  sha256: string;
}

export interface ApkMissing {
  name: string;
  available: false;
  message: string;
}

export type ApkEntry = ApkAvailable | ApkMissing;

export interface TreeNode {
  name: string;
  /** Path relative to the android/ root; '' for the root node itself. */
  path: string;
  type: 'dir' | 'file';
  /** Files only. */
  size?: number;
  /** Dirs only; sorted dirs-first, then alphabetical. */
  children?: TreeNode[];
}

export interface TestSuiteResult {
  name: string;
  tests: number;
  failures: number;
  errors: number;
}

export interface TestTotals {
  tests: number;
  failures: number;
  errors: number;
  passed: number;
}

export interface TestResults {
  available: boolean;
  /** Present when available === false. */
  message?: string;
  suites: TestSuiteResult[];
  totals: TestTotals;
}

export interface ProjectCounts {
  javaFiles: number;
  xmlResources: number;
  totalSourceFiles: number;
  javaLines: number;
}

/**
 * Evidence-backed gradle-task status (WEBLAB-16). Derived from the recorded
 * run-qa execution + the CURRENT toolchain presence — never hardcoded.
 */
export interface BuildCheck {
  task: string;
  status: 'pass' | 'fail' | 'unverified' | 'toolchain-unavailable';
  detail?: string;
  /** recordedAt of the run-qa execution backing this check (null = none). */
  recordedAt?: string | null;
  exitCode?: number | null;
}

/** Whether the Gradle/SDK/JDK toolchain is installed right now. */
export interface ToolchainStatus {
  gradle: boolean;
  androidSdk: boolean;
  jdk: boolean;
  complete: boolean;
}

export type CriterionStatus = 'verified' | 'requires-device';

export interface Criterion {
  id: string;
  title: string;
  status: CriterionStatus;
  detail: string;
}

export interface DocsExcerpts {
  readmeExcerpt: string;
  changelogExcerpt: string;
}

export interface ProjectPayload {
  generatedAt: string;
  apks: {
    debug: ApkEntry;
    release: ApkEntry;
    /**
     * WEBLAB-22B — the current validated debug artifact under its unique
     * versioned filename (android/dist/ridho-music-v*-debug.apk, newest by
     * mtime). null when no versioned artifact exists yet.
     */
    served: ApkEntry | null;
  };
  /**
   * WEBLAB-22B — versionName/versionCode parsed live from
   * android/app/build.gradle (single source of truth for UI badges).
   */
  version: { name: string; code: number } | null;
  counts: ProjectCounts;
  /** Root node (path === '') whose children are the top level of android/. */
  tree: TreeNode;
  tests: TestResults;
  buildChecks: BuildCheck[];
  criteria: Criterion[];
  docs: DocsExcerpts;
  /** Toolchain presence on disk at generatedAt — gates what can be re-run. */
  toolchain: ToolchainStatus;
  /** recordedAt of the last recorded run-qa execution (null = none on disk). */
  qaRecordedAt: string | null;
}

// ---------------------------------------------------------------------------
// /api/file payload
// ---------------------------------------------------------------------------

export interface FilePayload {
  path: string;
  sizeBytes: number;
  content: string;
  truncated: boolean;
}
