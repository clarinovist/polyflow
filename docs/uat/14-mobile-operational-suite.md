# UAT: Mobile Operational Suite

## Overview

Matriks UAT untuk portal selector, portal operasional mobile, boundary role/module/resource,
serta kontrol rollout dan capability yang akan menjadi fondasi perluasan role.

Dokumen ini membedakan dengan tegas:

- **CURRENT** — perilaku yang sudah ada pada source per 7 Oktober 2026;
- **TARGET (Phase 1+)** — kontrak yang harus diuji setelah registry/resolver/rollout baru
  diimplementasikan. Baris TARGET bukan klaim bahwa runtime saat ini sudah mempunyai
  AppSetting rollout atau permission `feature:mobile-*`.

Semua pengujian memakai akun/fixture sintetis pada environment test. Jangan memakai data
produksi, identitas tenant nyata, atau melakukan transaksi produksi.

## Evidence Baseline

### Source CURRENT

| Kontrak | Source of truth / bukti |
|---|---|
| Portal, status, role, module, resource | `src/lib/mobile/mobile-portal-registry.ts` |
| Candidate selector + module/resource filtering | `src/lib/mobile/mobile-access-policy.ts` dan `src/actions/settings/mobile-portals.ts` |
| Optimistic mobile gate, soft landing, no-DB Proxy contract | `src/auth.config.ts` dan `src/proxy.ts` |
| Final workspace/module/resource gate | layout workspace induk dan `src/lib/auth/access-policy.ts` |
| Finance action guard | `src/actions/finance/mobile-dashboard.ts` → `requireFinanceAccess()` |
| HRD action guard | `src/actions/hrd/mobile-dashboard.ts` |
| Purchasing action guard | `src/actions/purchasing/mobile-dashboard.ts` → `requirePurchasingAccess()` |
| Production/Factory Manager action guard | `src/actions/production/mobile-supervisor.ts` |
| Employee boundary terpisah | `src/app/my/**`; tidak masuk selector User `/mobile` |

### Historical rendered baseline (bukan bukti current HEAD)

Audit read-only 13 September 2026 pada SHA `1777d44aa71b776c1c195d9263eca71a729bac8b`
tersedia di
`docs/audits/2026-09-13-polyflow-mobile-tablet-reaudit/`. Bukti historisnya mencakup
390×844, 375×667 secara targeted, 768×1024, 1024×768, dan desktop. Temuan yang masih
menjadi baseline retest:

- portal mobile khusus dinilai paling kuat, tetapi Production/Finance/HRD/Purchasing
  tidak mempunyai H1 pada capture tersebut;
- bottom-nav item terukur sekitar 40 px dan safe-area fisik belum terbukti;
- loading dan deterministic error state belum tertangkap;
- Field Sales pada true-mobile belum terverifikasi secara konklusif;
- mutation sengaja tidak disubmit.

Bukti itu tidak boleh dipromosikan sebagai hasil current HEAD. Setelah perubahan runtime,
ulang browser QA dan catat SHA, fixture sintetis, viewport, `clientWidth`,
`scrollWidth`, heading count, hit-test, Back, serta hasil redirect.

## Device / Viewport Matrix

| # | Device representative | Viewport | Browser target |
|---|---|---:|---|
| D1 | iPhone SE | 320×568 | Safari |
| D2 | Android pendek | 360×720 | Chrome Android |
| D3 | Android standar | 360×800 | Chrome Android |
| D4 | iPhone 12/13 | 375×812 | Safari |
| D5 | iPhone 14 Pro | 390×844 | Safari |
| D6 | Android besar | 412×915 | Chrome Android |
| D7 | Android besar alternatif | 430×932 | Chrome Android |
| D8 | Tablet portrait | 768×1024 | Safari/Chrome |
| D9 | Tablet landscape | 1024×768 | Safari/Chrome |
| D10 | Desktop representative | 1280×720 atau 1440×900 | Chrome |

Untuk setiap viewport, rekam `document.documentElement.scrollWidth` dan
`clientWidth`. Page-level `scrollWidth` tidak boleh melebihi `clientWidth`;
pengecualian hanya contained scroller yang berlabel dan tidak melebarkan page.

## Network / Freshness States

