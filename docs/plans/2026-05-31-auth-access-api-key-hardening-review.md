# PolyFlow Auth, Access Policy, and API Key Hardening Review

Tanggal: 2026-05-31
Status: Draft review / implementation planning
Scope: validasi temuan arsitektur auth, role access, multi-tenant, timeout session, dan API key validation.

---

## Ringkasan Eksekutif

Secara umum fondasi arsitektur PolyFlow sudah cukup kuat:

- App Router sudah dipisahkan per workspace/domain (`dashboard`, `warehouse`, `production`, `finance`, `sales`, `planning`, `admin`).
- Service layer sudah matang, terutama domain produksi yang memakai facade `ProductionService` ke sub-service order/execution/material/cost/issue.
- Multi-tenant data access sudah memakai `proxy.ts` untuk inject tenant subdomain secara aman, `withTenant`/`withTenantRoute`, dan Prisma proxy berbasis `AsyncLocalStorage`.
- Banyak action kritikal memakai pola `withTenant + safeAction + zod + revalidatePath`.

Namun ada 3 area hardening yang paling worth dikerjakan berikutnya:

1. Optimasi API key validation agar tidak scan semua key aktif.
2. Sentralisasi access policy agar rule tidak drift antara `auth.config.ts` dan layout domain.
3. Harmonisasi timeout policy agar perilaku client/server konsisten.

---

## Temuan Terverifikasi

### 1. Root Layout dan Workspace Layout

**Status:** valid dengan catatan.

Root layout membungkus provider dan komponen global:

- `SessionProvider`
- `ThemeProvider`
- `PolyflowChatWidget`
- `AutoChangelogBanner`
- `Toaster`
- `SessionTimeoutHandler`

File:

- `src/app/layout.tsx`

Workspace layout memang melakukan auth/role guard, khususnya:

- `src/app/finance/layout.tsx`
- `src/app/planning/layout.tsx`
- `src/app/warehouse/layout.tsx`
- `src/app/production/layout.tsx`
- `src/app/sales/layout.tsx`

Catatan penting:

- `src/app/dashboard/layout.tsx` lebih fokus ke auth dan sidebar permission, bukan strict role enforcement.
- `src/app/admin/layout.tsx` tidak eksplisit check role di layout; admin isolation terutama datang dari `src/proxy.ts` + `src/auth.config.ts` authorized callback.

### 2. Auth dan Tenant Resolution

**Status:** valid.

`src/auth.config.ts` berisi:

- `authorized` callback untuk route isolation.
- super-admin isolation.
- tenant role isolation.
- JWT fields: `role`, `id`, `rememberMe`, `isSuperAdmin`, `lastActive`.

`src/auth.ts` berisi:

- Credentials provider.
- tenant resolution dari `x-tenant-subdomain` atau host.
- fallback default DB jika tidak ada subdomain.

`src/proxy.ts` juga penting karena:

- menghapus client-provided `x-tenant-subdomain` untuk mencegah spoofing.
- mengekstrak tenant dari hostname.
- menyisipkan header tenant internal ke request.

### 3. Multi-Tenant Data Access

**Status:** valid dengan caveat.

Komponen utama:

- `src/lib/core/tenant.ts`
  - `extractSubdomain`
  - `resolveTenantContext`
  - `withTenant`
  - `withTenantRoute`
- `src/lib/core/prisma.ts`
  - `tenantContext` berbasis `AsyncLocalStorage`
  - cache Prisma tenant DB client
  - global Prisma proxy

Caveat:

- `resolveTenantContext` saat gagal lookup tenant karena error DB akan log error lalu return `NOT_FOUND` jika tidak ada `targetDbUrl`.
- Ini aman untuk UX sederhana, tapi dapat menyamarkan DB outage sebagai tenant tidak ditemukan.
- Hardening lanjutan bisa menambah result type seperti `ERROR` atau melempar typed error agar observability lebih akurat.

### 4. API Key Validation Masih O(n)

**Status:** valid, tetapi rekomendasi perlu diperjelas.

File:

- `src/services/auth/api-key-service.ts`

Saat ini:

