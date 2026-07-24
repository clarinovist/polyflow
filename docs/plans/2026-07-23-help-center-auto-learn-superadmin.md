# Plan: Help Center, Auto-Learn Knowledge & Super-Admin Control Plane

> **Date:** 2026-07-23 · **Rev:** 2026-07-24b (Phase 1.6: Support IA — jangan “planet lain”; sidebar modul utuh + Bantuan 3 child, tanpa tab content)  
> **Status:** ✅ Phase 0–3 done (lint/test/build green). 🚧 **Phase 1.6 NEXT** — fix isolasi nav di `/support` + IA sidebar children. Setelah itu: seed/publish di prod + auto-learn toggle ON saat traffic real.  
> **Surface:**  
> - Tenant UX: `/support/*` (Cara pakai / Troubleshooting / Tanya CS), floating `PolyflowChatWidget`, contextual help per modul  
> - Super-admin: `/admin/help/*` di `admin.polyflow.uk`  
> - Backend: `src/lib/bot/*`, `/api/chat`, knowledge store + learning pipeline  
> **Related:**  
> - Baseline Virtual CS: `src/lib/bot/virtual-cs-service.ts`, `guardrails.ts`, `chat-audit.ts`, `metrics.ts`  
> - Support UI: `src/app/support/page.tsx`, `src/components/support/*`  
> - Superadmin roadmap: `docs/plans/2026-07-19-superadmin-panel-roadmap.md`  
> - SOP internal (sumber seed): `docs/SOP_SPK_BATCH_HARIAN.md`, `docs/SOP_MTO_HOT_LOADING_SURAT_JALAN.md`, `docs/produksi-hari-ini-guide.md`, `docs/manual-manufaktur-v1.md`, `docs/uat/*`

**Goal (satu kalimat):**

> Ubah “Bantuan” dari chat data read-only menjadi **Help Center berlapis** (konteks + FAQ/SOP + Virtual CS + eskalasi) yang jadi **pintu pertama** saat user macet — **sebelum** nanya founder — dengan **knowledge yang tumbuh lewat learning loop ber-supervisi**, dan **control plane super-admin**.

**North-star product:**

> User yang bingung / kena error **coba help dulu** (in-context → artikel → Virtual CS → eskalasi), bukan langsung WA/telepon founder.

**Principle:**

> **Jangan andalkan chat kosong sebagai help.**  
> **Jangan biarkan AI “belajar” jadi truth tanpa review.**  
> **Platform knowledge = super-admin; tenant ops data tetap di tenant.**  
> **Setiap gap yang sering muncul harus bisa jadi artikel — dengan 1 klik approve, bukan copy-paste manual abadi.**  
> **Help harus hadir di momen frustasi** (error, halaman kerja, widget) — bukan cuma di sidebar “Bantuan”.  
> **Bantuan tetap di dalam chrome ERP** — modul nav **tidak boleh hilang** saat user buka help (“bukan planet lain”).

---

## 0) Keputusan terkunci (usulan — konfirmasi sebelum implement)

| # | Topik | Keputusan usulan | Alasan |
|---|--------|------------------|--------|
| 1 | Bentuk bantuan | **Lapisan**, bukan chat-only | User nanya “cara pakai / error” — chat kosong & tools DB tidak cukup |
| 2 | Auto-learn | **Ya, memungkinkan** — mode **supervised auto-draft**, bukan full auto-publish | Mencegah SOP salah, hallucination, dan bocor data tenant jadi “panduan global” |
| 3 | Publish knowledge baru | Default: **DRAFT → human approve → PUBLISHED** | Super-admin (atau reviewer) adalah gate terakhir |
| 4 | Scope knowledge | **Platform (global Polyflow how-to)** dulu; **tenant-local SOP** fase belakangan | 80% pertanyaan “cara pakai fitur X” sama antar tenant |
| 5 | Control plane | **Super-admin** untuk settings, analytics, KB editor, learning queue, guardrails | Multi-tenant product control; tenant user tidak boleh edit policy global |
| 6 | Tenant admin | Fase 1: **read-only / tidak kelola KB global**; fase 3 opsional: tenant FAQ override | Hindari fragmentasi terlalu dini |
| 7 | Data training / log | Simpan **telemetry + draft kandidat** di **main DB** (platform); jawaban yang mengandung data operasional tenant **jangan** dipromote ke global KB mentah | Isolasi tenant + privacy |
| 8 | Guardrail “cara pakai” | Blok **perintah mutasi**, bukan kata kerja panduan | “cara buat SO” boleh; “buatkan SO untuk Budi” ditolak |
| 9 | Model LLM | Tetap lewat env (`LLM_*`); super-admin UI baca/tulis config **non-secret** + status health; secret tetap env/secret store | Jangan taruh API key di DB UI sembarangan |
| 10 | Big-bang | **Tidak.** Ship per phase; tiap phase mengurangi “nanya ke founder” | Value cepat + learning loop bertahap |
| 11 | IA Bantuan (tenant) | **Sidebar child 3 pintu** (Cara pakai / Troubleshooting / Tanya CS); **bukan** tab content; **bukan** daftar semua artikel di sidebar. Modul lain **tetap tampil**. | Tab hub + strip nav terasa “planet lain”; sidebar = modul ERP; artikel = content |

---

## 1) Problem & baseline

### 1.1 Gejala produk

| # | Gejala | Bukti / implikasi |
|---|--------|-------------------|
| P1 | User tetap nanya founder untuk **cara pakai** | Help = chat; tidak ada FAQ terstruktur / langkah UI |
| P2 | User tetap nanya founder saat **error** | Tidak ada mapping error → solusi; toast tanpa next action |
| P3 | Virtual CS kuat **baca data**, lemah **SOP** | Tools = stok/SO/SPK/finance; `getSopHelp()` generik & belum tool agent |
| P4 | Discoverability lemah | Tombol “Butuh bantuan?” hanya di subset path; welcome chat tanpa chip |
| P5 | Guardrail terlalu kasar | Pattern `buat/ubah/hapus` bisa memblok pertanyaan panduan |
| P6 | Knowledge tidak tumbuh | Setiap Q&A dijawab manusia, tidak masuk sistem |
| P7 | Tidak ada cockpit super-admin untuk help | Metrics in-memory (`metrics.ts`); audit sepotong di `AuditLog` tenant; tidak ada dashboard gap/KB |
| P8 | Bantuan terasa **planet lain** | `/support` layout hardcode `permissions={['/support']}` → modul Sales/Gudang/dll hilang dari sidebar; hub pakai tab content + header mini-app terpisah. User takut nyasar, first-door melemah |

### 1.2 Baseline teknis (jangan dibuang)

| Area | Lokasi | Status |
|------|--------|--------|
| Support page | `/support` | ✅ Chat embedded |
| Floating widget | `PolyflowChatWidget` | ✅ Path-gated |
| Nav Bantuan | sidebar → `/support` | ✅ |
| Virtual CS agentic | `virtual-cs-service.ts` | ✅ Tools DB + LLM loop |
| Guardrails | `guardrails.ts` | ⚠️ Perlu refine intent |
| Audit event | `chat-audit.ts` + `logActivity` | ⚠️ Partial, question truncated, no outcome quality |
| Metrics | `metrics.ts` | ⚠️ Process memory only — hilang saat restart, tidak multi-instance |
| Super-admin panel | `/admin/*` | ✅ Ada tenants, health, audit, impersonate, credits scaffolding |
| SOP dokumen | `docs/SOP_*`, UAT, manual | ✅ Ada, **belum user-facing** |

### 1.3 Root cause (satu kalimat)

> Bantuan sekarang adalah **asisten data**, bukan **sistem knowledge operasional** — dan tidak ada loop yang mengubah percakapan support menjadi aset yang bisa dipakai ulang.

---

## 2) Apakah auto-learn memungkinkan?

### 2.1 Jawaban singkat

**Ya, memungkinkan — dan direkomendasikan.**  
Tapi definisi yang aman untuk ERP multi-tenant:

| Mode | Apa artinya | Direkomendasikan? |
|------|-------------|-------------------|
| **A. Full auto-publish** | Bot langsung menambahkan jawaban ke KB tanpa review | ❌ **Tidak** untuk production |
| **B. Supervised auto-learn** | Sistem **mendeteksi gap**, **mengelompokkan pertanyaan mirip**, **menyusun draft artikel**, antre di super-admin → **approve/edit/reject** | ✅ **Ya — target arsitektur** |
| **C. Manual only** | Admin selalu tulis artikel dari nol | ⚠️ Hanya fase seed awal |

**Mode B** = “auto learn” yang realistis: sistem **belajar pola pertanyaan & menyiapkan pengetahuan**, manusia **mengesahkan truth**.

### 2.2 Sumber sinyal untuk belajar (learning signals)

| Sinyal | Contoh | Kegunaan |
|--------|--------|----------|
| Unanswered / low-confidence | Bot bilang “tidak tahu”, atau user bilang “tidak membantu” | Gap detection |
| Repeated questions | 8 user nanya “cara confirm SO stok kurang” | Cluster → kandidat artikel |
| Human reply (founder/admin) | Jawaban di eskalasi / Telegram / panel reply | Gold label untuk draft |
| Error codes di UI | `STOCK_INSUFFICIENT`, permission denied | Template troubleshooting |
| Click-through FAQ | Artikel dibuka tapi user tetap chat | Artikel kurang jelas |
| Successful resolution | User klik “Membantu” / tidak eskalasi | Reinforce ranking retrieval |

### 2.3 Pipeline auto-learn (target)

```text
User Q ──► Virtual CS + KB retrieval
              │
              ├─ answered well ──► log success + feedback
              │
              └─ gap / escalate ──► SupportInteraction (raw)
                                      │
                                      ▼
                               Cluster similar Q
                                      │
                                      ▼
                          LLM draft HelpArticle (DRAFT)
                                      │
                                      ▼
                     Super-admin Learning Queue
                     [Approve | Edit | Reject | Merge]
                                      │
                                      ▼
                              PUBLISHED → RAG index
```

### 2.4 Batasan keras (non-negotiable)

1. **Jangan publish otomatis** konten yang mengandung data tenant (nama customer, qty, invoice number, saldo).
2. **Sanitizer** sebelum draft: strip entity operasional → generalisasi (“Customer A”, “SO-xxxx”).
3. **Idempotensi cluster**: pertanyaan mirip meng-update draft yang sama, bukan spam 50 artikel.
4. **Versioning**: setiap publish = versi baru; bisa rollback.
5. **Audit trail**: siapa approve, kapan, dari cluster id mana.
6. **Eval ringan**: sebelum publish, checklist: langkah UI ada? modul benar? tidak minta password/rahasia?

### 2.5 “Belajar sendiri” vs “selalu manual”

| Tanpa learning loop | Dengan supervised auto-learn |
|---------------------|------------------------------|
| Founder jawab WA berulang | Gap masuk queue otomatis |
| FAQ stagnan | Draft artikel dari pola frekuensi |
| Knowledge hanya di kepala | Knowledge di sistem + searchable |
| Scaling support linear ke headcount | Scaling support ≈ review queue (sublinear) |

Manual **tidak hilang total** — berubah jadi **review & curate**, jauh lebih ringan daripada menulis dari nol.

---

## 3) Super-admin: pengaturan & pemantauan — setuju, ini tempat yang tepat

### 3.1 Pendapat / rekomendasi

**Ya — pengaturan platform help + pemantauan + learning queue harus di super-admin.**

Alasan:

| Alasan | Detail |
|--------|--------|
| Multi-tenant product | Cara pakai fitur Polyflow = **produk**, bukan data 1 pabrik |
| Isolation | Super-admin di main DB / control plane; tidak bocor ke tenant UI |
| Observability lintas tenant | “Top 20 unanswered minggu ini” butuh agregasi global |
| Policy & safety | Guardrail, model, feature flag Virtual CS, auto-learn on/off = keputusan platform |
| Existing pattern | Sudah ada `/admin/system-health`, audit, tenants — help control plane selaras roadmap superadmin |

**Yang tidak usah di super-admin (atau belakangan):**

| Item | Dimana | Catatan |
|------|--------|---------|
| Tenant-specific SOP internal (“di gudang kami packing di lokasi X”) | Tenant settings (fase 3) | Opsional; default inherit platform KB |
| Chat harian user | Tetap di tenant `/support` | UX end-user |
| Data stok/SO realtime | Tools Virtual CS di tenant DB | Sudah ada |

### 3.2 IA super-admin yang diusulkan

Route group baru di bawah admin (nama final bisa disesuaikan):

| Route | Fungsi |
|-------|--------|
| `/admin/help` | **Dashboard** help: volume chat, success rate, block rate, p95 latency, top gaps |
| `/admin/help/articles` | **Knowledge base** CRUD + status DRAFT/PUBLISHED/ARCHIVED + search |
| `/admin/help/articles/[id]` | Editor markdown/step, module tags, related errors, preview |
| `/admin/help/learning` | **Learning queue**: cluster Q, draft AI, approve/reject/merge |
| `/admin/help/conversations` | Log interaksi (filtered, redacted) — debug kualitas jawaban |
| `/admin/help/settings` | Feature flags, guardrail mode, auto-learn on/off, confidence threshold, channels (web/telegram) |
| `/admin/help/evals` (fase 2) | Golden questions set + regression score setelah ubah prompt/KB |

Sidebar admin: entri **Help / Virtual CS** (hanya super-admin).

### 3.3 Pemantauan (metrics yang wajib)

| Metrik | Kenapa penting |
|--------|----------------|
| Questions / day (per tenant + global) | Load & adoption |
| Answered / partial / failed / blocked | Kualitas |
| % with citation dari KB vs pure LLM | Grounding |
| Top unanswered clusters | Roadmap konten |
| Escalation rate | Beban founder |
| Latency p50/p95 | UX |
| Token/cost proxy (opsional) | Biaya LLM |
| Article CTR + “membantu?” | Kualitas konten |
| Learning: drafts created / approved / rejected | Efektivitas auto-learn |

**Implementasi metrics:** pindah dari in-memory `metrics.ts` ke **persist** (main DB tables atau time-series ringan). In-memory boleh tetap sebagai hot cache, bukan source of truth.

### 3.4 Pengaturan (settings)

| Setting | Default usulan |
|---------|----------------|
| Virtual CS enabled (global / per-tenant override) | ON |
| KB retrieval enabled | ON |
| Auto-learn draft creation | ON setelah Phase 2 |
| Auto-publish | **OFF** (hard default) |
| Min cluster size untuk draft | 3–5 pertanyaan mirip / 7 hari |
| Feedback thumbs | ON |
| Guardrail mode | `intent_v2` (panduan vs mutasi) |
| Max agent tool loops | 4 (seperti sekarang) |
| Channels | web (+ telegram jika bridge aktif) |

---

## 4) Arsitektur target

### 4.1 Lapisan UX (tenant)

```text
┌─────────────────────────────────────────────────────────┐
│  Contextual Help (? di halaman)  │  Error → “Lihat panduan” │
└───────────────┬─────────────────┴───────────┬───────────┘
                ▼                             ▼
        Help Article (FAQ/SOP)          Prefilled chat
                │                             │
                └──────────► /support/*  ◄── floating widget
                                  │
         Sidebar ERP (modul UTUH) + Bantuan expandable:
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
            /support          /support/     /support/cs
            (cara pakai)   troubleshooting   (Virtual CS)
                    │             │             │
                    └──── retrieval + tools + escalate ────┘
                                  │
                                  ▼
                         Learning signals → main DB
```

**IA keputusan (Phase 1.6):**

| Lakukan | Jangan |
|---------|--------|
| Permission sidebar = **sama seperti portal user** di `/support` | Hardcode `permissions={['/support']}` (menghapus modul) |
| Bantuan collapsible + **3 child route** | Tab bar Cara pakai / Troubleshooting / Tanya CS di content |
| Filter module chips **di content** (sales, warehouse, …) | Semua artikel jadi child sidebar (clutter, tidak skalabel) |
| Page header selaras modul ERP | Landing “SUPPORT CENTER” terasa mini-app terpisah |
| Artikel detail `/support/[slug]` + breadcrumb | Nambah item sidebar per artikel |