| # | State | Expected result |
|---|---|---|
| N1 | Online normal | Data current tampil; `generatedAt`/terakhir diperbarui terlihat bila tersedia. |
| N2 | Slow 4G | Loading/slow state terlihat tanpa menggandakan submit. |
| N3 | Offline sebelum read | Offline dibedakan dari empty dan unauthorized; Finance/HRD tidak dibaca dari offline cache. |
| N4 | Koneksi hilang saat submit low-risk | Expected failure aman; tidak ada status sukses palsu. |
| N5 | Reconnect dan retry | Retry eksplisit; tidak ada duplikasi. |
| N6 | Duplicate tap/retry | Idempotency/double-submit guard berlaku pada action yang memang diizinkan. |
| N7 | Data stale | Stale notice dibedakan dari offline dan read failure. |
| N8 | Uncaught render error | Route error boundary memberi pesan generik + retry tanpa pesan server sensitif. |

## CURRENT Role / Portal Matrix

Hasil selector CURRENT tetap mensyaratkan **role + module aktif + resource**. “Candidate”
berarti selector dapat menampilkan portal; layout/action tetap wajib melakukan final guard.
Role yang tidak mempunyai portal masuk desktop-required dari soft landing, atau melihat
terminal empty state bila membuka `/mobile` langsung. Cookie bypass hanya memberi ADMIN
akses desktop selama masa berlakunya; bypass bukan portal dan bukan grant capability.

| # | Persona / kombinasi role | Expected mobile outcome CURRENT |
|---|---|---|
| R1 | ADMIN tenant | Belum mempunyai portal registry. `/mobile` menampilkan terminal empty state; mobile dashboard menuju desktop-required kecuali bypass ADMIN aktif. Tidak otomatis memperoleh portal operasional. |
| R2 | MARKETING | Tidak mempunyai portal mobile. Tidak boleh mendapat Sales Field; gunakan desktop Sales/Marketing. |
| R3 | SALES | Candidate Sales Field `/field/sales` bila SALES aktif dan resource Sales lolos. |
| R4 | SALES + MARKETING | Sales Field sengaja dikecualikan karena ada MARKETING; tanpa role portal lain hasilnya desktop-required/empty selector. |
| R5 | WAREHOUSE | Candidate Gudang Mobile `/warehouse/mobile` bila INVENTORY aktif dan resource Warehouse lolos. |
| R6 | PRODUCTION | Candidate Kiosk `/kiosk` dan Supervisor Produksi `/production/mobile` bila PRODUCTION/resource terkait lolos. Kiosk tetap focus mode. |
| R7 | PLANNING | Candidate Supervisor Produksi dan Purchasing Mobile; masing-masing bergantung module/resource terkait. Tidak mendapat Kiosk dari role PLANNING saja. |
| R8 | PROCUREMENT | Candidate Purchasing Mobile `/purchasing/mobile` bila PURCHASING dan resource lolos. |
| R9 | FINANCE | Candidate Finance Mobile `/finance/mobile` bila FINANCE dan resource lolos. |
| R10 | HRD | Candidate HRD Mobile `/hrd/mobile` bila HRD dan resource lolos. |
| R11 | FACTORY_MANAGER | Candidate Monitor Kepala Pabrik `/production/mobile` bila PRODUCTION dan resource Production lolos. Executive overview action CURRENT membutuhkan resource `/production/daily`, `/warehouse/inventory`, `/purchasing/requests`, dan `/purchasing/orders`; tanpa set lengkap tampil safe read failure, bukan data parsial palsu. Tidak mendapat quick-SPK/costing. |
| R12 | FINANCE + HRD | Selector berisi Finance dan HRD bila kedua module/resource lolos. Akses satu portal tidak boleh menyiratkan akses portal lain. |
| R13 | SALES + WAREHOUSE | Selector berisi Sales Field + Gudang bila kedua kontrak lolos. |
| R14 | PRODUCTION + PLANNING | Selector dapat berisi Kiosk + Supervisor Produksi + Purchasing sesuai module/resource. |
| R15 | Multi-role SALES + WAREHOUSE + PRODUCTION | Selector mendeduplikasi dan mengurutkan semua candidate yang lolos; tidak menambah role/grant. |
| R16 | Employee | Tetap memakai `/my` dengan session employee terpisah; tidak masuk selector User `/mobile`. |
| R17 | Super Admin | Desktop-only pada admin subdomain. Mobile diarahkan ke `/device/desktop-required` tanpa loop; tidak masuk portal tenant. |
| R18 | User tanpa portal yang sah | `/mobile` menampilkan empty/desktop guidance terminal tanpa redirect loop. |

