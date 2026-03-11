# High Priority Improvements — Implementation Plan

Implement the 4 high-priority areas identified in the PolyFlow codebase analysis: **Testing**, **Security**, **Notifications**, and **Audit Log UI**.

---

## User Review Required

> [!IMPORTANT]
> **Notification model** akan menambah tabel baru di database. Perlu `prisma migrate dev` setelah implementasi.

> [!WARNING]
> **Rate limiting** akan mempengaruhi semua request. Kita set default yang konservatif (100 req/min per IP) dan bisa diatur via environment variable.

---

## Proposed Changes

### 1. Testing Coverage

Vitest sudah terinstall (`vitest@^4.0.18`), config ada di [vitest.config.ts](file:///root/polyflow/vitest.config.ts). Test include pattern: `src/**/*.test.ts`. Saat ini hanya **~10 test files** yang kebanyakan masih stub.

#### [MODIFY] [vitest.config.ts](file:///root/polyflow/vitest.config.ts)
- Tambahkan `tests/**/*.test.ts` ke include pattern (saat ini hanya `src/**`)
- Tambahkan setup file untuk mock Prisma

#### [NEW] [tests/setup.ts](file:///root/polyflow/tests/setup.ts)
- Global test setup: mock Prisma client
- Mock `next/cache` (`revalidatePath`)
- Mock `@/lib/audit` (`logActivity`)
- Helper `createMockPrisma()` untuk consistent mocking

#### [NEW] [src/services/\_\_tests\_\_/accounting-service.test.ts](file:///root/polyflow/src/services/__tests__/accounting-service.test.ts)
- Test auto-journal creation dari GR, Production, Sales
- Test journal balance validation (debit = credit)
- Test void journal entry

#### [NEW] [src/services/\_\_tests\_\_/production-service.test.ts](file:///root/polyflow/src/services/__tests__/production-service.test.ts)  
- Test backflush material consumption
- Test scrap recording & GL impact
- Test production order state transitions

#### [NEW] [src/services/\_\_tests\_\_/costing-service.test.ts](file:///root/polyflow/src/services/__tests__/costing-service.test.ts)
- Test COGM calculation
- Test WIP valuation
- Test handling missing data gracefully

#### [MODIFY] [.github/workflows/ci-cd.yml](file:///root/polyflow/.github/workflows/ci-cd.yml)
- Add coverage threshold gate (e.g., fail build if coverage drops below baseline)

---

### 2. Security Hardening

Saat ini tidak ada middleware file. Auth menggunakan `next-auth@v5-beta`. Server Actions sudah dilindungi Zod validation.

#### [NEW] [src/lib/rate-limit.ts](file:///root/polyflow/src/lib/rate-limit.ts)
- In-memory rate limiter menggunakan sliding window algorithm
- Configurable via env: `RATE_LIMIT_MAX` (default 100), `RATE_LIMIT_WINDOW_MS` (default 60000)
- Export `rateLimit(ip: string): { success: boolean, remaining: number }`
- Untuk production bisa upgrade ke Redis-backed

#### [NEW] [src/middleware.ts](file:///root/polyflow/src/middleware.ts)
- Rate limiting check pada semua API/action routes
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Content-Security-Policy`
- Return `429 Too Many Requests` jika rate limit exceeded

#### [NEW] [src/lib/sanitize.ts](file:///root/polyflow/src/lib/sanitize.ts)
- `sanitizeHtml(input: string): string` — strip dangerous HTML tags
- `sanitizeObject(obj: Record<string, unknown>): Record<string, unknown>` — recursive sanitizer  
- Digunakan di Server Actions yang menerima free-text input (notes, descriptions, references)

#### [MODIFY] [src/actions/inventory.ts](file:///root/polyflow/src/actions/inventory.ts)
- Apply `sanitize()` pada `reference`/`notes` fields di transfer & adjustment actions

#### [MODIFY] [src/actions/production.ts](file:///root/polyflow/src/actions/production.ts)
- Apply `sanitize()` pada `notes` field di production order actions

#### [MODIFY] [src/actions/sales.ts](file:///root/polyflow/src/actions/sales.ts)
- Apply `sanitize()` pada `notes` field

#### [MODIFY] [src/actions/purchasing.ts](file:///root/polyflow/src/actions/purchasing.ts)
- Apply `sanitize()` pada `notes` field

---

### 3. Notification System

Belum ada `Notification` model atau infrastruktur email. `resend` dan `react-email` akan diinstall.

#### [MODIFY] [prisma/schema.prisma](file:///root/polyflow/prisma/schema.prisma)
- Tambah model `Notification`:
```prisma
model Notification {
  id          String             @id @default(uuid())
  userId      String
  type        NotificationType
  title       String
  message     String
  link        String?            // URL to navigate to
  isRead      Boolean            @default(false)
  entityType  String?
  entityId    String?
  createdAt   DateTime           @default(now())
  user        User               @relation(fields: [userId], references: [id])

  @@index([userId, isRead])
  @@index([createdAt])
}

enum NotificationType {
  LOW_STOCK
  OVERDUE_AR
  OVERDUE_AP
  PO_APPROVAL
  PRODUCTION_COMPLETE
  DELIVERY_READY
  SYSTEM
}
```

#### [NEW] [src/services/notification-service.ts](file:///root/polyflow/src/services/notification-service.ts)
- `createNotification(params)` — create single notification
- `createBulkNotifications(params)` — notify multiple users (e.g., all WAREHOUSE users for low stock)
- `markAsRead(id)`, `markAllAsRead(userId)`
- `getUnreadCount(userId)`
- `getNotifications(userId, { page, limit, filter })`

#### [NEW] [src/actions/notifications.ts](file:///root/polyflow/src/actions/notifications.ts)
- Server Actions: `getMyNotifications`, `markNotificationRead`, `markAllRead`, `getUnreadCount`

#### [NEW] [src/components/layout/notification-bell.tsx](file:///root/polyflow/src/components/layout/notification-bell.tsx)
- Bell icon di header dengan unread badge count
- Dropdown panel menampilkan notifikasi terbaru
- Click item → navigate ke link terkait
- "Mark all as read" action
- Real-time polling setiap 30 detik (atau upgrade ke WebSocket nanti)

#### [MODIFY] [src/services/inventory-service.ts](file:///root/polyflow/src/services/inventory-service.ts)
- Trigger notifikasi LOW_STOCK saat stock turun di bawah `minStockAlert`

#### [MODIFY] [src/services/purchasing/purchasing-service.ts](file:///root/polyflow/src/services/purchasing)
- Trigger notifikasi OVERDUE_AP saat invoice melewati due date

#### [MODIFY] [src/services/sales/orders-service.ts](file:///root/polyflow/src/services/sales/orders-service.ts)
- Trigger notifikasi OVERDUE_AR saat sales invoice overdue

---

### 4. Audit Log Viewer UI

`AuditLog` model sudah ada di [schema.prisma](file:///root/polyflow/prisma/schema.prisma#L569-L579). Fungsi `logActivity` sudah ada di [audit.ts](file:///root/polyflow/src/lib/audit.ts) dan sudah dipakai di beberapa services.

#### [NEW] [src/actions/audit-log.ts](file:///root/polyflow/src/actions/audit-log.ts)
- `getAuditLogs({ page, limit, userId, entityType, action, dateFrom, dateTo })`
- `getAuditLogDetail(id)` — include user info dan parsed JSON changes
- `getAuditLogStats()` — count by action type, entity type (untuk chart)

#### [NEW] [src/app/admin/audit-logs/page.tsx](file:///root/polyflow/src/app/admin/audit-logs/page.tsx)
- Tabel audit log dengan kolom: Timestamp, User, Action, Entity Type, Entity ID, Details
- Filter bar: Date range, User dropdown, Entity type dropdown, Action type dropdown
- Pagination (cursor-based)

#### [NEW] [src/components/admin/AuditLogTable.tsx](file:///root/polyflow/src/components/admin/AuditLogTable.tsx)
- Client component tabel audit log
- Row click → detail dialog

#### [NEW] [src/components/admin/AuditLogDetailDialog.tsx](file:///root/polyflow/src/components/admin/AuditLogDetailDialog.tsx)
- Dialog menampilkan detail perubahan
- JSON diff view (before/after) jika `changes` field tersedia
- Link ke entity terkait

#### [MODIFY] [src/actions/purchasing.ts](file:///root/polyflow/src/actions/purchasing.ts)
- Tambah `logActivity()` calls pada PO create, update, approve

#### [MODIFY] [src/actions/finance.ts](file:///root/polyflow/src/actions/finance.ts)
- Tambah `logActivity()` calls pada journal posting, payment recording

---

## Verification Plan

### Automated Tests

**Run all tests:**
```bash
cd /root/polyflow && npm run test:run
```

**Run with coverage:**
```bash
cd /root/polyflow && npm run test:coverage
```

**Specific test suites:**
```bash
# Accounting tests
cd /root/polyflow && npx vitest run src/services/__tests__/accounting-service.test.ts

# Production tests  
cd /root/polyflow && npx vitest run src/services/__tests__/production-service.test.ts

# Costing tests
cd /root/polyflow && npx vitest run src/services/__tests__/costing-service.test.ts

# Rate limit tests
cd /root/polyflow && npx vitest run src/lib/__tests__/rate-limit.test.ts

# Notification service tests
cd /root/polyflow && npx vitest run src/services/__tests__/notification-service.test.ts
```

**Build verification (memastikan no TypeScript errors):**
```bash
cd /root/polyflow && npx tsc --noEmit
```

### Manual Verification

> [!NOTE]
> Beberapa item memerlukan verifikasi manual karena melibatkan UI dan database. Mohon konfirmasi apakah bisa deploy ke staging untuk testing.

1. **Security Headers** — Jalankan `curl -I https://polyflow.uk` dan verifikasi header `X-Frame-Options`, `X-Content-Type-Options`, dll. muncul di response.

2. **Rate Limiting** — Jalankan request burst via `for i in $(seq 1 120); do curl -s -o /dev/null -w "%{http_code}\n" https://polyflow.uk/api/health; done` dan verifikasi response `429` muncul setelah threshold.

3. **Notification Bell** — Login ke dashboard, cek bell icon muncul di header. Trigger notifikasi (misal: kurangi stock di bawah threshold) dan verifikasi notifikasi muncul.

4. **Audit Log Viewer** — Login sebagai ADMIN, navigasi ke `/admin/audit-logs`. Lakukan beberapa operasi (create product, transfer stock), lalu verifikasi muncul di audit log.
# High Priority Improvements — Task Tracker

## Priority 1: Testing Coverage
- [ ] 1.1 Setup test infrastructure (setup files, mocks, test helpers)
- [ ] 1.2 Unit tests for `InventoryService` (transfer, adjustment, FIFO)
- [ ] 1.3 Unit tests for `AccountingService` (journal posting, auto-journal)
- [ ] 1.4 Unit tests for `ProductionService` (backflush, execution)
- [ ] 1.5 Unit tests for `MRP Service` (BOM explosion, make-vs-buy)
- [ ] 1.6 Unit tests for `CostingService` (COGM, WIP valuation)
- [ ] 1.7 Integration tests for critical Server Actions (inventory, production, finance)
- [ ] 1.8 Add CI coverage threshold gate to GitHub Actions

## Priority 2: Security Hardening
- [ ] 2.1 Rate limiting middleware (per IP/per tenant)
- [ ] 2.2 XSS input sanitization utility + apply to text input fields
- [ ] 2.3 CSRF protection audit (verify Server Actions coverage)
- [ ] 2.4 Security headers middleware (CSP, X-Frame-Options, etc.)

## Priority 3: Notification System
- [ ] 3.1 Create `Notification` Prisma model
- [ ] 3.2 Create `NotificationService` (create, mark read, bulk mark)
- [ ] 3.3 Notification bell component in layout header
- [ ] 3.4 Notification dropdown panel UI
- [ ] 3.5 Auto-generate notifications from key events (low stock, overdue AP/AR, PO approval needed)
- [ ] 3.6 Email notification integration (Resend + React Email templates)

## Priority 4: Audit Log Viewer
- [ ] 4.1 Audit Log server action (get logs with filtering/pagination)
- [ ] 4.2 Audit Log viewer page (`/dashboard/audit-logs` or `/admin/audit-logs`)
- [ ] 4.3 Filters: date range, user, entity type, action type
- [ ] 4.4 Detail dialog showing before/after changes (JSON diff)
- [ ] 4.5 Extend `logActivity` usage to more actions (purchasing, finance)
# Panduan Implementasi Lokal: PolyFlow High Priority Tasks

Dokumen ini berisi panduan teknis langkah demi langkah untuk mengimplementasikan 4 fitur prioritas tinggi di *local development environment* Anda.

---

## 1. Testing Coverage 🧪

### 1.1 Setup Infra Testing

1. Tambahkan environment variable khusus test:
   Buat file `.env.test`:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/polyflow_test"
   ```

2. Update `vitest.config.ts`:
   ```typescript
   import { defineConfig } from 'vitest/config';
   import react from '@vitejs/plugin-react';
   import path from 'path';

   export default defineConfig({
     plugins: [react()],
     test: {
       environment: 'node',
       globals: true,
       setupFiles: ['./tests/setup.ts'], // <-- TAMBAHKAN INI
       include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'], // <-- TAMBAHKAN tests/
       alias: {
         '@': path.resolve(__dirname, './src'),
       },
       coverage: {
         provider: 'v8',
         reporter: ['text', 'json', 'html'],
       },
     },
   });
   ```

3. Buat file `tests/setup.ts`:
   ```typescript
   import { vi } from 'vitest';

   // Mock Prisma Client
   vi.mock('@/lib/prisma', () => ({
     prisma: {
       inventory: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
       $transaction: vi.fn((callback) => callback(global.prismaMock)),
     }
   }));

   // Mock Server Actions revalidation
   vi.mock('next/cache', () => ({
     revalidatePath: vi.fn(),
   }));
   ```

### 1.2 Setup CI Coverage Gate

1. Edit `.github/workflows/ci-cd.yml`:
   ```yaml
   - name: Run Tests with Coverage
     run: npm run test:coverage
     
   # Opsional: tambahkan pengecekan threshold dsb.
   ```

---

## 2. Security Hardening 🔒

### 2.1 Buat Limit Rate utility

1. Buat file `src/lib/rate-limit.ts`:
   Membuat in-memory rate limiter sederhana menggunakan `Map`:
   ```typescript
   const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();
   
   export function rateLimit(ip: string, limit = 100, windowMs = 60000) {
     const now = Date.now();
     const record = rateLimitMap.get(ip);
     
     if (!record || record.expiresAt < now) {
       rateLimitMap.set(ip, { count: 1, expiresAt: now + windowMs });
       return { success: true, count: 1 };
     }
     
     if (record.count >= limit) {
       return { success: false, count: record.count };
     }
     
     record.count += 1;
     return { success: true, count: record.count };
   }
   ```

### 2.2 Buat Middleware File

1. Buat file `src/middleware.ts` di root `src/`:
   ```typescript
   import { NextResponse } from 'next/server';
   import type { NextRequest } from 'next/server';
   import { rateLimit } from '@/lib/rate-limit';

   export function middleware(request: NextRequest) {
     // 1. Rate Limiting (Khusus endpoint API / Server Actions API)
     const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
     const { success } = rateLimit(ip);
     
     if (!success) {
       return new NextResponse("Too Many Requests", { status: 429 });
     }

     const response = NextResponse.next();

     // 2. Security Headers
     response.headers.set('X-Frame-Options', 'DENY');
     response.headers.set('X-Content-Type-Options', 'nosniff');
     response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
     response.headers.set('X-XSS-Protection', '1; mode=block');

     return response;
   }

   export const config = {
     matcher: [
       // Apply ke API dan halaman pages, abaikan static assets
       '/((?!_next/static|_next/image|favicon.ico).*)',
     ],
   };
   ```

### 2.3 Input Sanitization

1. Install DOMPurify (jika pakai library): `npm i isomorphic-dompurify`
2. Atau replace manual `<` dan `>` di notes/referensi untuk mencegah XSS.

---

## 3. Notification System (Resend) 🔔

### 3.1 Install Dependencies

```bash
npm install resend @react-email/components @react-email/render
```

### 3.2 Update Prisma Schema

Di `prisma/schema.prisma` tambahkan:

```prisma
model Notification {
  id          String             @id @default(uuid())
  userId      String
  type        NotificationType
  title       String
  message     String
  link        String?            
  isRead      Boolean            @default(false)
  entityType  String?
  entityId    String?
  createdAt   DateTime           @default(now())
  user        User               @relation(fields: [userId], references: [id])

  @@index([userId, isRead])
  @@index([createdAt])
}

enum NotificationType {
  LOW_STOCK
  OVERDUE_AR
  OVERDUE_AP
  SYSTEM
}
```

Jalankan `npx prisma migrate dev --name add_notifications`.

### 3.3 Konfigurasi Resend

1. Masukkan API key di `.env`: `RESEND_API_KEY=re_123456789...`
2. Buat file `src/lib/email.ts`:
   ```typescript
   import { Resend } from 'resend';
   import { render } from '@react-email/render';
   import { LowStockEmail } from '@/emails/LowStockEmail'; // (Buat React component ini nanti)

   const resend = new Resend(process.env.RESEND_API_KEY);

   export async function sendLowStockEmail(to: string, product: string, location: string) {
     const html = await render(LowStockEmail({ product, location }));
     await resend.emails.send({
       from: 'Polyflow Notifications <onboarding@resend.dev>', // Ganti saat production
       to,
       subject: `[ALERT] Low Stock: ${product}`,
       html
     });
   }
   ```

### 3.4 Buat Notification Service

Buat `src/services/notification-service.ts`:
1. Buat method `create({ userId, type, title, message, link })`
2. Modifikasi `src/services/inventory-service.ts` agar memanggil method di atas bila stok `< minStockAlert`.

---

## 4. Audit Log Viewer 📋

### 4.1 Buat Server Action

Di `src/actions/audit-log.ts`:
```typescript
'use server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function getAuditLogs(page = 1, limit = 50) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') throw new Error("Unauthorized");
  
  const skip = (page - 1) * limit;
  const logs = await prisma.auditLog.findMany({
    take: limit,
    skip,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { email: true, name: true } } }
  });
  const total = await prisma.auditLog.count();
  
  return { logs, total, totalPages: Math.ceil(total / limit) };
}
```

### 4.2 Buat Viewer Page

Buat UI di `src/app/admin/audit-logs/page.tsx`:
1. Buat Tabel Data yang menampilkan:
   - Tanggal & Waktu (`createdAt`)
   - User Email/Name
   - Action (`CREATE`, `UPDATE`, `DELETE`)
   - Entity (`ProductVariant`, `StockMovement`)
2. Tombol "Detail":
   - Buka Modals dengan `<pre>{JSON.stringify(JSON.parse(log.changes), null, 2)}</pre>`

### 4.3 Trigger Log Lebih Banyak

Gunakan fungsi `logActivity` di dalam:
- `src/actions/finance.ts` untuk merekam `UPDATE_JOURNAL`
- `src/actions/purchasing.ts` untuk merekam `APPROVE_PO`