### 4.2 Data model (usulan — main DB / platform schema)

> Catatan: main DB sudah punya `Tenant`, superadmin entities. Model help **platform** idealnya di **main DB** agar super-admin query satu tempat.  
> Interaksi per-tenant bisa: (a) mirror ringkas ke main, atau (b) log di tenant + nightly aggregate. **Usulan Phase 1: log ringkas ke main** saat request chat (tenantId, userId hash/id, outcome) untuk dashboard global.

```text
HelpArticle
  id, slug, title, bodyMd, summary
  status: DRAFT | PUBLISHED | ARCHIVED
  locale: id
  modules[]          // sales, warehouse, production, finance, hrd, global
  tags[]
  errorCodes[]       // optional mapping
  source: SEED | HUMAN | AUTO_LEARN
  version, publishedAt, createdBy, updatedBy
  helpfulCount, notHelpfulCount

HelpArticleVersion    // history / rollback
  articleId, version, bodyMd, createdAt, createdBy

HelpQuestionCluster
  id, canonicalQuestion, embedding/ref, hitCount
  lastSeenAt, status: OPEN | DRAFTED | RESOLVED | IGNORED
  sampleQuestions[]  // redacted
  suggestedModule

HelpLearningDraft
  id, clusterId?, articleId?
  draftTitle, draftBodyMd
  status: PENDING_REVIEW | APPROVED | REJECTED | MERGED
  modelMeta, createdAt, reviewedBy, reviewNote

HelpInteraction
  id, tenantId, userId?, channel, question
  answerPreview, outcome: SUCCESS | PARTIAL | FAILED | BLOCKED | ESCALATED
  articleIds[], toolCalls[], confidence?
  feedback: null | UP | DOWN
  latencyMs, createdAt
  // no raw sensitive dumps

HelpSettings (singleton or key-value)
  key, valueJson, updatedAt, updatedBy
```

Embedding store: mulai **simple** (Postgres `pgvector` jika tersedia, atau keyword + LLM re-rank dulu). Jangan blok Phase 1 hanya karena vector infra.

### 4.3 Retrieval di Virtual CS

Urutan jawaban yang diinginkan:

1. **KB retrieval** (artikel published relevan)  
2. **Tools DB** jika butuh fakta operasional  
3. **Compose** jawaban + link artikel (“Buka panduan: Cara confirm SO”)  
4. Jika gap → akui + tawarkan eskalasi + catat cluster  

System prompt update: Virtual CS = **panduan pemakaian + baca data**, tetap **tidak mutasi**.

### 4.4 Guardrail intent_v2

| User intent | Contoh | Action |
|-------------|--------|--------|
| How-to | “cara buat sales order” | Allow → KB |
| Diagnose data | “kenapa SO Budi gagal / stok MP15” | Allow → tools |
| Mutate | “hapus invoice X”, “buatkan SO untuk …” | Block + arahkan UI |
| Out of scope | “resep masakan”, politik | Soft refuse |

Implementasi: classifier ringan (rules + optional LLM classify) sebelum mutation regex kasar.

---

## 5) Phased delivery

### Phase 0 — Instrumentasi & foundation (S, 2–4 hari) ✅ DONE

**Tujuan:** data cukup untuk belajar & pantau, tanpa UI besar.

- [x] Persist `HelpInteraction` (minimal fields) dari `/api/chat` + audit existing
- [x] Metrics dashboard dari main DB (`/admin/help`) — in-memory metrics bukan SSoT
- [x] Feedback thumbs di chat panel (membantu / tidak) + ownership + rollback
- [x] Refine guardrail intent_v2 (panduan vs mutasi) + tests (13)
- [x] Chip quick-ask di `PolyflowChatPanel` (8 pertanyaan)
- [x] Expand widget path allowlist (purchasing, hrd, maklon)
- [x] Outcome heuristic SUCCESS / PARTIAL / FAILED / BLOCKED
- [x] Telegram channel: answer + tenantId + interactionId

**Acceptance:** super-admin bisa query (SQL/action) volume + top questions 7 hari; “cara buat …” tidak diblok. ✅

**Shipped surfaces:**  
`HelpInteraction` / `HelpSettings` schema + migration · `chat-audit.ts` · `/api/chat` · `/api/chat/feedback` · `guardrails.ts` · chat panel/widget · `/admin/help` · bot query telegram.

---

### Phase 1 — Help Center user-facing + seed KB (M, 1–2 minggu) ✅ mostly done

**Tujuan:** user self-serve tanpa menunggu AI perfect.

Ringkasan scope (detail checklist eksekusi: **§5.1**):

- [x] Support Hub UI (baseline **tabs** — diganti route + sidebar child di **Phase 1.6**)
- [x] Model `HelpArticle` + super-admin CRUD minimal (list/create/edit/publish)
- [x] Seed 12–20 artikel dari top Q founder + docs SOP (rewrite bahasa user, step UI) — **verifikasi publish di prod**
- [x] Retrieval keyword/tag di Virtual CS (`search_help_articles` tool)
- [x] Contextual `?` di halaman pain (F)
- [x] Error toast/action → deep link artikel / prefilled chat (G)
- [x] Feedback ownership hardening (H)

**Acceptance:** ≥50% pertanyaan berulang bisa dijawab lewat artikel tanpa founder; chat mengutip artikel bila ada.

**Debt disengaja → Phase 1.6:** tab content + isolasi sidebar (`permissions={['/support']}`).

### 5.1 Phase 1 — Implementation checklist (PR-sized)

Kerjakan **berurutan per slice**. Tiap slice harus build-green + UAT-able sendiri.

#### Slice A — Schema `HelpArticle` (0.5–1 hari)

- [ ] Enum: `HelpArticleStatus` (`DRAFT | PUBLISHED | ARCHIVED`), `HelpArticleSource` (`SEED | HUMAN | AUTO_LEARN`)
- [ ] Model main DB (platform, via `getMainPrisma()`):

```text
HelpArticle
  id, slug (unique), title, summary, bodyMd
  status, locale default "id"
  modules String[]   // sales | warehouse | production | finance | hrd | purchasing | access | global
  tags String[]
  errorCodes String[]  // optional e.g. STOCK_INSUFFICIENT
  source
  version Int default 1
  publishedAt DateTime?
  createdBy String?, updatedBy String?
  helpfulCount Int default 0, notHelpfulCount Int default 0
  createdAt, updatedAt
  @@index([status, createdAt])
  @@index([slug])
```

- [ ] Migration folder (main + deploy path yang dipakai superadmin/main DB)
- [ ] **Belum** perlu `HelpArticleVersion` di slice A (boleh Phase 2)
- [ ] Optional: `HelpInteraction.citedArticleIds String[]` atau log di `changes` — boleh ditunda sampai retrieval hidup

**Done when:** `prisma generate` + migrate main OK; model queryable dari admin.

#### Slice B — Super-admin CRUD minimal (1–2 hari)

Route:

| Route | Fungsi |
|-------|--------|
| `/admin/help/articles` | List + filter status/module + search title |
| `/admin/help/articles/new` | Create draft |
| `/admin/help/articles/[id]` | Edit + Publish / Archive |

- [ ] Server actions: `listHelpArticles`, `getHelpArticle`, `createHelpArticle`, `updateHelpArticle`, `publishHelpArticle`, `archiveHelpArticle`
- [ ] Guard: super-admin only (sama pola `/admin/*`)
- [ ] Form: title, slug (auto dari title), summary, bodyMd (textarea dulu; rich editor nanti), modules (multi), tags, errorCodes
- [ ] Publish set `status=PUBLISHED`, `publishedAt=now()`, bump version
- [ ] Link dari `/admin/help` dashboard → “Kelola artikel”
- [ ] Audit log action `HELP_ARTICLE_PUBLISHED` / `UPDATED` (opsional tapi disarankan)

