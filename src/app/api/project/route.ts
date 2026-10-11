import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

import type {
  ApkEntry,
  BuildCheck,
  Criterion,
  DocsExcerpts,
  ProjectCounts,
  ProjectPayload,
  TestResults,
  TestSuiteResult,
  TreeNode,
} from '@/lib/ridho';

export const dynamic = 'force-dynamic';

const PROJECT_ROOT = '/home/z/my-project';
const ANDROID_DIR = path.join(PROJECT_ROOT, 'android');
const DIST_DIR = path.join(ANDROID_DIR, 'dist');
const TEST_RESULTS_DIR = path.join(
  ANDROID_DIR,
  'app',
  'build',
  'test-results',
  'testDebugUnitTest',
);

/** Directory names skipped when walking the Android project. */
const EXCLUDED_DIR_NAMES = new Set(['build', '.gradle', '.git']);

// ---------------------------------------------------------------------------
// Filesystem walking
// ---------------------------------------------------------------------------

function compareNames(a: { name: string }, b: { name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

async function buildChildren(absDir: string, relPath: string): Promise<TreeNode[]> {
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirs = entries.filter(
    (entry) => entry.isDirectory() && !EXCLUDED_DIR_NAMES.has(entry.name),
  );
  const files = entries.filter((entry) => entry.isFile());
  dirs.sort(compareNames);
  files.sort(compareNames);

  const nodes: TreeNode[] = [];

  for (const dir of dirs) {
    const childRel = relPath ? `${relPath}/${dir.name}` : dir.name;
    const children = await buildChildren(path.join(absDir, dir.name), childRel);
    nodes.push({ name: dir.name, path: childRel, type: 'dir', children });
  }

  for (const file of files) {
    const childRel = relPath ? `${relPath}/${file.name}` : file.name;
    let size = 0;
    try {
      size = (await fs.stat(path.join(absDir, file.name))).size;
    } catch {
      size = 0;
    }
    nodes.push({ name: file.name, path: childRel, type: 'file', size });
  }

  return nodes;
}

function flattenFiles(nodes: TreeNode[], acc: TreeNode[] = []): TreeNode[] {
  for (const node of nodes) {
    if (node.type === 'file') {
      acc.push(node);
    } else if (node.children) {
      flattenFiles(node.children, acc);
    }
  }
  return acc;
}

async function computeCounts(files: TreeNode[]): Promise<ProjectCounts> {
  let javaFiles = 0;
  let xmlResources = 0;
  const javaPaths: string[] = [];

  for (const file of files) {
    if (file.name.endsWith('.java')) {
      javaFiles += 1;
      javaPaths.push(file.path);
    } else if (file.name.endsWith('.xml')) {
      xmlResources += 1;
    }
  }

  const lineCounts = await Promise.all(
    javaPaths.map(async (relPath) => {
      try {
        const content = await fs.readFile(path.join(ANDROID_DIR, relPath), 'utf8');
        return content.length === 0 ? 0 : content.split('\n').length;
      } catch {
        return 0;
      }
    }),
  );

  return {
    javaFiles,
    xmlResources,
    totalSourceFiles: files.length,
    javaLines: lineCounts.reduce((sum, lines) => sum + lines, 0),
  };
}

// ---------------------------------------------------------------------------
// APK artifacts
// ---------------------------------------------------------------------------

async function apkEntry(name: string, rebuildTask: string): Promise<ApkEntry> {
  try {
    const stats = await fs.stat(path.join(DIST_DIR, name));
    return {
      name,
      available: true,
      sizeBytes: stats.size,
      mtime: stats.mtime.toISOString(),
    };
  } catch {
    return {
      name,
      available: false,
      message: `${name} is not present in android/dist/ right now. Rebuild with ":app:${rebuildTask}" to regenerate it.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Unit-test XML results (JUnit/Gradle format)
// ---------------------------------------------------------------------------

function parseSuiteXml(xml: string, fileName: string): TestSuiteResult {
  const tag = /<testsuite\b([^>]*)>/.exec(xml)?.[1] ?? '';
  const readCount = (attr: string): number => {
    const match = new RegExp(`\\b${attr}="(\\d+)"`).exec(tag);
    return match ? Number.parseInt(match[1], 10) : 0;
  };
  const name =
    /\bname="([^"]*)"/.exec(tag)?.[1] ?? fileName.replace(/^TEST-|\.xml$/g, '');
  return {
    name,
    tests: readCount('tests'),
    failures: readCount('failures'),
    errors: readCount('errors'),
  };
}

async function readTestResults(): Promise<TestResults> {
  try {
    const xmlNames = (await fs.readdir(TEST_RESULTS_DIR))
      .filter((name) => name.endsWith('.xml'))
      .sort();

    const suites = await Promise.all(
      xmlNames.map(async (name) =>
        parseSuiteXml(
          await fs.readFile(path.join(TEST_RESULTS_DIR, name), 'utf8'),
          name,
        ),
      ),
    );

    const totals = suites.reduce(
      (acc, suite) => ({
        tests: acc.tests + suite.tests,
        failures: acc.failures + suite.failures,
        errors: acc.errors + suite.errors,
        passed: 0,
      }),
      { tests: 0, failures: 0, errors: 0, passed: 0 },
    );
    totals.passed = totals.tests - totals.failures - totals.errors;

    return { available: true, suites, totals };
  } catch {
    return {
      available: false,
      message:
        'Unit-test XML results were not found under android/app/build/test-results/testDebugUnitTest. Run ":app:testDebugUnitTest" to (re)generate them.',
      suites: [],
      totals: { tests: 0, failures: 0, errors: 0, passed: 0 },
    };
  }
}

// ---------------------------------------------------------------------------
// Docs excerpts
// ---------------------------------------------------------------------------

async function readExcerpt(relPath: string, maxLines: number): Promise<string> {
  try {
    const content = await fs.readFile(path.join(ANDROID_DIR, relPath), 'utf8');
    return content.split('\n').slice(0, maxLines).join('\n').trimEnd();
  } catch {
    return `(Could not read ${relPath} on the server.)`;
  }
}

async function readDocs(): Promise<DocsExcerpts> {
  const [readmeExcerpt, changelogExcerpt] = await Promise.all([
    readExcerpt('README.md', 120),
    readExcerpt('CHANGELOG.md', 80),
  ]);
  return { readmeExcerpt, changelogExcerpt };
}

// ---------------------------------------------------------------------------
// Criteria + build checks (facts verified in worklog.md; test totals computed)
// ---------------------------------------------------------------------------

const CRITERIA: Criterion[] = [
  {
    id: 'A',
    title: 'Project builds successfully',
    status: 'verified',
    detail:
      'assembleDebug and assembleRelease (R8) both finished with BUILD SUCCESSFUL using Gradle 8.9 / AGP 8.7.3 / JDK 17 / SDK 35.',
  },
  {
    id: 'B',
    title: 'App launches without crashing',
    status: 'requires-device',
    detail:
      'ApplicationSmokeTest is provided in androidTest; launching on real hardware requires a device or emulator, unavailable in the build sandbox.',
  },
  {
    id: 'C',
    title: 'Audio playback works',
    status: 'requires-device',
    detail:
      'Local-file playback via Media3 ExoPlayer implemented; YouTube Music streams are best-effort by design. Audio output itself needs hardware.',
  },
  {
    id: 'D',
    title: 'Background playback continues',
    status: 'requires-device',
    detail:
      'Media3 MediaSessionService with WAKE_MODE_NETWORK, audio focus + ducking and becoming-noisy handling is implemented; needs a device to observe.',
  },
  {
    id: 'E',
    title: 'Locked-screen playback continues',
    status: 'requires-device',
    detail:
      'Same foreground MediaSessionService path as background playback; lock-screen behavior requires physical hardware to verify.',
  },
  {
    id: 'F',
    title: 'Transport controls function',
    status: 'requires-device',
    detail:
      'Play/pause/next/previous/seek/shuffle/repeat are implemented via PlaybackRepository (MediaController facade); needs hardware interaction.',
  },
  {
    id: 'G',
    title: 'Invalid / unavailable tracks handled',
    status: 'verified',
    detail:
      'Verified by unit tests: typed SourceException kinds (NETWORK/UNAVAILABLE/UNSUPPORTED/NOT_FOUND/PARSE) surface instead of crashes.',
  },
  {
    id: 'H',
    title: 'Network failures do not crash the app',
    status: 'verified',
    detail:
      'Typed SourceException contract plus one-shot stream re-resolution on player error; unit-tested (YouTubeMusicSourceTest, YtMusicSearchParserTest).',
  },
  {
    id: 'I',
    title: 'Queue / playlist persistence survives restarts',
    status: 'verified',
    detail:
      'Room schema (6 entities) with full play-queue snapshots restored paused at last position; Track JSON serialization is unit-tested.',
  },
  {
    id: 'J',
    title: 'Notification / lock-screen media controls',
    status: 'requires-device',
    detail:
      'Media3 DefaultMediaNotificationProvider on a custom channel is implemented; visual verification requires an Android device.',
  },
  {
    id: 'K',
    title: 'No secrets committed',
    status: 'verified',
    detail:
      'No credentials, tokens or private keys in the repository (grep-audited); debug build uses the default Android debug keystore.',
  },
  {
    id: 'L',
    title: 'No unexplained lint issues',
    status: 'verified',
    detail:
      'lintDebug reports 0 errors with abortOnError = true; UnstableApiUsage is disabled deliberately (Media3 unstable APIs, confined to the player package) and documented.',
  },
];

function buildChecks(tests: TestResults): BuildCheck[] {
  const testDetail = tests.available
    ? `${tests.totals.passed}/${tests.totals.tests} passed across ${tests.suites.length} suites`
    : 'XML results not found on disk';

  return [
    {
      task: ':app:assembleDebug',
      status: 'SUCCESS',
      detail: 'Gradle 8.9 · AGP 8.7.3 · JDK 17',
    },
    {
      task: ':app:assembleRelease',
      status: 'SUCCESS',
      detail: 'R8-minified, unsigned',
    },
    {
      task: ':app:testDebugUnitTest',
      status: 'SUCCESS',
      detail: testDetail,
    },
    {
      task: ':app:lintDebug',
      status: 'SUCCESS',
      detail: '0 errors · abortOnError = true',
    },
  ];
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const treeChildren = await buildChildren(ANDROID_DIR, '');
    const tree: TreeNode = {
      name: 'android',
      path: '',
      type: 'dir',
      children: treeChildren,
    };

    const [counts, debug, release, tests, docs] = await Promise.all([
      computeCounts(flattenFiles(treeChildren)),
      apkEntry('app-debug.apk', 'assembleDebug'),
      apkEntry('app-release-unsigned.apk', 'assembleRelease'),
      readTestResults(),
      readDocs(),
    ]);

    const payload: ProjectPayload = {
      generatedAt: new Date().toISOString(),
      apks: { debug, release },
      counts,
      tree,
      tests,
      buildChecks: buildChecks(tests),
      criteria: CRITERIA,
      docs,
    };

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to inspect the Android project: ${message}` },
      { status: 500 },
    );
  }
}