### Known CURRENT contract gaps to freeze before Phase 1

- Registry dan allowlist masih dua daftar; `/maklon/mobile` PLANNED ada di registry tetapi
  bukan route navigable.
- ADMIN dan MARKETING belum mempunyai portal.
- AppSetting `mobile.portal.*.enabled` dan capability `feature:mobile-*` belum ada
  di runtime.
- HRD selector hanya menawarkan portal pada role HRD, sedangkan overview action CURRENT
  juga menerima ADMIN dan FINANCE. Finance tidak boleh menerima payload personal ini pada
  target contract.
- Factory Manager discovery cukup dengan resource Production apa pun, sedangkan executive
  action membutuhkan empat resource spesifik. Resolver Phase 1 harus membuat hasil direct
  route/selector/action konsisten atau menurunkan payload secara aman.
- Proxy adalah optimistic/static gate dan tidak boleh query database. Authorization final
  tetap di DAL/layout, action, dan service dekat sumber data.

## Target Access Decision Matrix (Phase 1+)

Jalankan semua kombinasi per portal. Untuk portal ACTIVE existing, `rolloutKey` tidak
boleh ditambahkan retroaktif. Untuk portal BETA baru, rollout AppSetting default false.

| Case | Session | Role | Module | Resource | Tenant rollout | Action capability | Expected decision |
|---|---|---|---|---|---|---|---|
| A1 | tidak ada | — | — | — | — | — | Deny `NO_SESSION`; login redirect aman. |
| A2 | valid | salah | aktif | granted | enabled/N/A | enabled/N/A | Deny `ROLE` pada selector, direct URL, dan direct action. |
| A3 | valid | benar | disabled/suspended | granted | enabled/N/A | enabled/N/A | Deny `MODULE`; tampilkan module-disabled, bukan empty atau zero dashboard. |
| A4 | valid | benar | aktif | revoked | enabled/N/A | enabled/N/A | Deny `RESOURCE` segera setelah fresh permission read. |
| A5 | valid | benar | aktif | granted | disabled/missing | enabled/N/A | Portal baru deny `ROLLOUT`; selector dan direct URL konsisten, fail-closed. |
| A6 | valid | benar | aktif | granted | enabled/N/A | disabled/missing | Read-only portal tetap dapat dibuka; direct risky action deny `FEATURE`. |
| A7 | valid | benar | aktif | granted | enabled/N/A | enabled | Hanya action yang juga lolos domain guard boleh berjalan online. |
| A8 | valid | benar | aktif | granted | enabled/N/A | enabled/N/A | Portal `PLANNED` tetap deny `PLANNED` dan tidak navigable. |
| A9 | valid ADMIN, permissions=`ALL` | ADMIN | aktif | ALL | disabled/missing | disabled/missing | Tidak bypass rollout dan tidak memperoleh capability aksi berisiko. |
| A10 | Super Admin | — | — | — | — | — | Desktop-required; tidak ada portal tenant. |

### Tenant isolation

- [ ] Tenant context wajib sebelum membaca rollout, permission, atau data portal.
- [ ] AppSetting dibaca dari tenant aktif dan dibatch; missing/error fail-closed untuk portal baru.
- [ ] Tenant A dengan flag enabled tidak mengaktifkan portal Tenant B.
- [ ] Direct action memakai tenant context server, bukan tenant id dari client.
- [ ] Tidak ada test yang memakai database produksi.

### Multi-role selector

- [ ] Gabungan role hanya menambah candidate yang masing-masing lolos role/module/resource.
- [ ] Portal yang sama tampil satu kali dan urutannya deterministik.
- [ ] Revocation pada satu resource hanya menghapus portal terkait.
- [ ] SALES + MARKETING tidak mewarisi Sales Field personal pada CURRENT/target contract.
- [ ] FINANCE + HRD tidak menggabungkan payload atau privacy boundary.
- [ ] Zero portal menghasilkan terminal guidance; tidak redirect `/mobile → /mobile`.

