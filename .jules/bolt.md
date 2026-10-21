## 2026-10-21 - Array Traversal Bottlenecks in useMemo
**Learning:** Found O(N*M) performance bottlenecks in `src/components/lab/prototype-tab.tsx` where `catalog.find()` and `favorites.includes()` were used inside loops and `useMemo` dependencies. In a large catalog this blocks the main thread during renders.
**Action:** Always pre-compute `Map` (for lookups) and `Set` (for existence checks) from large arrays outside of loops, then use their O(1) `.get()` and `.has()` methods for fast data retrieval.
