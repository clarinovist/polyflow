# Navigation Ownership — Follow-up Backlog

> **Status:** Backlog (not started)  
> **Date:** 2026-07-10  
> **Parent (shipped v1):** [`2026-07-10-navigation-ownership-dedup-plan.md`](./2026-07-10-navigation-ownership-dedup-plan.md)  
> **When to pull:** Saat ada keluhan user, quiet week eng, atau prioritas produk menyentuh area terkait.

**Context:** Nav ownership v1 sudah di `origin/main` (`1285f5d` … `4fce4ef`). Milestone itu **cukup ditutup**. Item di bawah ini **bukan blocker** fitur lain; dikerjakan lain waktu.

**Prinsip tetap berlaku:**

- 1 owner path per entity  
- Multi-entry OK (alias + portal layout)  
- Multi-copy CRUD NOT OK  
- Role = home + permissions, bukan full app clone  

---

## Priority order (recommended)

```txt
P1  Phase 5 — Invoice dual-entry persona split     (user-facing)
P2  Drift test sidebar ↔ NAV_REGISTRY              (cheap eng guard)
P3  Phase 7.2 — Sidebars consume registry          (DX, large)
P4  Phase 8 — Permission DX                        (ops comfort)
P5  Nice-to-haves                                  (as needed)
```

---

## P1 — Phase 5: Invoice dual-entry rationalization

**Why later, not now:** Medium–high risk (AR / finance). v1 already fixed louder confusion (SJ, BOM, maklon).

**Current state:**

| Path | Fetch | Role feel |
|---|---|---|
| `/sales/invoices` | `getSalesInvoices` + unpaid stats | Follow-up sales |
| `/finance/invoices/sales` | `getInvoices` + demand tabs | Accounting |

Both use `InvoiceTable` → user often feels “ada 2 invoice”.

**Target persona split:**

| Portal | Label (proposal) | Needs |
|---|---|---|
| Sales | **Status Invoice** | Outstanding, status, customer link; light actions |
| Finance | **Sales Invoices (Accounting)** | Full list, demand tabs, print, posting tools |

**Suggested task breakdown:**

| Task | Effort | Notes |
|---|---|---|
| 5.1 Label + page description only | S | Zero behavior change; ship first |
| 5.2 `InvoiceTable` variant `sales` \| `finance` | M | Columns/actions per persona |
| 5.3 Optional: unify fetch behind one service | M | Two presenters, one service method |
| 5.4 UAT sales admin + finance | S | Do not drop unpaid follow-up for SALES |

**Do not:**

- Redirect SALES role away from a usable unpaid list  
- Merge routes in one big PR with nav registry work  
- Change posting/journal rules in the same PR as labels  

**Exit criteria:**

- [ ] Sales and Finance menus read as different jobs, not twin pages  
- [ ] SALES still can chase unpaid invoices  
- [ ] FINANCE keeps demand filters / formal tools  

**Trigger to start:** Support/tenant says “invoice dobel / bingung mana yang bener”, or finance packaging polish sprint.

---

## P2 — Drift test: live sidebars vs `NAV_REGISTRY`

**Why before full 7.2:** 80% of integrity value, ~20% of rewrite cost.

**Current gap:**

- `src/lib/navigation/registry.ts` + integrity test = truth for **registry only**  
- Sidebars still hardcode arrays → can drift silently  

**Suggested work:**

1. Test (or script): for each portal, every `href` in `*-sidebar.tsx` must appear in `NAV_REGISTRY` for that workspace (and vice versa, optional).  
2. Fail CI on drift.  
3. Document: when adding menu, update **both** until 7.2 lands.

**Files (likely):**

- `src/lib/navigation/__tests__/sidebar-registry-drift.test.ts` (new)  
- Optionally export link arrays from sidebars for test import  

**Exit criteria:**

- [ ] CI fails if sidebar adds href missing from registry (or registry orphan policy decided)  

**Trigger:** Before any large sidebar churn, or first quiet eng day.

---

## P3 — Phase 7.2: Sidebars consume registry

**Risk:** Medium (all portals visual/nav regression).  
**Depends on:** P2 drift test recommended first.

**Work:**

1. One portal pilot (Sales) — render groups from `getNavItemsForWorkspace('sales')`  
2. Snapshot / visual smoke  
3. Roll warehouse → production → purchasing → finance → master  
4. Optional: icons map by `id` in a small icon registry  
5. Remove duplicated hard-coded link arrays  

**Acceptance (from parent plan):**

- [ ] Adding a menu = primarily one registry edit  
- [ ] No hard-coded duplicate hrefs in portal sidebars  
- [ ] Finance portal included in `NAV_REGISTRY`  

**Trigger:** Eng DX sprint; after invoice phase or after drift test green for 1–2 weeks.

---

## P4 — Phase 8: Permission DX

**Risk:** Medium (JWT / session multi-tenant).  
**User value:** Admin tidak perlu re-login setelah ubah Access Control.

**Ideas (from parent plan):**

- Session update / refresh `allowedResources` without full re-login  
- Prefix match: `/dashboard/boms` grants children  
- Audit coverage for nav resources per tenant  

**Do not start unless:**

- Support sering dapat “permission belum kebaca” setelah AC change  

**Exit criteria:**

- [ ] AC change visible within same session (documented TTL or push refresh)  
- [ ] No cross-tenant leakage in refresh path  

---

## P5 — Nice-to-haves (optional)

| Item | Notes |
|---|---|
| Product read-only alias under production | If PPIC/ops bounce to master products often |
| HPP button on production BOM gated by finance access | Avoid dead CTA for PRODUCTION |
| Global Search indexes alias + canonical paths | Decide alias vs canonical only |
| UAT doc paths for BOM/maklon aliases | `docs/uat/*` still mention only `/dashboard/boms` in places |
| Master Data as own portal long-term | From parent open questions |
| `error.tsx` under `production/boms/[id]` | Parity with dashboard |

---

## Open questions (carry-over)

1. Tenant Melindo/Kiyowo: PRODUCTION always edit BOM, or RolePermission granular?  
2. May WAREHOUSE create DO, or Sales only? (CTA product decision)  
3. Is `/sales/invoices` daily-critical for sales admin, or finance-primary?  
4. Global Search: alias paths, canonical only, or both?  

Answer when pulling the related backlog item — not blockers for other product work.

---

## Suggested future PR titles

| Order | Title | Maps to |
|---|---|---|
| 1 | `fix(sales/finance): clarify invoice dual-entry labels and personas` | Phase 5.1–5.2 |
| 2 | `test(nav): fail CI when sidebar hrefs drift from NAV_REGISTRY` | P2 |
| 3 | `refactor(nav): drive sales sidebar from navigation registry` | Phase 7.2 pilot |
| 4 | `feat(auth): refresh role permissions without full re-login` | Phase 8 |

---

## Explicit non-goals (still)

- Full page tree per role  
- Second DO list in warehouse labeled “Surat Jalan”  
- Deleting canonical `/dashboard/boms` or `/dashboard/maklon/*`  
- Big-bang move of all `dashboard/*` into domain folders  
- Plugin marketplace / tenant module toggle  

---

## Document History

| Date | Change |
|---|---|
| 2026-07-10 | Created as follow-up after nav ownership v1 shipped to `origin/main` |