- `createApiKey()` sudah membuat plain key lalu menyimpan SHA-256 hash ke DB.
- Kolom `ApiKey.key` di Prisma schema sudah `@unique`, sehingga ada unique index.
- `validateApiKey()` tetap melakukan `findMany({ where: { isActive: true } })`, lalu loop semua active key dan compare satu per satu.

Masalah aktual:

- Bukan karena key belum di-hash.
- Bukan karena kolom belum terindeks.
- Masalahnya adalah validator belum memanfaatkan lookup langsung via hashed key.

Rekomendasi tepat:

1. Hitung `hashedInput = sha256(inputKey)`.
2. Query langsung:
   - `prisma.apiKey.findUnique({ where: { key: hashedInput }, include: { user: true } })`
3. Validasi `isActive` dan `expiresAt` setelah record ditemukan.
4. Jika masih perlu mendukung legacy plaintext key, tambahkan fallback scan sementara, lalu buat migration/cleanup untuk menghapus legacy support.

Risiko jika dibiarkan:

- Latensi validasi API key naik linear seiring jumlah active key.
- API endpoint yang sering dipanggil dengan key bisa menjadi bottleneck.

### 5. Access Policy Tersebar di Beberapa Layer

**Status:** valid.

Layer saat ini:

- `src/auth.config.ts` authorized callback
- workspace layout guards:
  - `src/app/finance/layout.tsx`
  - `src/app/planning/layout.tsx`
  - `src/app/warehouse/layout.tsx`
  - `src/app/production/layout.tsx`
  - `src/app/sales/layout.tsx`
  - `src/app/admin/layout.tsx`
- permission map runtime/default:
  - `src/actions/admin/permissions.ts`

Risiko:

- Rule bisa drift antara route-level middleware/proxy dan layout-level guard.
- Role baru atau workspace baru perlu update banyak tempat.
- Sulit memastikan konsistensi redirect target.

Rekomendasi:

Buat modul policy tunggal, misalnya:

- `src/lib/auth/access-policy.ts`

Isi awal yang disarankan:

```ts
export type WorkspaceKey =
  | 'admin'
  | 'dashboard'
  | 'warehouse'
  | 'production'
  | 'finance'
  | 'sales'
  | 'planning';

export const WORKSPACE_ACCESS_POLICY = {
  admin: ['SUPER_ADMIN'],
  dashboard: ['ADMIN', 'FINANCE', 'SALES', 'PLANNING', 'PROCUREMENT'],
  warehouse: ['ADMIN', 'WAREHOUSE', 'PRODUCTION', 'PLANNING'],
  production: ['ADMIN', 'PRODUCTION', 'PLANNING'],
  finance: ['ADMIN', 'FINANCE'],
  sales: ['ADMIN', 'SALES'],
  planning: ['ADMIN', 'PLANNING', 'PROCUREMENT'],
} as const;
```

Lalu expose helper:

- `getWorkspaceFromPath(pathname)`
- `canAccessWorkspace(user, workspace)`
- `getDefaultWorkspaceForRole(user)`
- `getUnauthorizedRedirect(user, requestedWorkspace)`

Pemakai:

- `auth.config.ts` authorized callback.
- workspace layouts.
- sidebar/menu filtering jika relevan.

### 6. Timeout Policy Belum Selaras

**Status:** valid.

Saat ini:

- Client idle logout:
  - `src/components/auth/SessionTimeoutHandler.tsx`
  - default `30 * 60 * 1000` atau 30 menit.
- Server JWT idle invalidation:
  - `src/auth.config.ts`
  - `TWO_HOURS = 2 * 60 * 60` untuk user non-remember.
- NextAuth maxAge:
  - `src/auth.ts`
  - 30 hari.

Risiko:

- User bisa logout di client setelah 30 menit, tapi token server baru invalid setelah 2 jam.
- Perilaku berbeda antar tab, reload, background activity, dan request server.
- Sulit mengubah kebijakan security karena nilai tersebar.

Rekomendasi:

Buat source-of-truth config, misalnya:

- `src/lib/auth/session-policy.ts`

Isi awal:

