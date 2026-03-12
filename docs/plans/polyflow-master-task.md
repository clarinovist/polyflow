# PolyFlow — Master Task Checklist

> Auto-generated dari consolidated implementation plan.
> Update status item di sini saat pengerjaan berlangsung.

---

## 🔴 Priority 1: Foundation & Observability

### Error Tracking (Sentry)
- [x] 1.1 Install `@sentry/nextjs` dan jalankan wizard
- [x] 1.2 Buat `src/lib/sentry.ts` — inisialisasi & helper `captureException`
- [x] 1.3 Update `build.yml` CI/CD untuk mengirim *Sentry sourcemaps* saat proses `next build`
- [x] 1.4 Pasang global `<ErrorBoundary>` di `src/app/layout.tsx`

### Security Hardening
- [x] 1.5 Buat `src/lib/rate-limit.ts` — in-memory sliding window rate limiter
- [x] 1.6 Buat `src/middleware.ts` — header `X-Forwarded-For` proxy support, rate limiting + security headers
- [x] 1.7 Buat `src/lib/sanitize.ts` — utilitas `sanitizeHtml()`
- [x] 1.8 Refactor Zod Schemas di server actions (inventory, sales, production, purchasing) gunakan `.transform(sanitizeHtml)` pada free-text fields

---

## 🟠 Priority 2: Testing Infrastructure & CI/CD Gate

### Test Infrastructure Setup
- [x] 2.1 Update `vitest.config.ts` — tambah `tests/**` pattern & setup file
- [x] 2.2 Buat `tests/setup.ts` — global mock Prisma, next/cache, audit
- [x] 2.3 Buat `tests/helpers/createMockPrisma.ts` — mock helper reusable

### Unit Tests
- [x] 2.4 Buat `src/services/__tests__/accounting-service.test.ts`
  - [x] Test auto-journal dari GR, Production, Sales
  - [x] Test journal balance validation (debit = credit)
  - [x] Test void journal entry
- [x] 2.5 Buat `src/services/__tests__/production-service.test.ts`
  - [x] Test backflush material consumption
  - [x] Test scrap recording & GL impact
  - [x] Test production order state transitions
- [x] 2.6 Buat `src/services/__tests__/costing-service.test.ts`
  - [x] Test COGM calculation
  - [x] Test WIP valuation
  - [x] Test handling missing data gracefully
- [x] 2.7 Buat `src/lib/__tests__/rate-limit.test.ts`

### CI/CD Gate
- [x] 2.8 Update `.github/workflows/ci-cd.yml` — tambah coverage threshold
- [x] 2.9 Update `.github/workflows/ci-cd.yml` — tambah nginx syntax check step

---

## 🟡 Priority 3: Admin Operations & Audit Log UI

### Audit Log UI
- [x] 3.1 Buat `src/actions/audit-log.ts` — `getAuditLogs`, `getAuditLogDetail`, `getAuditLogStats`
- [x] 3.2 Buat `src/app/admin/audit-logs/page.tsx` — halaman tabel dengan filter
- [x] 3.3 Buat `src/components/admin/AuditLogTable.tsx` — client component tabel
- [x] 3.4 Buat `src/components/admin/AuditLogDetailDialog.tsx` — dialog JSON diff
- [x] 3.5 Tambahkan `logActivity()` di `src/actions/purchasing.ts` (create, update, approve)
- [x] 3.6 Tambahkan `logActivity()` di `src/actions/finance.ts` (journal posting, payment)

### Extended Health & Maintenance
- [x] 3.7 Buat `/api/cron/cleanup` action untuk purge data log lama (`AuditLog` > 90d, `Notification` > 30d)
- [x] 3.8 Perluasan `src/app/api/health/route.ts` — cek DB, memory, disk, cronjob
- [x] 3.9 Buat `src/app/admin/system-health/page.tsx` — dashboard metrik sistem
- [x] 3.10 Buat `src/app/api/admin/diagnostics/route.ts` — full diagnostic endpoint

---

## 🟢 Priority 4: Smart Error Handling & Admin Operations

### Smart Error Handling
- [x] 4.1 Buat `src/lib/retry.ts` — exponential backoff utility
- [x] 4.2 Buat `src/lib/error-map.ts` — mapping error ke pesan user-friendly
- [x] 4.3 Tambahkan per-module Error Boundaries di layout/halaman kritis

### Admin Operations
- [x] 4.4 Buat `src/app/admin/credits/page.tsx` — Credit Management UI

---

## 🔵 Priority 5: Notification System & Infrastructure

### Notification System
- [x] 5.1 Update `prisma/schema.prisma` — tambah model `Notification` dan enum `NotificationType`
- [x] 5.2 Jalankan migrasi: `npx prisma migrate dev --name add_notifications`
- [x] 5.3 Install dependencies: `npm install resend @react-email/components @react-email/render`
- [x] 5.4 Buat `src/services/notification-service.ts`
- [x] 5.5 Buat `src/actions/notifications.ts` — server actions
- [x] 5.6 Buat `src/components/layout/notification-bell.tsx` — bell icon + dropdown (Gunakan SWR/React Query `revalidateOnFocus` dibanding polling interval)
- [ ] 5.7 Trigger `LOW_STOCK` di `src/services/inventory-service.ts`
- [ ] 5.8 Trigger `OVERDUE_AP` di `src/services/purchasing/purchasing-service.ts`
- [ ] 5.9 Trigger `OVERDUE_AR` di `src/services/sales/orders-service.ts`

### Infrastructure
- [x] 5.10 Buat `nginx/polyflow.conf` — copy config dari VPS ke repo
- [x] 5.11 Update `entrypoint.sh` — tambah `pg_dump` sebelum `prisma migrate deploy`
- [x] 5.12 Implementasi Auto-Changelog Banner — dismissable "What's New" popup