**Done when:** super-admin bisa publish 1 artikel dummy dan lihat di list.

#### Slice C — Public read API + Support Hub UI (1–2 hari)

> **Shipped dengan IA tab + debt P8.** Target akhir IA diganti di **Phase 1.6** (sidebar children, tanpa tab, nav modul utuh). Checklist di bawah = baseline yang sudah ada; jangan ship ulang tab sebagai end-state.

- [x] Read-only helpers (main DB): `listPublishedArticles({ module?, q? })`, `getPublishedArticleBySlug(slug)`
- [x] Tenant hub (baseline): tabs Cara pakai | Troubleshooting | Tanya CS — **akan diganti route + sidebar child di 1.6**
- [x] Article detail: `/support/[slug]`
- [x] Deep link prefill chat (baseline `?tab=cs&q=` — **migrate ke `/support/cs?q=` di 1.6**)

**Done when (baseline):** user tenant bisa buka FAQ tanpa chat; artikel published muncul.

#### Slice D — Seed 12–20 artikel (konten, paralel slice B–C)

Prioritas seed (isi step UI nyata, bahasa ID, 5–12 langkah):

| # | Slug usulan | Modul | Jenis |
|---|-------------|-------|-------|
| 1 | `cara-buat-sales-order` | sales | how-to |
| 2 | `cara-confirm-so-stok-kurang` | sales | troubleshoot |
| 3 | `cara-jadwal-kirim-dan-surat-jalan` | sales | how-to |
| 4 | `cara-terima-barang-gudang` | warehouse | how-to |
| 5 | `cara-cek-stok-per-lokasi` | warehouse | how-to |
| 6 | `cara-outgoing-muat-kirim` | warehouse | how-to |
| 7 | `cara-spk-batch-harian` | production | how-to |
| 8 | `cara-input-hasil-kiosk` | production | how-to |
| 9 | `error-backflush-atau-stok-bahan` | production | troubleshoot |
| 10 | `cara-lihat-invoice-belum-lunas` | finance | how-to |
| 11 | `error-period-locked-finance` | finance | troubleshoot |
| 12 | `cara-atur-role-permission-user` | access | how-to |
| 13 | `menu-tidak-muncul-permission` | access | troubleshoot |
| 14 | `apa-yang-bisa-virtual-cs` | global | how-to |
| 15 | `cara-beri-feedback-dan-eskalasi` | global | how-to |

- [ ] Sumber rewrite: `docs/SOP_*`, UAT, + 5–10 Q yang sering nanya ke founder
- [ ] Seed via script `scripts/seed-help-articles.ts` (main DB) **atau** insert manual super-admin
- [ ] Jangan copy raw eng docs — tulis langkah menu Polyflow

**Done when:** ≥12 artikel PUBLISHED di main DB staging/prod.

#### Slice E — Virtual CS retrieval tool (1–2 hari)

- [ ] `searchHelpArticles(query, module?)` di `src/lib/bot/` — keyword: title/summary/tags/bodyMd (ILIKE / simple scoring); **hanya PUBLISHED**
- [ ] Register tool OpenAI: `search_help_articles`
- [ ] System prompt update: how-to → **wajib coba tool KB dulu**; jawab + sebut judul + slug/link `/support/{slug}`
- [ ] Log optional: outcome tetap; nanti cited articles
- [ ] Unit tests: search ranking basic (exact title > tag > body)
- [ ] Manual: tanya “cara buat SO” → jawaban mengutip artikel seed

**Done when:** chat how-to mengutip KB, bukan pure hallucinated steps.

#### Slice F — Contextual help `?` (1–2 hari)

Komponen reusable: `PageHelpButton` / `ContextualHelp`

Props: `module`, `slugs[]` atau `tags[]`, optional `title`

Pasang di **5 surface** (header page):

| Surface | Path approx | Seed slugs |
|---------|-------------|------------|
| Sales orders | `/sales/orders` | buat SO, confirm stok |
| Warehouse inventory / incoming | `/warehouse/inventory`, `/warehouse/incoming` | cek stok, terima barang |
| Production orders | `/production/orders` | SPK batch |
| Finance invoices (sales or finance) | `/finance/invoices/sales` atau sales invoices | invoice belum lunas |
| Settings users | `/dashboard/settings` atau users access | role permission |

- [ ] Popover: 3–5 link artikel + “Tanya Virtual CS” → `/support/cs` (Phase 1.6; legacy `?tab=cs` redirect OK)
- [ ] Jangan bloated; max 5 links

**Done when:** di 5 halaman, user lihat panduan tanpa buka sidebar Bantuan.

#### Slice G — Error → help (0.5–1 hari, partial OK)

- [ ] Identifikasi 2–3 error user-facing paling sering (mis. stok kurang confirm SO, period locked, permission denied)
- [ ] Di toast/dialog: CTA “Lihat panduan” → `/support/{slug}` atau prefilled CS
- [ ] Map `errorCodes` di artikel = key yang dipakai di throw/map error bila ada

**Done when:** minimal 1 alur error punya CTA ke artikel.

#### Slice H — Hardening kecil (bersamaan / akhir Phase 1)

- [ ] Feedback ownership strict: `interaction.userId !== userId` → 403 (null owner tidak boleh)
- [ ] Unit tests `resolveOutcome` (export helper)
- [ ] Top Gaps dashboard optional include `PARTIAL`
- [ ] Update plan status Phase 1 checkboxes saat ship

---

#### Urutan PR disarankan

```text
PR1: Slice A (schema)
PR2: Slice B (admin CRUD)
PR3: Slice C (support hub + public read) // bisa paralel konten Slice D
PR4: Slice D seed (script + 12 artikel)
PR5: Slice E (retrieval tool)
PR6: Slice F + G (contextual + error CTA)
PR7: Slice H polish
```

Paralel aman: **D (konten)** || **B/C (UI)** setelah A merge.

#### Definition of Done — Phase 1

| Kriteria | Target |
|----------|--------|
| Artikel published | ≥12 |
| Support hub 3 tab (baseline) | ✅ shipped — **diganti 3 route + sidebar child di Phase 1.6** |
| Chat cites KB untuk how-to seed | ✅ manual UAT |
| Contextual help pain pages | ✅ |
| Super-admin CRUD publish | ✅ |
| tsc / eslint / tests / build | green |
| Auto-learn draft | **out of scope** (Phase 3) |
| Sidebar modul utuh di `/support` | **Phase 1.6** |

#### Out of scope Phase 1

- Auto-learn cluster / learning queue
- pgvector embeddings (keyword cukup)
- Tenant-local articles
- Full markdown WYSIWYG
- Credits billing untuk LLM
- Full chat “modernization” (animasi berat, time separators, welcome mega-redesign) — lihat Phase 1.5 thin + Phase 4 polish

---

### Phase 1.5 — Chat Grounding & First-Door UX (S, 1.5–2.5 hari)

> **Revisi dari “Chat Panel Modernization” (8 slice / 3–5 hari).**  
> Scope dipangkas: fokus ke **jawaban kebaca + citation terstruktur + hadir di momen frustasi**.  
> Polish visual murni (bounce animation, time separator, welcome grid) → **Phase 4**.

**Tujuan:**

1. Virtual CS jadi **pintu self-serve yang dipercaya** (bukan wall of text / halusinasi langkah).  
2. Help **muncul di momen masalah** (error CTA, deep-link prefill, contextual `?`, widget).  
3. Satu klik dari jawaban chat → **artikel panduan** yang actionable.

**Prasyarat (selesaikan dulu — masih sisa Phase 1):**

| Item | Status target sebelum 1.5 |
|------|---------------------------|
| Slice F — contextual `?` 5 halaman pain | ✅ complete (saat ini partial 3/5) |
| Slice G — error toast → “Lihat panduan” / prefilled CS | ✅ minimal 1–3 alur |
| Slice H — feedback ownership + polish kecil | ✅ |
| Deep link CS | baseline `?tab=cs&q=` → canonical **`/support/cs?q=`** di Phase 1.6 |