## Portal Contract Scenarios

### Selector and static/optimistic gate

- [ ] `/mobile` dapat dibuka oleh session tenant dan tidak menganggap visibility sebagai authorization.
- [ ] Allowlist canonical diturunkan dari registry pada Phase 1; public paths dan operational API tetap daftar terpisah.
- [ ] Proxy tidak mengimpor Prisma/AppSetting/tenant DB reader.
- [ ] `/sales/mobile` dan subpath tetap redirect ke `/field/sales` dengan query string terjaga.
- [ ] `/maklon/mobile` tidak navigable selama PLANNED/route belum ada.
- [ ] Unknown desktop route pada mobile menuju desktop-required tanpa loop.
- [ ] Login → dashboard → mobile → selector tidak membentuk redirect loop.

### Sales Field

- [ ] SALES dengan SALES module/resource dapat membuka `/field/sales`.
- [ ] MARKETING, termasuk kombinasi SALES + MARKETING, tidak mendapat personal Sales Field.
- [ ] Direct URL tanpa resource ditolak server.
- [ ] Existing order/visit/collection mutation tetap memakai guard/action/service domain; UI visibility bukan security boundary.
- [ ] Offline claim hanya boleh dibuat bila command benar-benar registered, persisten, tenant+user partitioned, dan idempotent.

### Warehouse Mobile

- [ ] WAREHOUSE dengan INVENTORY/resource dapat membuka `/warehouse/mobile`.
- [ ] Incoming, outgoing, dan opname direct route ditolak ketika resource dicabut.
- [ ] Receipt/load/opname mutation tetap online/domain-guarded sesuai perilaku existing.
- [ ] Attachment/API allowlist tidak membuka endpoint API lain.

### Kiosk and Employee

- [ ] Kiosk mempertahankan focus mode tanpa supervisor bottom nav.
- [ ] Kiosk module entitlement dan guard tiap mutation tetap berlaku walau shell dapat dibuka.
- [ ] Employee `/my` menggunakan session employee, tidak session User selector.
- [ ] Logout/user switch tidak membocorkan offline queue antar tenant/user.

### Production Supervisor / Factory Manager

- [ ] PRODUCTION/PLANNING yang sah mendapat surface sesuai resource.
- [ ] Factory Manager hanya menerima executive/read contract yang lolos resource.
- [ ] Factory Manager tidak menerima quick-SPK, material execution, costing, Finance, atau payroll.
- [ ] Maintenance view/approve/reject/assign dipisahkan per capability; portal access saja tidak memberi mutation.
- [ ] Production Insight dan Maintenance sama-sama discoverable.
- [ ] Direct quick-SPK action untuk Factory Manager ditolak walau CTA dimanipulasi client.

### Purchasing Mobile

- [ ] PROCUREMENT/PLANNING yang sah mendapat portal sesuai module/resource.
- [ ] PLANNING hanya melihat PR miliknya; PROCUREMENT melihat antrean PR tim.
- [ ] Antrean memprioritaskan PR, draft PO, PO menunggu receipt, ETA terlewat, dan suggested reorder; PO selesai tidak masuk antrean.
- [ ] Filter URL Semua/PR/Draft PO/Penerimaan/ETA/Reorder mempertahankan Back/Forward dan tepat satu state aktif.
- [ ] Bounded list menampilkan `total` dan `returned` terpisah; total tidak disimpulkan dari sample 10.
- [ ] Detail PR/PO/progres receipt memakai route mobile-safe dan DTO minimum; ID asing/tidak sesuai scope diperlakukan tidak ditemukan.
- [ ] AP count tetap tersedia, tetapi nominal AP, total PO, harga satuan, dan subtotal tidak ada di payload tanpa `feature:view-prices`.
- [ ] Suggested reorder hanya memakai stok internal eligible; customer-owned stock tidak dihitung.
- [ ] Read-only baseline tidak menyalakan approval, PO mutation, goods receipt mutation, atau self-approval path.
- [ ] `feature:mobile-purchasing-actions` disabled menolak direct action setelah capability tersedia.

### Finance Mobile privacy

