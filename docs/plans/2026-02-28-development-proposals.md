# 🚀 PolyFlow — Usulan Pengembangan Baru

> Old plans sudah di-delete. Ini adalah **proposal segar** berdasarkan kondisi terkini codebase (Feb 28, 2026).

---

## 🟢 Tier 1 — Quick Impact (1–2 hari per item)

Fitur yang langsung terasa impactnya oleh user sehari-hari.

---

### 1. 🔔 Notification Center + Activity Feed

**Kenapa?** Saat ini semua alert (low stock, overdue AP/AR, WO belum selesai) hanya terlihat kalau user buka halaman yang tepat. Tidak ada satu tempat untuk lihat "apa yang butuh perhatian saya?"

**Yang dibangun:**
- Bell icon di header → dropdown notification list
- Notifikasi otomatis: low stock, overdue invoice, WO stuck, opname pending
- Activity feed: "Siapa melakukan apa, kapan?" (mirip audit trail tapi human-readable)
- Mark as read, filter by type

**Effort:** 2 hari

---

### 2. 📊 Dashboard yang Bisa Di-customize (Widget System)

**Kenapa?** Role yang berbeda butuh KPI yang berbeda. Finance butuh cash position, Warehouse butuh stock alerts, Production butuh WO queue. Sekarang semua pakai 1 dashboard yang sama.

**Yang dibangun:**
- Widget components: KPI Card, Mini Chart, Quick Action, Table Widget
- Drag-and-drop layout (atau preset per role)
- Persist layout ke `localStorage` atau DB per user
- Widget catalog: users pilih mana yang mau dilihat

**Effort:** 2–3 hari

---

### 3. 📋 Quick Actions Command Palette (`Ctrl+K`)

**Kenapa?** Power users kehilangan waktu navigasi via sidebar. Command palette = instant access ke semua fitur.

**Yang dibangun:**
- `Ctrl+K` → fuzzy search dialog
- Search across: pages, products (by SKU/name), customers, suppliers, WO numbers
- Quick actions: "Create SO", "Transfer Stock", "New WO"
- Recent items history

**Effort:** 1.5 hari

---

### 4. 📥 Export Center (CSV/Excel/PDF)

**Kenapa?** Belum ada satupun tabel yang bisa di-export. User harus screenshot atau copy-paste manual.

**Yang dibangun:**
- Universal `<ExportButton>` component (reusable di semua tabel)
- Format: CSV, Excel (.xlsx via SheetJS), PDF (via jsPDF atau html2canvas)
- Export with current filters applied
- Bulk export: semua laporan Finance sekaligus

**Effort:** 2 hari

---

## 🟡 Tier 2 — Strategic Features (3–7 hari per item)

Fitur yang meningkatkan level profesionalisme dan value PolyFlow secara signifikan.

---

### 5. 📱 Progressive Web App (PWA) + Offline Mode

**Kenapa?** Operator di lantai produksi dan gudang sering pakai HP/tablet. Koneksi wifi pabrik tidak selalu stabil. PWA = install ke home screen + basic offline.

**Yang dibangun:**
- Service worker + manifest.json
- Offline cache untuk: Kiosk portal, Warehouse portal
- Sync queue: offline transactions auto-sync saat online
- Push notifications (stock alert, WO assignment)
- Install prompt banner

**Effort:** 4–5 hari

---

### 6. 🤖 AI Assistant ("PolyBot")

**Kenapa?** Data di PolyFlow sudah sangat kaya (inventory, production, finance). Tapi untuk mendapatkan insight, user harus navigasi ke banyak halaman. AI assistant = instant answers.

**Yang dibangun:**
- Chat widget (floating button di pojok kanan bawah)
- Natural language queries: "Berapa stok PP Granules?", "WO mana yang overdue?", "Siapa customer terbesar bulan ini?"
- Backend: Gemini API / OpenAI → translate ke Prisma queries → return formatted answer
- Contextual: aware of current page, user role
- Suggested questions per halaman

**Effort:** 5–7 hari

---

### 7. 📈 Real-Time Production Dashboard (Live Floor Monitor)

**Kenapa?** TV besar di lantai produksi yang menampilkan status real-time = game changer untuk awareness.

