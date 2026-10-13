/**
 * WEBLAB-22B — live Jamendo verification probe (sandbox QA; NOT device playback).
 *
 * Evidence gathered with the REAL configured credential, printed with STRICT
 * sanitization:
 *   - the client id is NEVER printed (masked as dd••••••, length-hiding);
 *   - full URLs are NEVER printed (Jamendo URLs carry the client_id as a query
 *     param) — only endpoint paths and response fields are shown;
 *   - stream URLs are shown with all query params stripped.
 *
 * Checks (mirrors the in-app JamendoClient parameter contract):
 *   A. real search            → HTTP 200, envelope status=success, N results
 *   B. stream HEAD            → 200 audio/mpeg, content-length
 *   C. stream range GET       → 206 partial content, MP3 magic bytes (ID3/0xFF)
 *   D. unknown id lookup      → results_count 0 (app maps to NO_RESULTS, not an error)
 *   E. invalid client id      → HTTP 200 envelope status=failed code=5
 *                               (app maps to CONFIGURATION_REQUIRED)
 *
 * Writes a sanitized evidence record to data/weblab-22b-build-validation.json.
 * Usage: bun scripts/probe-jamendo-live.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SECRET_FILE = "data/secrets/jamendo.client-id";
const API = "https://api.jamendo.com/v3.0";

function loadClientId(): string {
  if (existsSync(SECRET_FILE)) {
    const v = readFileSync(SECRET_FILE, "utf8").trim();
    if (v) return v;
  }
  console.error("NO client id found at data/secrets/jamendo.client-id — aborting.");
  process.exit(2);
}

const CLIENT_ID = loadClientId();
const MASKED = "dd••••••"; // length-hiding mask; never print the real value

/** Final defensive scrub: Jamendo echoes client_id inside envelope fields like
 *  headers.next — replace any occurrence of the real id in anything we print
 *  or persist. (This sweep caught exactly such a leak on the first run.) */
function scrub(text: string): string {
  return text.split(CLIENT_ID).join(MASKED);
}

/** Strip every query string — any URL we print must be credential-free. */
function safeUrl(u: string | undefined | null): string {
  if (!u) return "(none)";
  try {
    const p = new URL(u);
    return `${p.origin}${p.pathname} (query params elided)`;
  } catch {
    return "(unparseable URL, params elided)";
  }
}

type Check = {
  id: string;
  label: string;
  status: "PASS" | "FAIL";
  evidence: Record<string, unknown>;
};