**File utama:**

- `src/components/support/polyflow-chat-panel.tsx`
- `src/components/support/contextual-help.tsx`
- `src/components/support/polyflow-chat-widget.tsx`
- `src/lib/bot/virtual-cs-service.ts` + `/api/chat` response shape
- Error toast surfaces (confirm SO stok, period locked, permission, dll.)

**Design system (tetap):**

- Brand glass tokens (`bg-brand-glass`, `border-brand-border`, `shadow-[var(--shadow-brand)]`)
- shadcn/ui (Button, Textarea, ScrollArea)
- Lucide icons
- Tailwind v4 — **tanpa** dependensi animasi berat di phase ini (CSS bounce dots cukup)

---

#### UX funnel: “pintu pertama” (Phase 1 + 1.5 + 1.6)

```text
Momen frustasi di halaman kerja
        │
        ├─① Error toast/dialog ──► CTA “Lihat panduan” → /support/{slug}
        │                      └─► CTA “Tanya CS” → /support/cs?q=...
        │
        ├─② Contextual ? di header ──► 3–5 link artikel + Tanya CS
        │
        ├─③ Floating widget (path allowlist) ──► chat grounding + citation
        │
        └─④ Sidebar Bantuan (expandable, modul ERP tetap terlihat)
                    ├─ Cara pakai          → /support
                    ├─ Troubleshooting     → /support/troubleshooting
                    └─ Tanya Virtual CS    → /support/cs
                    │
                    ▼
         Jawaban membantu? ──yes──► feedback UP (reinforce)
                    │ no
                    ▼
         Eskalasi terstruktur (bukan WA ad-hoc ke founder)
                    │
                    ▼
         Learning signal → Phase 3 draft artikel
```

**Aturan UX (non-negotiable untuk first-door):**

| # | Aturan | Kenapa |
|---|--------|--------|
| U1 | **Error selalu punya next step** (panduan / CS / eskalasi) — jangan toast mati | Frustasi = momen nanya founder |
| U2 | **Jawaban how-to wajib kebaca** (list, bold, link) + **card artikel** | Text wall = user anggap CS bodoh |
| U3 | **Citation = structured data**, bukan regex prose LLM | Card tidak putus saat format jawaban berubah |
| U4 | **1 jalur eskalasi jelas** di chat & hub (bukan “hubungi founder” di luar sistem) | Founder tetap last resort, tapi terukur |
| U5 | **Jangan over-promise** di welcome: “bisa cek data + panduan; tidak ubah data” | Trust; kurangi expect mutasi |
| U6 | Prefer **buka artikel di tempat** (same tab / panel) daripada “silakan cari di menu Bantuan” | Friction = kabur ke WA |
| U7 | **Saat di Bantuan, sidebar modul ERP tetap ada** — user tidak merasa keluar aplikasi | “Planet lain” = drop-off ke WA founder |
| U8 | **Navigasi Bantuan = 3 child sidebar**, bukan tab content; **bukan** tree semua artikel | Skalabel; selaras pola modul Polyflow |

---

#### Slice M0 — Deep link & entry completion (0.25–0.5 hari)

Sambungkan sisa Phase 1 ke chat:

- [x] `PolyflowChatPanel` baca `searchParams` / prop `initialQuestion?: string` (baseline)
- [x] Prefill chat dari query `q` (baseline `?tab=cs&q=` — **canonical target Phase 1.6:** `/support/cs?q=`)
- [ ] ContextualHelp / error CTA pakai path canonical `/support/cs?q=` setelah 1.6 (redirect lama `?tab=cs` OK sementara)
- [ ] Error CTA “Tanya CS” → prefill pertanyaan netral (tanpa data tenant sensitif di query string bila bisa)

**Done when:** dari error / `?` page, user land di CS dengan pertanyaan sudah siap kirim.

---

#### Slice M1 — Structured citations (API + card) (0.5–0.75 hari)

**Masalah:** model hanya “sebutkan `/support/{slug}` di text” → UI regex rentan.

**Target API** (`/api/chat` + virtual-cs-service):

```ts
// response data (tambahan, backward compatible)
citedArticles?: Array<{
  slug: string;
  title: string;
  summary?: string;
}>;
// diisi dari hasil tool search_help_articles yang dipakai di turn ini (dedupe, max 3)
```

- [ ] Kumpulkan hits tool `search_help_articles` di agent loop → map ke `{ slug, title, summary }`
- [ ] Log ke `HelpInteraction` (field existing / `changes` / `citedArticleIds`) agar dashboard bisa hitung % grounded
- [ ] System prompt: tetap sebut judul di jawaban; **card di UI mengandalkan `citedArticles`**, bukan parsing text
- [ ] UI: di bawah bubble assistant, max **3** card:

```text
┌──────────────────────────────────────┐
│ 📖  Cara Buat Sales Order            │
│     Ringkasan 1 baris…        Buka → │
└──────────────────────────────────────┘
```

- [ ] Style: `rounded-xl border border-brand-border bg-brand-glass p-3 hover:bg-brand-glass-heavy`
- [ ] `Link` ke `/support/{slug}` (same tab)
- [ ] Empty: jika tool dipanggil tapi 0 hit → **jangan** empty card; biarkan prose + soft “Belum ada panduan spesifik — coba tab Cara pakai / eskalasi”

**Done when:** tanya “cara buat SO” → card artikel seed muncul meski model tidak menulis URL sempurna.

---

#### Slice M2 — Rich answer rendering (0.5 hari)

**Saat ini:** `whitespace-pre-wrap` saja.

- [ ] Lightweight renderer (shared helper, reuse pola `support/[slug]` bila ada):  
  `**bold**`, `*italic*`, `` `inline code` ``, URL → `<a>`, list `-` / `1.`, paragraph `\n\n`
- [ ] **Jangan** tarik `react-markdown` full kecuali sudah ada di bundle dan trivial
- [ ] External URL: `target="_blank" rel="noopener noreferrer"`; internal `/support/*` same tab
- [ ] Sanitize: no raw HTML injection
- [ ] Unit test kecil: bold + list + link

**Done when:** jawaban multi-langkah SOP terbaca sebagai list, bukan blok teks.

---

#### Slice M3 — Loading trust + input polish (0.25–0.5 hari)

- [ ] Typing indicator 3-dot (CSS `animate-bounce` staggered) di bubble glass; `role="status"` + sr-only
- [ ] Setelah ~12–15s: teks “Masih memproses…” + **Batalkan** (`AbortController` di `fetch`)
- [ ] Smart auto-scroll: hanya stick-to-bottom jika user sudah di dekat bottom (jangan ganggu saat scroll naik baca jawaban panjang)
- [ ] Textarea auto-resize max ~4 baris; hint `Enter` kirim / `Shift+Enter` baris baru (jika belum jelas)
- [ ] Copy jawaban assistant (icon hover / always on mobile)
- [ ] Character near-limit: tampilkan sisa saat ≥1800/2000

**Out of scope M3:** framer-motion entry per message, time-of-day separators, char counter selalu visible.

**Done when:** loading terasa “live CS”, cancel bekerja, scroll tidak agresif.

---

#### Slice M4 — First-door surfaces polish (0.5 hari)

Bukan redesign visual besar — **kurangi friksi menuju help**:

**A. ContextualHelp**

- [ ] Popover konsisten brand (border-brand, glass) — sama “bahasa visual” dengan chat
- [ ] Primary CTA sekunder: “Tanya Virtual CS” dengan prefill (M0)
- [ ] Max 5 links; label jelas (“Langkah confirm SO”, bukan slug mentah)

**B. Error → help (melengkapi G)**

- [ ] Pattern CTA seragam di 2–3 error top:  
  primary **Lihat panduan** | secondary **Tanya CS**  
- [ ] Copy singkat di toast: *apa artinya* + *apa yang bisa dilakukan* (1 baris), bukan error code mentah saja

**C. Chat empty / blocked / failed states**