```ts
export const SESSION_POLICY = {
  idleTimeoutMs: 30 * 60 * 1000,
  idleTimeoutSeconds: 30 * 60,
  rememberMeMaxAgeSeconds: 30 * 24 * 60 * 60,
  defaultMaxAgeSeconds: 30 * 24 * 60 * 60,
} as const;
```

Lalu gunakan di:

- `SessionTimeoutHandler`
- `auth.config.ts` JWT callback
- `auth.ts` NextAuth `session.maxAge`

### 7. `getMyPermissions()` di Admin Layout Tidak Dipakai

**Status:** valid.

File:

- `src/app/admin/layout.tsx`

Saat ini:

```ts
await getMyPermissions();
```

Hasilnya tidak dipakai.

Catatan:

- Untuk role `ADMIN`, `getMyPermissions()` return `'ALL'` sebelum query permissions, sehingga overhead DB permission relatif kecil.
- Tapi tetap ada overhead action/auth/tenant wrapper dan potensi side effect kalau logic berubah.

Rekomendasi:

- Jika tidak ada side effect yang dibutuhkan, hapus call ini.
- Jika sidebar admin butuh permission di masa depan, simpan hasilnya dan pass eksplisit ke component.

---

## Prioritas Implementasi yang Disarankan

### P0 — API Key Validation Optimization

Alasan:

- High impact, low complexity.
- Tidak mengubah UX.
- Tidak menyentuh policy besar.

Scope minimal:

- Ubah `validateApiKey()` agar query direct by hashed key.
- Tambah test untuk:
  - valid hashed key.
  - inactive key.
  - expired key.
  - invalid key tidak scan semua active key jika legacy fallback dimatikan.

### P1 — Access Policy Centralization

Alasan:

- Mengurangi drift route/layout.
- Mempermudah role baru dan workspace baru.

Scope minimal:

- Tambah `src/lib/auth/access-policy.ts`.
- Refactor `auth.config.ts` dan domain layouts bertahap.
- Tambah unit test policy matrix.

### P1 — Session Timeout Policy Harmonization

Alasan:

- Konsistensi UX dan security.
- Mudah diverifikasi dengan unit test config/helper.

Scope minimal:

- Tambah `src/lib/auth/session-policy.ts`.
- Gunakan config di client timeout dan JWT callback.
- Pastikan remember-me behavior tetap sesuai desain.

### P2 — Admin Layout Permission Cleanup

Alasan:

- Minor overhead / clarity cleanup.
- Aman jika tidak ada dependency tersembunyi.

Scope minimal:

- Hapus unused `getMyPermissions()` call dari admin layout, atau pakai hasilnya jika memang dibutuhkan sidebar.

---

## Proposed Implementation Batches

### Batch 1: API Key Validation Hardening

Files:

- `src/services/auth/api-key-service.ts`
- `src/services/auth/__tests__/api-key-service.test.ts` atau lokasi test existing yang sesuai

Verification:

```bash
npx vitest run src/services/auth/__tests__/api-key-service.test.ts
npm run lint -- src/services/auth/api-key-service.ts src/services/auth/__tests__/api-key-service.test.ts
npx tsc --noEmit
```

### Batch 2: Session Policy Config

Files:

- `src/lib/auth/session-policy.ts`
- `src/components/auth/SessionTimeoutHandler.tsx`
- `src/auth.config.ts`
- `src/auth.ts`

Verification:

```bash
npm run lint -- src/lib/auth/session-policy.ts src/components/auth/SessionTimeoutHandler.tsx src/auth.config.ts src/auth.ts
npx tsc --noEmit
```

### Batch 3: Access Policy Centralization

Files:

- `src/lib/auth/access-policy.ts`
- `src/auth.config.ts`
- workspace layout files under `src/app/*/layout.tsx`
- policy tests

Verification:

```bash
npx vitest run src/lib/auth/__tests__/access-policy.test.ts
npm run lint
npx tsc --noEmit
```

---

## Ship Decision

**Recommendation:** ship with caveats.

Temuan dalam audit valid dan berguna. Tidak ada indikasi blocker langsung dari review ini, tetapi API key validation dan policy drift layak dijadikan prioritas hardening berikutnya sebelum role/workspace bertambah kompleks.