- [ ] Hanya role/guard Finance yang sah menerima Finance DTO.
- [ ] Payload minimum tidak mengandung bank/account/private ledger detail yang tidak diperlukan.
- [ ] Amount yang tidak diizinkan dihapus dari server payload, bukan disembunyikan dengan CSS.
- [ ] Finance tidak masuk Cache Storage, IndexedDB offline queue, localStorage, atau service-worker business cache.
- [ ] `feature:mobile-finance-actions` disabled menolak direct payment/posting/closing/reconciliation action.
- [ ] Beta tetap read-only: tidak ada payment, posting/void/reverse, close/reopen, atau bulk operation.

### HRD Mobile privacy

- [ ] Target contract: HRD dan ADMIN preview/operasional eksplisit saja; FINANCE tidak menerima daftar nama, cuti, atau absensi.
- [ ] Payroll readiness untuk Finance/Admin berupa agregat non-personal dari DTO terpisah.
- [ ] Payload tidak memuat payroll amount, bank, dokumen HR, disciplinary note, phone/email directory, atau PII yang tidak perlu.
- [ ] HRD tidak masuk offline cache.
- [ ] `feature:mobile-hrd-actions` disabled menolak direct leave/attendance action.
- [ ] Search tidak mengirim seluruh employee directory ke client.

### Admin Mobile Command Center TARGET

- [ ] `mobile.portal.admin.enabled` missing/false: selector dan direct URL deny `ROLLOUT`.
- [ ] Flag true + ADMIN + required module/resource: portal read-only tampil.
- [ ] Non-admin dan Super Admin ditolak pada layout dan action.
- [ ] Module nonaktif tidak di-query dan tidak ditampilkan sebagai angka nol palsu.
- [ ] Tidak ada permission edit, stock adjustment, posting/payment/closing, atau mutation lain pada beta.

### Marketing Supervisor TARGET

- [ ] `mobile.portal.marketing.enabled` missing/false: selector dan direct URL deny `ROLLOUT`.
- [ ] MARKETING yang sah mendapat `/field/marketing`; SALES tidak.
- [ ] Team scope tidak berubah menjadi “milik sales aktif”.
- [ ] Marketing tidak dapat check-in/order sebagai sales lain.
- [ ] Amount tanpa price permission tidak ada di payload.
- [ ] `feature:mobile-marketing-actions` disabled mempertahankan beta read-only.

### Distribution and Maklon TARGET/conditional

- [ ] Distribution hanya muncul bila entry criteria, role/resource, module dependency, dan rollout lolos.
- [ ] Partial module data diberi “tidak tersedia”, bukan nol palsu.
- [ ] Maklon tetap PLANNED/non-navigable sampai pilot disetujui dan route tersedia.
- [ ] Maklon execution membutuhkan explicit `/maklon` resource; role WAREHOUSE saja tidak cukup.
- [ ] Tidak ada inventory mutation atau upload evidence pada read-only beta.

## Shared UX and Reliability Matrix (Phase 2+)

Uji tiap portal root dan representative child route.

| State / invariant | Expected result |
|---|---|
| Heading | Tepat satu H1 per page; shell identity tidak menduplikasi heading content. |
| Navigation | Tepat satu link `aria-current="page"`; planned/unauthorized destination tidak muncul. |
| Touch | Effective target minimal 44×44 px; center dan edge hit-test mengenai interactive ancestor yang benar. |
| Safe area | Header/nav/sticky CTA/toast/FAB memakai inset; row terakhir tidak tertutup. |
| Overflow | Page `scrollWidth <= clientWidth`; hanya contained labeled scroller boleh overflow horizontal. |
| Back | Browser Back kembali ke lokasi sebelumnya; navigasi biasa tidak memakai replace. |
| Empty | Menyatakan tidak ada data, bukan read failure. |
| Expected read failure | Pesan aman + retry; bukan zero dashboard. |
| Unauthorized | Berbeda dari module/rollout/capability disabled dan tidak membocorkan detail. |
| Module disabled | State entitlement eksplisit; tidak menampilkan angka nol palsu. |
| Rollout disabled | Portal beta tidak terlihat dan direct URL ditolak konsisten. |
| Capability disabled | Read-only portal tetap ada; action tersembunyi **dan** direct action ditolak. |
| Offline | Dibedakan dari empty/error; Finance/HRD tidak memakai cached business payload. |
| Slow | Loading/slow feedback tanpa layout shift yang menutup Back/navigation. |
| Stale | Menampilkan generatedAt/terakhir diperbarui dan stale notice. |
| Uncaught error | Error boundary client memberi generic fallback + retry, tanpa server message sensitif. |
| Kiosk | Tetap focus shell; tidak dipindahkan ke bottom-nav supervisor. |