- [ ] Blocked mutasi: arahkan ke UI modul + optional link artikel terkait bila ada
- [ ] Failed/network: “Coba lagi” + link hub Cara pakai (bukan dead end)
- [ ] Welcome singkat + chips (existing) — **tanpa** redesign grid 2×4 di phase ini; cukup pastikan chips cover top pain founder

**D. Widget**

- [ ] Pastikan allowlist path cover pain surfaces (sales, warehouse, production, finance, purchasing, hrd, access)
- [ ] Header widget: 1 baris trust (“Panduan & cek data · tidak mengubah transaksi”)

**Done when:** di 1 alur error + 1 halaman contextual, user bisa selesaikan tanpa buka sidebar manual.

---

#### Slice M5 — Related next steps (opsional, ≤0.25 hari jika sisa bandwidth)

**Bukan** keyword-hardcode follow-up (“kalau response ada kata stok…”).

- [ ] Jika `citedArticles` / module dari retrieval ada → tampilkan 2 chip “Artikel terkait” (slug lain same module) **atau** “Buka panduan lengkap”
- [ ] Click chip = navigate ke artikel, **bukan** auto-spam chat question
- [ ] Jika tidak ada citation → hide (jangan chip generik “Tanya hal lain”)

Kalau tidak sempat → defer Phase 4.

---

#### Urutan PR disarankan

```text
PR0 (masih Phase 1): F remaining + G + H + deep-link foundation
PR-M1: M1 structured citations (API + cards) + M2 rich render
PR-M2: M0 prefill wiring + M3 loading/scroll/copy + M4 first-door surfaces
(opsional) PR-M3: M5 related articles chips
```

Paralel aman: konten seed perbaikan (rewrite langkah UI) || PR-M1.

---

#### Definition of Done — Phase 1.5

| Kriteria | Target |
|----------|--------|
| `citedArticles` di response chat | ✅ terisi saat tool KB dipakai |
| Citation cards di UI | ✅ max 3, dari structured data |
| Rich content (bold/list/link) | ✅ |
| Deep link prefill CS | ✅ baseline; canonical `/support/cs?q=` di 1.6 |
| Error CTA → panduan/CS | ✅ minimal 2 alur |
| Typing + cancel + smart scroll | ✅ |
| % chat how-to dengan citation (UAT) | ≥ seed how-to questions grounded |
| tsc / eslint / tests / build | green |
| Animasi message / time sep / welcome mega | **out of scope** |

#### Out of scope Phase 1.5 (pindah Phase 4 polish)

- framer-motion entry anim per bubble  
- Time grouping / “Hari ini 14:32”  
- Welcome grid 2×4 + icon per chip + gradient hero  
- Keyword-mapped follow-up questions  
- Full streaming token-by-token  
- WYSIWYG di admin  

---

#### Apakah “pintu pertama sebelum founder” tercapai dengan plan ini?

**Ya — realistis, bertahap — dengan syarat eksekusi + konten, bukan cuma fitur.**

| Lapisan goal | Phase yang mengunci | Bisa tercapai? |
|--------------|---------------------|----------------|
| Help **ketemu** saat macet (discoverability) | P1 F/G + P1.5 M0/M4 + **P1.6 chrome** | ✅ Ya, jika error CTA + contextual + widget + **nav tidak mengisolasi** |
| Help **tidak terasa planet lain** | **P1.6** | ✅ Ya — fix permission layout + sidebar children |
| Help **berguna** (jawaban benar / langkah UI) | P1 seed + retrieval + P1.5 M1/M2 | ✅ Ya untuk top 12–20 Q; **bukan** semua edge case di hari-1 |
| Help **dipercaya** (tidak halusinasi / tidak mutasi) | Guardrail P0 + citation + tone welcome | ✅ Ya, dengan grounding KB |
| Founder **bukan default** | Eskalasi in-app + culture (“coba Bantuan dulu”) | ⚠️ Partial tanpa adopsi; butuh founder redirect: “cek CS/artikel dulu” |
| Knowledge **tumbuh** tanpa founder tulis ulang | P3 supervised auto-learn | ✅ Ya setelah traffic + review discipline |
| Founder load −50% “cara pakai” | P1–P3 + 30 hari metrik | ✅ Target kasar realistis **jika** seed = Q yang benar-benar sering |

**Yang plan ini sudah cukup kuat:**

1. **Lapisan** (bukan chat-only) — betul untuk ERP.  
2. **Supervised learn** — aman multi-tenant.  
3. **Instrumentasi** (Phase 0) — bisa ukur gap, bukan feeling.  
4. **First-door UX** (revisi 1.5) — hadir di error & konteks, bukan cuma menu Bantuan.

**Yang plan saja tidak otomatis selesaikan (risiko produk):**

| Risiko | Mitigasi eksplisit |
|--------|--------------------|
| Seed artikel generik / beda dari UI nyata | Seed dari Q founder nyata + langkah menu Polyflow; review 1x/minggu top gaps |
| User terbiasa WA founder | Founder **redirect** ke help 2 minggu pertama; eskalasi hanya lewat CS/ticket |
| Chat bagus, artikel jelek (atau sebaliknya) | Citation + “membantu?”; archive/rewrite artikel CTR jelek |
| Hanya 3 halaman punya `?` | F harus 5 pain pages; expand bertahap dari top gaps |
| Phase 1.5 jadi polish visual lagi | DoD ketat: grounding > animasi |
| Bantuan strip sidebar modul (P8) | Phase 1.6: real permissions + 3 child; jangan hardcode `['/support']` |
| Empty KB di prod (“Belum ada artikel”) | Seed/publish ke main DB prod; empty state → chips CS |

**Kriteria sukses “pintu pertama” (30 hari pasca P1+1.5+1.6, sebelum auto-learn matang):**

| Metrik | Target kasar |
|--------|----------------|
| Tiket/WA “cara pakai” ke founder | −30% dulu (P1); −50% setelah P3 + konten iterasi |
| Chat how-to dengan `citedArticles` | ≥40% |
| Klik CTA error → panduan | terukur >0 (baseline baru) |
| Feedback UP/(UP+DOWN) pada jawaban cited | ≥60% |
| Escalation setelah buka help | turun vs baseline P0 |
| Auto-publish incident | **0** (selalu) |

**Verdict:**  
Plan **bisa** menjadikan help pintu pertama untuk **kelas masalah berulang (cara pakai + error umum)**.  
Plan **tidak** (dan tidak harus) mengganti founder untuk **edge case bisnis / bug / keputusan custom tenant** — itu eskalasi.  
Kunci keberhasilan = **F+G**, **seed yang jujur**, **citation grounding**, **chrome ERP utuh (1.6)**, **founder ikut redirect**, lalu **P3** agar gap tidak menumpuk di kepala founder lagi.

---

### Phase 1.6 — Support IA: tetap di ERP (bukan planet lain) (S, 1–2 hari) ← **NEXT**

> **Temuan prod (kiyowo):** `/support` hanya menampilkan item Bantuan di sidebar — modul hilang.  
> Root cause: `src/app/support/layout.tsx` → `permissions={['/support']}`.  
> Plus IA tab content terasa mini-app terpisah.  
> **Keputusan user:** child di sidebar lebih baik daripada tab; **semua item sidebar lain jangan hilang**.

**Tujuan:** Bantuan terasa **masih di Polyflow** — user bisa loncat balik ke Sales/Gudang kapan saja, dan 3 pintu help jelas di nav.

#### Slice N0 — Restore full module sidebar (P0, ≤0.25 hari)

- [ ] `SupportLayout`: **jangan** hardcode `permissions={['/support']}`
- [ ] Resolve permissions **sama pola** layout portal/dashboard lain (session user role → granted paths / `"ALL"` untuk admin)
- [ ] Pastikan item Bantuan tetap visible + active state saat `pathname` starts with `/support`
- [ ] Smoke: login role terbatas (mis. hanya warehouse) → di `/support` tetap lihat modul yang diizinkan, **bukan** hanya Bantuan dan **bukan** bocor modul terlarang

**Done when:** screenshot sidebar di `/support` mirip sidebar di `/sales` (modul tetap ada).