**Yang dibangun:**
- `/monitor` route — full-screen, auto-refresh, designed for TV/large screen
- Live WO status: running, queued, completed today
- Machine status grid: green/yellow/red per mesin
- Today's KPI: output KG, scrap %, yield rate, target achievement
- Auto-rotate between views (carousel mode)
- No auth required (read-only, internal network only)

**Effort:** 3–4 hari

---

### 8. 📦 Customer Portal (Self-Service)

**Kenapa?** Saat ini customer harus telepon/WA untuk cek status order. Self-service portal = mengurangi beban admin + meningkatkan kepuasan customer.

**Yang dibangun:**
- `/portal` route — minimal, clean interface
- Login via link unik atau email + OTP
- Customer bisa lihat: order status, delivery tracking, invoice history, outstanding balance
- Optional: repeat order (duplicate previous SO)
- Read-only — tidak bisa edit apapun

**Effort:** 5–6 hari

---

### 9. 🔁 Recurring Transactions & Templates

**Kenapa?** Banyak transaksi yang repetitif: order bulanan dari customer X, pembelian rutin dari supplier Y, journal entry gaji.

**Yang dibangun:**
- "Save as Template" button di SO, PO, dan Journal Entry
- Template library per module
- Auto-generate: recurring schedule (weekly/monthly)
- Reminder notification saat schedule trigger
- One-click "Create from Template"

**Effort:** 3–4 hari

---

### 10. 🧪 Integrated Testing Suite

**Kenapa?** Saat ini **0 tests** (kecuali 1 file inventory-service.test.ts). Setiap deployment = gambling. Regresi sudah terjadi beberapa kali.

**Yang dibangun:**
- Vitest setup + test utils (mock Prisma, mock auth)
- Critical path tests:
  - Production: WO create → material issue → execution → backflush → completion
  - Inventory: transfer, adjustment, opname flow
  - Finance: journal posting, balance check, period close
- CI integration: tests run on every PR
- Coverage target: 60% untuk services/

**Effort:** 5–7 hari (foundation + critical tests)

---

## 🔵 Tier 3 — Moonshot / Platform Play

Ideas untuk PolyFlow ke level berikutnya.

---

### 11. 🏭 Multi-Tenant SaaS Platform

Buka PolyFlow untuk pabrik lain. Isolated database per tenant, subdomain routing, admin panel untuk manage tenants. Sudah ada feasibility analysis sebelumnya — foundation code (provisioning script, tenant migration) sudah partial dibangun.

**Effort:** 10–15 hari

---

### 12. 📊 Business Intelligence Module (BI)

Visual analytics: pivot tables, custom chart builder, saved reports. Bisa tarik data dari semua modul. Exportable ke PDF/Excel. Scheduled email reports.

**Effort:** 7–10 hari

---

### 13. 🔗 WhatsApp Integration

Auto-send: konfirmasi order ke customer, reminder pembayaran, notifikasi delivery. Pakai WhatsApp Business API atau third-party (Fonnte, Wablas).

**Effort:** 3–4 hari

---

### 14. 🏗️ Maintenance Management (CMMS)

Jadwal preventive maintenance mesin, tracking spare parts, work order maintenance, downtime analysis. Extend existing Machine model.

**Effort:** 5–7 hari

---

## 🎯 Rekomendasi Urutan Implementasi

| Urutan | Item | Effort | Impact |
|---|---|---|---|
| 1 | Command Palette (`Ctrl+K`) | 1.5 hari | ⭐⭐⭐⭐ |
| 2 | Export Center (CSV/Excel/PDF) | 2 hari | ⭐⭐⭐⭐⭐ |
| 3 | Notification Center | 2 hari | ⭐⭐⭐⭐ |
| 4 | Production Live Monitor | 3-4 hari | ⭐⭐⭐⭐⭐ |
| 5 | Testing Suite | 5-7 hari | ⭐⭐⭐⭐⭐ |
| 6 | AI Assistant | 5-7 hari | ⭐⭐⭐⭐ |
| 7 | WhatsApp Integration | 3-4 hari | ⭐⭐⭐⭐ |
| 8 | Customer Portal | 5-6 hari | ⭐⭐⭐ |

> [!TIP]
> Item 1-3 bisa dikerjakan minggu ini. Item 4-6 cocok untuk sprint berikutnya. Item 7+ untuk planning jangka menengah.

Mau mulai dari yang mana?