## Authorization and Direct-Denial Checklist

Untuk setiap portal/action yang berubah, test minimal:

- [ ] selector visibility;
- [ ] direct canonical URL;
- [ ] deep link;
- [ ] direct Server Action invocation;
- [ ] role salah;
- [ ] module disabled;
- [ ] resource revoked;
- [ ] rollout disabled bila portal baru;
- [ ] action capability disabled bila risky action;
- [ ] tenant isolation;
- [ ] multi-role;
- [ ] ADMIN behavior tanpa implicit rollout/capability;
- [ ] Super Admin desktop-only;
- [ ] no redirect loop;
- [ ] planned portal non-navigable.

Authorization final harus diuji pada layout/DAL, action, dan service. Menyembunyikan link,
card, atau button tidak dihitung sebagai denial.

## Payload / Count Assertions

- [ ] DTO hanya memuat field yang dibutuhkan mobile page.
- [ ] Finance/HRD sensitive field assertion dilakukan terhadap action/service result sebelum render.
- [ ] Amount yang tidak boleh dilihat bernilai absent, bukan sekadar masked CSS.
- [ ] Setiap bounded list mengembalikan `counts.total` dan `counts.returned` atau ekuivalen yang eksplisit.
- [ ] `total` dihitung dari source of truth, tidak dari `items.length` ketika query memakai `take`.
- [ ] Sort deterministik memakai id sebagai tie-breaker.
- [ ] Partial failure ditandai unavailable; tidak diubah menjadi nol.

## Browser QA Procedure

Untuk D1–D10 dan state relevan:

1. Gunakan fixture sintetis dan test environment; catat commit SHA.
2. Verifikasi selector dan direct denial sebelum membuka data page.
3. Rekam `clientWidth`/`scrollWidth` dan contained scroller.
4. Hit-test pusat serta tepi control penting; uji keyboard, visible focus, dan focus return.
5. Uji browser Back, software keyboard, safe area, bottom-nav/sticky/FAB/toast collision.
6. Uji loading, expected read failure, uncaught error, empty, offline, slow, stale,
   unauthorized, module disabled, rollout disabled, dan capability disabled.
7. Jangan submit transaction production. Screenshot tracked harus bebas identitas/data tenant nyata.

## Regression Test Mapping

Tambahkan/pertahankan test di `src/**/__tests__/`:

- registry uniqueness/path/alias/planned status;
- role + module + resource + rollout decision/reason;
- direct URL dan action denial;
- tenant isolation dan batched fail-closed rollout read;
- multi-role dedupe/order;
- ADMIN tanpa implicit rollout/capability;
- Super Admin desktop-only/no-loop;
- HRD/Finance payload privacy dan no offline cache;
- Factory Manager no-costing/no-SPK + maintenance capability terpisah;
- exactly one H1 dan exactly one `aria-current`;
- loading/error/empty/offline/stale state;
- amount absent dari payload;
- total count bukan `boundedItems.length`.

## Phase Sign-off

| Phase / batch | Commit SHA | Source tests | Lint | Typecheck | Browser/UAT | CI run | Rollout/deploy | Notes |
|---|---|---|---|---|---|---|---|---|
| Phase 0 — UAT baseline | | Docs/source review | N/A | N/A | Historical evidence only; fresh run pending runtime batch | | Not deployed | Runtime unchanged |
| Phase 1 — access contract | | | | | | | | |
| Phase 2 — shared UX | | | | | | | | |
| Admin beta | | | | | | | Off by default | |
| Marketing beta | | | | | | | Off by default | |
| Purchasing enrichment | | | | | | | | |
| Finance enrichment | | | | | | | | |
| HRD enrichment | | | | | | | | |
| Distribution conditional | | | | | | | Off by default | |
| Maklon conditional | | | | | | | PLANNED/off | |
| Telemetry/offline | | | | | | | | |