const checks: Check[] = [];
function record(id: string, label: string, ok: boolean, evidence: Record<string, unknown>) {
  checks.push({ id, label, status: ok ? "PASS" : "FAIL", evidence });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}`);
  for (const [k, v] of Object.entries(evidence)) console.log(`       ${k}: ${scrub(JSON.stringify(v))}`);
}

// --- A. real search (same documented params the app sends) -------------------
// NOTE (2026-10-12 live evidence): Jamendo's full-text index is query-flaky —
// the SAME query can return 0 results and then results within seconds/minutes
// (already documented in WEBLAB-22A; reproduced live this round: 'acoustic
// love' returned 5 tracks at 22:22Z and 0 results at 23:52Z). The probe tries
// a small query list and records every attempt, so one blip cannot hide the
// real behavior of the credential + index.
const QUERIES = ["acoustic love", "acoustic", "love song", "morning", "piano", "summer"];
type JamTrack = {
  id: string; name: string; artist_name: string; album_name?: string;
  duration: number; audio: string; image?: string; license_ccurl?: string;
};
const attempts: Array<{ query: string; envelope: unknown; results: number }> = [];
let workingQuery: string | null = null;
let search: { headers: { status: string; code: number; results_count: number; error_message?: string }; results: JamTrack[] } | null = null;
let searchRes: Response | null = null;
let searchMs = 0;
for (const q of QUERIES) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID, format: "json", search: q, limit: "5",
    audioformat: "mp32", imagesize: "300", include: "licenses", type: "albumtrack",
  });
  const t0 = Date.now();
  const res = await fetch(`${API}/tracks/?${p}`, { headers: { accept: "application/json" } });
  searchMs = Date.now() - t0;
  const json = (await res.json()) as typeof search & { results?: JamTrack[] };
  // Echo ONLY the safe envelope fields — headers.next etc. embed the client_id.
  attempts.push({
    query: q,
    envelope: {
      status: json.headers?.status, code: json.headers?.code,
      results_count: json.headers?.results_count,
    },
    results: json.results?.length ?? 0,
  });
  if (res.status === 200 && json.headers?.status === "success" && (json.results?.length ?? 0) > 0) {
    workingQuery = q; searchRes = res; search = json; break;
  }
}
const hdr = search?.headers ?? ({ status: "missing", code: -1, results_count: 0 } as never);
const results = search?.results ?? [];
record("A_real_search", `search via official v3.0 API (client_id ${MASKED}); query=${workingQuery ?? "NONE of " + QUERIES.length + " queries returned results"}`,
  searchRes !== null && hdr.status === "success" && results.length > 0,
  {
    httpStatus: searchRes?.status,
    envelope: { status: hdr.status, code: hdr.code, results_count: hdr.results_count },
    durationMs: searchMs,
    queryAttempts: attempts,
    indexFlakinessNote: "0-result blips are a documented Jamendo full-text index behavior, NOT a credential failure (invalid ids produce code 5 — check E)",
    firstResult: results[0] ? {
      id: results[0].id, name: results[0].name, artist: results[0].artist_name,
      album: results[0].album_name ?? "(single — empty per documented quirk)",
      durationSec: results[0].duration,
      streamUrl: safeUrl(results[0].audio),
      hasArtwork: Boolean(results[0].image),
      license: results[0].license_ccurl ? "CC deed url present" : "(none)",
    } : "(no results)",
  });

// --- B/C. stream HEAD + range GET on the first real result -------------------
if (results[0]) {
  const streamUrl: string = results[0].audio;
  const head = await fetch(streamUrl, { method: "HEAD" });
  record("B_stream_head", "HEAD on official stream URL (params elided)",
    head.status === 200 && (head.headers.get("content-type") ?? "").startsWith("audio/"),
    {
      httpStatus: head.status,
      contentType: head.headers.get("content-type"),
      contentLength: head.headers.get("content-length"),
      acceptRanges: head.headers.get("accept-ranges"),
    });

  const range = await fetch(streamUrl, { headers: { Range: "bytes=0-1023" } });
  const buf = Buffer.from(await range.arrayBuffer());
  const id3 = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33; // "ID3"
  const frameSync = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;     // MPEG frame sync
  record("C_stream_range", "Range GET first 1024 bytes (params elided)",
    range.status === 206 && (id3 || frameSync),
    {
      httpStatus: range.status,
      bytes: buf.length,
      mp3Signature: id3 ? "ID3 header" : frameSync ? "MPEG frame sync" : `none (0x${buf[0]?.toString(16)} 0x${buf[1]?.toString(16)})`,
      contentRange: range.headers.get("content-range"),
    });
} else {
  record("B_stream_head", "skipped — no search results", false, { reason: "no results returned" });
  record("C_stream_range", "skipped — no search results", false, { reason: "no results returned" });
}

// --- D. unknown id lookup (app contract: NO_RESULTS, not an error) ------------
const dParams = new URLSearchParams({
  client_id: CLIENT_ID, format: "json", id: "999999999", audioformat: "mp32",
});
const dRes = await fetch(`${API}/tracks/?${dParams}`);
const dJson = (await dRes.json()) as { headers: { status: string; results_count: number } };
record("D_unknown_id_lookup", "id lookup for a track that does not exist",
  dRes.status === 200 && dJson.headers.status === "success" && dJson.headers.results_count === 0,
  { httpStatus: dRes.status, envelope: dJson.headers });

// --- E. invalid client id (app contract: CONFIGURATION_REQUIRED via code 5) ---
const eParams = new URLSearchParams({
  client_id: "invalid_probe_id_not_real", format: "json", search: "acoustic", limit: "1",
});
const eRes = await fetch(`${API}/tracks/?${eParams}`);
const eJson = (await eRes.json()) as { headers: { status: string; code: number; error_message?: string } };
record("E_invalid_client_id", "envelope behavior for an invalid client id",
  eRes.status === 200 && eJson.headers.status === "failed" && eJson.headers.code === 5,
  { httpStatus: eRes.status, envelope: { status: eJson.headers.status, code: eJson.headers.code, error_message: eJson.headers.error_message } });

// --- summary + sanitized evidence file ---------------------------------------
const pass = checks.filter((c) => c.status === "PASS").length;
console.log(`\nLIVE PROBE SUMMARY: ${pass}/${checks.length} PASS (client_id ${MASKED}, never logged)`);
if (pass < checks.length) console.log("Some checks FAILED — see evidence above.");

const evidence = {
  taskId: "WEBLAB-22B",
  recordedAt: new Date().toISOString(),
  sanitization: "client_id masked as dd•••••• (length-hiding); all printed URLs have query params elided; envelope echoes limited to safe fields + final scrub pass",
  probe: checks,
  verdict: pass === checks.length ? "ALL LIVE CHECKS PASS (API search + stream resolution; playback itself requires a device — NOT RUN)" : "FAILURES PRESENT",
};
writeFileSync("data/weblab-22b-build-validation.json", scrub(JSON.stringify(evidence, null, 2)) + "\n");
console.log("sanitized evidence → data/weblab-22b-build-validation.json");
