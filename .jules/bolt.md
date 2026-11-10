## 2026-11-10 - Optimize O(N²) Lookups in UI
**Learning:** Found nested loops caused by array `.includes()` and `.find()` operations inside React components during expensive `useMemo` recomputations on large arrays. The array filters evaluated for each item in large catalogs.
**Action:** Use `Map` or `Set` structures inside the `useMemo` blocks (e.g. converting catalogs to maps and tracking favorites via sets) to allow O(1) lookups and bring complexity down from O(N*M) to O(N+M).
