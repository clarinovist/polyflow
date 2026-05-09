# PolyFlow Cost Guardrail Phase 1 Implementation Plan

> For Hermes: implement with strict TDD. Tests first, then minimal code, then verification.

**Goal:** menambahkan explainability dan warning awal untuk kasus costing variant yang tampak aneh, tanpa mengubah engine fallback costing inti.

**Architecture:** tambah utility shared untuk mendiagnosis source cost dan gap anomaly, lalu expose hasilnya ke Product Detail, BOM Detail/BOM Form, dan satu audit page read-only. Fokus phase 1 adalah transparansi + highlight outlier, bukan blocking workflow.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Prisma-backed server actions, Vitest.

---

### Task 1: Tambah test untuk cost diagnostics utility

**Objective:** mendefinisikan perilaku cost source, gap alert, dan low-stock anomaly sebelum implementation.

**Files:**
- Modify: `src/lib/utils/current-cost.test.ts`
- Modify: `src/lib/utils/current-cost.ts`

**Step 1: Write failing tests**
Tambahkan test untuk:
- source = `inventory_average` saat stockQty > 0 dan stockValue > 0
- source = `standard_cost` saat inventory kosong / tidak bernilai
- anomaly `low_stock_cost_outlier` saat qty kecil dan gap % besar
- helper line cost tetap kompatibel

**Step 2: Run test to verify failure**
Run: `npm test -- --run src/lib/utils/current-cost.test.ts`
Expected: FAIL karena helper diagnostics belum ada.

**Step 3: Implement minimal utility**
Tambahkan helper baru di `current-cost.ts`:
- `getCurrentCostBreakdown()`
- `getCostAnomalyFlags()`
- type `CostSource`
Tetap pertahankan `getCurrentUnitCost()` agar backward-compatible.

**Step 4: Run test to verify pass**
Run: `npm test -- --run src/lib/utils/current-cost.test.ts`
Expected: PASS

**Step 5: Commit**
Nanti digabung setelah semua phase 1 lolos.

---

### Task 2: Enrich data di Product Detail action

**Objective:** kirim diagnostics per variant dari server action ke UI product detail.

**Files:**
- Modify: `src/actions/product.ts`
- Modify: `src/lib/utils/current-cost.ts`

**Step 1: Add failing test if practical at utility level**
Karena server action belum punya test ringan, pastikan contract dijaga lewat type-safe helper dan existing utility tests.

**Step 2: Implement minimal enrichment**
Di `getProductById`, untuk setiap variant tambahkan:
- `costBreakdown`
- `costAlerts`
- `inventorySummary`

**Step 3: Verify type/build sanity**
Run targeted TypeScript/lint later.

---

### Task 3: Product Detail UI — badges + warning panel

**Objective:** user bisa langsung lihat source cost, gap, dan anomaly di Product Detail.

**Files:**
- Modify: `src/components/products/ProductDetail.tsx`

**Step 1: Render cost source badge**
Tampilkan di overview:
- source current cost
- basis qty
- optional gap info terhadap standard cost

**Step 2: Render anomaly warning cards**
Jika ada flags seperti:
- low stock cost outlier
- inventory vs standard mismatch
munculkan alert ringkas.

**Step 3: Add Family Consistency Panel**
Tabel per sibling variant:
- Variant
- Current Cost
- Source
- Standard Cost
- Qty
- Gap %
- Status

**Step 4: Verify manually via local test/build**
Pastikan tidak ada error JSX/TS.

---

### Task 4: BOM detail/form UI — tampilkan source cost ingredient

**Objective:** user bisa lihat ketika BOM line cost dihitung dari inventory avg vs standard fallback.

**Files:**
- Modify: `src/components/production/bom/BOMDetails.tsx`
- Modify: `src/components/production/bom/BOMForm.tsx`

**Step 1: Reuse diagnostics utility**
Untuk tiap ingredient, tampilkan:
- source badge
- unit cost basis
- warning kecil jika low-stock outlier

**Step 2: Render summary warning**
Jika ada ingredient outlier, tampilkan note bahwa benchmark cost mungkin dipengaruhi residue stock.

**Step 3: Verify visually by build/test**

---

### Task 5: Tambah audit page read-only

**Objective:** sediakan halaman sederhana untuk review anomaly costing lintas variant.

**Files:**
- Create: `src/app/finance/costing/audit/page.tsx`
- Create/Modify: action/service helper untuk pull variant costing snapshot (pilih lokasi paling masuk akal)

**Step 1: Implement minimal dataset**
Kolom minimal:
- Product
n- Variant
- Current Cost
- Source
- Standard Cost
- Total Stock
- Gap %
- Alerts

**Step 2: Filter anomalies first**
Default tampilkan variant dengan gap % besar atau low stock outlier.

**Step 3: Verify route renders**
Bisa build/render tanpa runtime error.

---

### Task 6: Verification

**Objective:** pastikan perubahan phase 1 aman dan sesuai scope.

**Files:**
- No new files required

**Step 1: Run targeted tests**
- `npm test -- --run src/lib/utils/current-cost.test.ts`

**Step 2: Run broader tests if impacted**
- `npm test -- --run src/services/production/__tests__/bom-cost-cascade-service.test.ts`

**Step 3: Run lint/build-focused checks**
- `npm run lint -- src/components/products/ProductDetail.tsx src/components/production/bom/BOMDetails.tsx src/components/production/bom/BOMForm.tsx src/actions/product.ts src/lib/utils/current-cost.ts src/app/finance/costing/audit/page.tsx`

**Step 4: Summarize result**
Laporkan:
- file yang berubah
- behavior baru
- scope yang sengaja belum dikerjakan (mis. blocking validation save BOM)
