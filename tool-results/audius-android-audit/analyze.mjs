// Catalog measurement analysis (AUDIUS-ANDROID-1 Step 2) — read-only over captured JSON.
import { readFileSync, readdirSync } from 'node:fs';

const files = readdirSync('.').filter((f) => f.endsWith('.json') && (f.startsWith('q_') || f.startsWith('search_')) && !f.startsWith('search_indo_'));
const indoFiles = ['search_indo_lathi.json', 'search_indo_indonesia.json', 'search_indo_tulus.json'];

function analyze(file) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const data = Array.isArray(raw?.data) ? raw.data : null;
    if (!data) return { file, error: 'no data[] — ' + JSON.stringify(raw).slice(0, 80) };
    const total = data.length;
    const streamable = data.filter((t) => t.is_streamable === true && t.is_delete !== true && t.is_available !== false);
    const streamBlocked = total - streamable.length;
    const genres = {};
    for (const t of streamable) {
      const g = (t.genre || 'none').toLowerCase();
      genres[g] = (genres[g] || 0) + 1;
    }
    const top = streamable.slice(0, 5).map((t) => ({
      title: (t.title || '').slice(0, 52),
      artist: (t.user?.name || '').slice(0, 24),
      dur: t.duration + 's',
      plays: t.play_count,
    }));
    return { file, total, streamable: streamable.length, blocked: streamBlocked, topGenres: Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 4), top };
  } catch (e) {
    return { file, error: e.message };
  }
}

console.log('=== INDO QUERIES ===');
for (const f of indoFiles) console.log(JSON.stringify(analyze(f), null, 1));
console.log('=== OTHER QUERIES ===');
for (const f of files) console.log(JSON.stringify(analyze(f), null, 1));
