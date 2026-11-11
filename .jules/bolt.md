
## 2023-11-20 - [O(N²) Array Find/Includes inside Map loops]
**Learning:** Found an O(N²) anti-pattern in the Web Lab prototype dashboard where `catalog.find(...)` and `favorites.includes(...)` were being called inside `useMemo` derivations (e.g. mapping over queues or computing top tracks), causing performance to degrade as the catalog grows. This was particularly impactful during continuous re-renders triggered by simulated playback state.
**Action:** Use a fast-lookup map via `useMemo(() => new Map(catalog.map(t => [t.id, t])), [catalog])` and replace `[].includes()` with `new Set()`. This shifts lookup time from O(N) to O(1) for repeated access in loops, critical for maintaining 60fps React renders during ticking playback state.