#### Slice N1 — Routes menggantikan tab (0.5 hari)

| Route | Fungsi | Content |
|-------|--------|---------|
| `/support` | Cara pakai (default) | List artikel published; filter module chips; **tanpa** tab bar |
| `/support/troubleshooting` | Troubleshooting | List filter tag/errorCodes; module chips |
| `/support/cs` | Tanya Virtual CS | `PolyflowChatPanel` embedded full height |
| `/support/[slug]` | Artikel detail | Tetap; breadcrumb `Bantuan › {title}` |

- [ ] Extract shared list UI dari `support/page.tsx` (hindari duplikasi howto vs troubleshoot)
- [ ] Hapus tab bar Cara pakai | Troubleshooting | Tanya CS dari content
- [ ] Redirect kompatibilitas: `/support?tab=cs` → `/support/cs` (+ preserve `q`); `?tab=troubleshoot` → `/support/troubleshooting`
- [ ] Update semua deep link internal: ContextualHelp, error-help-links, chat citation, empty-state copy

**Done when:** tidak ada tab switcher di content; 3 route di atas UAT-able.

#### Slice N2 — Sidebar: Bantuan expandable + 3 child (0.5 hari)

```text
Modul
  Sales / Purchasing / Production / …
Master Data
  …
Bantuan                    ← collapsible; default open jika pathname.startsWith('/support')
  ├─ Cara pakai            → /support
  ├─ Troubleshooting       → /support/troubleshooting
  └─ Tanya Virtual CS      → /support/cs
```

- [ ] `sidebar-nav.tsx` (dan `portal-sidebar-base` bila perlu konsistensi): ganti single link Bantuan → group + children
- [ ] Active state per child (exact / prefix)
- [ ] Collapsed sidebar: icon Bantuan + tooltip; expand flyout atau navigate ke `/support`
- [ ] **Jangan** inject daftar `HelpArticle` ke sidebar (tetap di content)
- [ ] Mobile drawer: children tetap accessible

**Done when:** user expand Bantuan, pilih Tanya CS, modul Sales masih di atas.

#### Slice N3 — Content chrome selaras modul (0.25–0.5 hari)

- [ ] Page header standar (seperti modul lain): title + 1 baris subtitle — kurangi hero “SUPPORT CENTER” terpisah bila terasa alien
- [ ] Empty state: copy + **CTA chips** ke `/support/cs` / quick questions — bukan cuma “buka tab lain”
- [ ] Breadcrumb path: `Bantuan` / `Bantuan › Troubleshooting` / `Bantuan › {artikel}`
- [ ] Pastikan seed **PUBLISHED di main DB prod** (empty list di tenant = first-door mati meski IA bagus)

**Done when:** empty/full state terasa “halaman modul”, bukan landing terisolasi.

#### Urutan PR

```text
PR-N1: N0 permission fix (bisa ship sendirian — impact besar)
PR-N2: N1 routes + N2 sidebar children + redirects
PR-N3: N3 chrome + empty state + link sweep
```

#### Definition of Done — Phase 1.6

| Kriteria | Target |
|----------|--------|
| Sidebar modul di `/support` | ✅ sama filter permission user (bukan cuma Bantuan) |
| Tab content hub | ❌ dihapus |
| 3 child Bantuan di sidebar | ✅ Cara pakai / Troubleshooting / Tanya CS |
| Artikel di sidebar | ❌ tidak (list di content) |
| Redirect `?tab=` lama | ✅ |
| Deep link CS | `/support/cs?q=` |
| tsc / eslint / tests / build | green |

#### Out of scope Phase 1.6

- Daftar semua artikel di sidebar  
- Redesign visual chat (tetap Phase 4)  
- Tenant-local KB  
- Mengubah super-admin `/admin/help/*` IA  

---

### Phase 2 — Super-admin control plane (M, 1 minggu paralel/setelah P1)

**Tujuan:** kamu kelola & pantau dari `admin.polyflow.uk`.

- [x] `/admin/help` dashboard (metrics, top gaps, latency) — **shipped early in Phase 0, polished now with quick-nav + grounding + learning banner**
- [x] `/admin/help/articles` editor + publish workflow (dimulai di Phase 1 minimal, dipoles di sini)
- [x] `/admin/help/conversations` (redacted list + filter tenant/outcome) — `actions/admin/help-admin.ts:listHelpConversations` + page
- [x] `/admin/help/settings` feature flags + auto-learn toggle — `HelpSettings` CRUD + guard autoPublish must OFF
- [x] Nav admin + audit log untuk publish/settings change — `HELP_ARTICLE_*` + `HELP_SETTINGS_UPDATED` + `HELP_CLUSTER_*` + `HELP_DRAFT_*`
- [ ] (Opsional) per-tenant kill switch Virtual CS — deferred

**Acceptance:** tanpa SSH/SQL, super-admin bisa lihat health help, edit artikel, matikan auto-learn. ✅

### Phase 3 — Supervised auto-learn (M–L, 1–2 minggu)

**Tujuan:** sistem menambah knowledge **sendiri sampai tahap draft**.

- [x] Clustering pertanyaan mirip (embedding atau fuzzy + LLM normalize) — `help-clustering.ts` keyword-sort normalize
- [x] Job (cron) harian: cluster OPEN dengan hitCount ≥ N → generate `HelpLearningDraft` — `help-learning.ts:runLearningDraftJob`, manual via `runLearningJobNow` action, setting `autoLearnDraftEnabled` + `minClusterSizeForDraft`
- [x] Sanitizer: redaksi nama customer/nomor dokumen/qty sensitif — `help-sanitizer.ts` + tests
- [x] `/admin/help/learning` queue: preview, edit, approve→create/update article, reject, merge — `help-learning.ts` actions + `admin/help/learning/page.tsx`
- [x] Link draft ke cluster; cluster status RESOLVED setelah publish — `HelpQuestionCluster` <-> `HelpLearningDraft`
- [ ] Metrics: drafts/week, approve rate, time-to-publish — basic counts di dashboard, richer metrics Phase 4

**Acceptance:** setelah 2 minggu traffic nyata, ≥3 draft berkualitas muncul otomatis; 0 auto-publish tanpa approve. **Infra ready; need real traffic (clustering wired in chat-audit for FAILED/PARTIAL/BLOCKED).**

### Phase 4 — Polishing & scale (opsional)

- [ ] Tenant-local articles (override/extend platform)
- [ ] Onboarding checklist per role (first login)
- [ ] Evals golden set + CI smoke
- [ ] Telegram/WA escalate with structured payload
- [ ] Cost controls / credits integration (hubungkan roadmap credits)
- [ ] Multi-locale (jika perlu)
- [ ] **Chat visual polish (ex–Phase 1.5 gemuk):** message entry animation, time separators, welcome grid 2×4 + icons, streaming tokens
- [ ] Related-article chips lanjutan / smart follow-up berbasis retrieval (bukan keyword kasar)
- [ ] (Jika 1.6 belum): polish lanjutan empty state / onboarding help per role — **prioritas tetap 1.6 dulu**

---

## 6) Seed content strategy (Phase 1)

Mulai dari **pertanyaan yang sudah sering masuk ke founder**, bukan dari struktur modul ideal.

Kategori seed (contoh skeleton — diisi saat eksekusi):

| Modul | Cara pakai | Troubleshooting |
|-------|------------|-----------------|
| Sales | Buat SO, confirm, jadwal kirim, SJ | Stok kurang, credit block, status macet |
| Warehouse | Terima barang, cek stok, outgoing | Lokasi salah, qty mismatch, opname |
| Production | SPK batch harian, input kiosk, packing | Backflush gagal, shift, void execution |
| Finance | Invoice, payment, petty cash | Period locked, journal imbalance |
| Akses | Role, user, permission | “menu tidak muncul”, desktop-required |
| Support | Apa yang bisa/tidak Virtual CS | Cara eskalasi |

Sumber rewrite: SOP di `docs/` + jawaban founder historis (WA/chat).

---

## 7) Security, privacy, multi-tenant

| Risiko | Mitigasi |
|--------|----------|
| Data tenant masuk KB global | Sanitizer + review wajib; blocklist pola nomor dokumen |
| Super-admin lihat chat mentah | Redaksi default; full text hanya bila perlu + audit |
| Prompt injection via user Q | Guardrail + tool allowlist (sudah arah agentic) |
| LLM mutasi data | Read-only policy tetap; tidak ada write tools |
| Cost abuse | Rate limit chat per user/tenant; max question length (sudah 2000) |
| Wrong SOP published | Versioning + rollback + approve gate |

---

## 8) Testing & acceptance global

### 8.1 Automated

- Unit: guardrail intent_v2 matrix (allow/block table)
- Unit: article search ranking basic
- Unit: sanitizer strips sample PII-ish fields
- Integration: `/api/chat` logs `HelpInteraction`
- Action tests: publish article requires super-admin

### 8.2 Manual / UAT

| Skenario | Expected |
|----------|----------|
| User di SO buka `?` | Lihat 3–5 langkah + link artikel |
| Tanya “cara buat SO” di chat | Jawaban step + link; tidak diblok |
| Tanya “buatkan SO untuk Budi” | Ditolak mutasi + arahkan UI |
| Error stok kurang | CTA “Lihat panduan stok” |
| Buka `/support` (Phase 1.6) | Sidebar **modul ERP tetap ada**; Bantuan expanded 3 child; **tanpa** tab content |
| Klik child Troubleshooting | Route `/support/troubleshooting`; list filter troubleshoot |
| Klik Tanya Virtual CS | `/support/cs`; chat full; modul nav masih terlihat |
| Legacy `/support?tab=cs&q=...` | Redirect ke `/support/cs?q=...` |
| Super-admin buka `/admin/help` | Lihat volume 7 hari + top gaps |
| Cluster ≥N pertanyaan sama | Draft muncul di learning queue |
| Approve draft | Artikel published & muncul di retrieval |

### 8.3 Success metrics (produk)

**A. 30 hari setelah Phase 1 + 1.5 (first-door baseline)**

| Metrik | Target kasar |
|--------|----------------|
| Tiket/WA “cara pakai” ke founder | −30% vs baseline P0 |
| Chat how-to dengan `citedArticles` | ≥40% |
| Error CTA → buka panduan/CS | terukur (event count > 0) |
| Feedback UP ratio (jawaban cited) | ≥60% |
| Escalation rate | Turun vs baseline Phase 0 |
| Auto-publish incidents | **0** |

**B. 30 hari setelah Phase 1–3 (loop knowledge matang)**

| Metrik | Target kasar |
|--------|----------------|
| Tiket/WA “cara pakai” ke founder | −50% vs baseline P0 |
| Time-to-add knowledge (gap → published) | ≤ 48 jam kerja via queue |
| Draft auto-learn approved / minggu | ≥3 berkualitas (bukan spam) |
| Auto-publish incidents | **0** |

---

## 9) Urutan eksekusi yang disarankan

1. **Phase 0** instrumentasi + guardrail + chips — ✅ done  
2. **Phase 1** hub + seed + contextual + error→help — ✅ done (IA tab = debt, dilunasi 1.6)  
3. **Phase 1.5** Chat Grounding & First-Door UX — ✅ done  
4. **Phase 2** super-admin control plane — ✅ done  
5. **Phase 3** supervised auto-learn infra — ✅ done (butuh traffic + toggle ON)  
6. **Phase 1.6** Support IA: nav utuh + sidebar 3 child + tanpa tab — ← **NEXT**  
7. Seed/publish artikel **prod** + founder redirect 2 minggu  
8. **Phase 4** polish visual chat + tenant-local + evals + credits (bila perlu)

Parallel aman: review top gaps mingguan; konten seed || 1.6.

**Jangan:**  
- polish animasi chat sebelum chrome Bantuan (1.6) beres  
- hardcode lagi `permissions={['/support']}`  
- taruh semua artikel sebagai child sidebar

---

## 10) Effort & risiko

| Phase | Effort | Risiko | Catatan |
|-------|--------|--------|---------|
| 0 | S | Rendah | Schema + logging — done |
| 1 | M | Sedang | UX + seed; F+G first-door — done (tab IA = debt) |
| 1.5 | S | Rendah | Grounding + first-door UX — done |
| 1.6 | S | Rendah | **NEXT** — fix planet-lain: permissions + 3 child sidebar |
| 2 | M | Rendah–sedang | Super-admin — done |
| 3 | M–L | Sedang | Auto-learn infra done; quality butuh traffic |
| 4 | L | Sedang | Scope creep tenant-local + visual polish |

Risiko terbesar **bukan** teknis LLM, tapi:

1. Seed konten jelek / **belum published di prod** → empty state → user tidak percaya help  
2. Auto-learn tanpa sanitizer → bocor/salah SOP  
3. Dashboard tanpa action (hanya grafik) → tidak mengurangi beban founder  
4. Help bagus tapi **tidak muncul di momen error** → user tetap WA founder  
5. Founder tetap jawab WA tanpa redirect → kebiasaan lama menang  
6. Help **mengisolasi nav** (planet lain) → user enggan buka Bantuan — mitigasi **Phase 1.6**  

---

## 11) Keputusan yang perlu konfirmasi dari kamu

Sebelum implementasi, konfirmasi ringkas:

1. **Setuju supervised auto-learn (draft + approve), bukan auto-publish?** (rekomendasi: ya)  
2. **KB global dulu di main DB + super-admin only?** (rekomendasi: ya)  
3. **Tenant-local FAQ** ditunda ke Phase 4? (rekomendasi: ya)  
4. **Siapa reviewer** learning queue — hanya super-admin / + role support internal?  
5. **Channel eskalasi** prioritas: in-app ticket, Telegram, atau email?  
6. **Top 10 pertanyaan** yang paling sering masuk ke kamu minggu ini (untuk seed) — bisa dilampirkan nanti saat eksekusi Phase 1  

---

## 12) Out of scope (sengaja)

- Mengganti engine MES / business logic lewat chat  
- Virtual CS write/mutate transaksi  
- Full autonomous agent yang “belajar tanpa batas” dari internet  
- Knowledge base multi-bahasa full (kecuali ID first)  
- Mengganti dokumentasi engineering internal (`docs/plans`, runbook) — itu beda audience  

---

## 13) Ringkasan satu slide

| Tanya | Jawab |
|-------|--------|
| Baiknya help seperti apa? | Lapisan: kontekstual + FAQ + CS + eskalasi |
| Jadi pintu pertama sebelum founder? | **Ya, bertahap** — error/konteks, seed jujur, citation, **chrome ERP utuh**, redirect founder |
| Bantuan di sidebar? | **3 child** (Cara pakai / Troubleshooting / Tanya CS); modul lain **tetap**; **bukan** tab; **bukan** semua artikel |
| Auto-learn bisa? | **Bisa** — draft otomatis, publish ber-supervisi |
| Manual hilang? | Tidak; berubah jadi **review queue** |
| Super-admin? | **Ya** — settings, metrics, KB, learning queue |
| Chat “modern”? | Grounding dulu (1.5); animasi di Phase 4 |
| Mulai dari mana sekarang? | **Phase 1.6** (fix planet-lain) → seed prod → observe auto-learn |

---

## 14) Next step (status sekarang)

1. ~~Phase 0–3 fitur inti~~ — done  
2. **Phase 1.6 (NEXT):**  
   - N0: `SupportLayout` pakai permission user nyata (bukan `['/support']`)  
   - N1: route `/support`, `/support/troubleshooting`, `/support/cs` — hapus tab  
   - N2: sidebar Bantuan expandable + 3 child  
   - N3: chrome + empty state + redirect `?tab=`  
3. **Publish/verify seed artikel di main DB prod** (hilangkan empty “Belum ada artikel”)  
4. Auto-learn toggle ON setelah traffic; review queue mingguan  
5. Founder habit: 2 minggu redirect “coba Bantuan/CS dulu”  
6. Phase 4 polish visual bila perlu
