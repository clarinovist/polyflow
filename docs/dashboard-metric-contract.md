# Dashboard Metric Contract — R0 Baseline

Date: 2026-10-09
Parent: docs/plan/2026-10-09-dashboard-health-roadmap.md
Status: R0 baseline; formulas below describe current behavior, not approval of known defects.

## Semantics

- Kind: STOCK is as-of, FLOW is period-bound, COUNT is a population count, RATIO requires comparable units and a proven denominator, CURRENCY is a presentation unit layered on STOCK/FLOW.
- Failure states: AVAILABLE is query success (including a valid zero); UNAVAILABLE is read failure/partial failure; NOT_CONFIGURED means a required target/definition has no signed source. Empty applies only to an available collection with zero rows.
- All runtime sources below execute inside tenant context. Dashboard data is read-only. Server-side guards remain part of each metric contract.
- “Legacy defect” rows are executable characterization targets in R0 and must be corrected only in their named R1 slice.

## Root dashboards

| Surface / metric ID | Visible label | Owner / source and current formula | Kind, unit, period | Inclusion / exclusion | Target, permission, freshness, drill-down | Zero / failure semantics |
| --- | --- | --- | --- | --- | --- | --- |
| Executive EXEC-REVENUE-MTD | Pendapatan (MTD) | Finance; ExecutiveStatsService, POSTED GL account 4*: credit - debit | FLOW, IDR, WIB MTD | POSTED only | Target NOT_CONFIGURED; ADMIN/FINANCE presentation; client refresh time; no direct report link | 0 is valid; whole action failure => unavailable page |
| Executive EXEC-SPENDING-MTD | Pengeluaran (MTD) | Finance/Purchasing; POSTED GL account 5*: debit - credit | FLOW, IDR, WIB MTD | POSTED only | No target; role presentation; client refresh; Purchasing context | 0 valid; action failure unavailable |
| Executive EXEC-MACHINES-NOW | Mesin Berjalan Saat Ini | Production; distinct machines on IN_PROGRESS SPK / active machine count | COUNT pair, machine, current snapshot | IN_PROGRESS and active machines | No target; role-filtered; client refresh; production | 0 valid |
| Executive EXEC-PRODUCTION-YIELD-LEGACY (C2) | Yield Produksi (MTD) | Production; sum quantityProduced / sum materialIssue quantity × 100 | RATIO, %, MTD | Execution/output and issues in month; units/processes are not grouped | Invalid mixed-unit KPI; R1C removes/replaces; role-filtered; client refresh; production | 0 used when denominator 0 (ambiguous legacy behavior) |
| Executive INV-VALUATION-COMPANY-OWNED (C3) | Nilai Stok | Finance/Inventory; sum quantity × (averageCost ?? standardCost ?? selling price ?? 0) | STOCK+CURRENCY, IDR, current snapshot | Current query has no ownership/location/archive filter | Cost basis NOT_CONFIGURED pending Finance+Warehouse sign-off; role-filtered; client refresh; warehouse inventory | Missing cost becomes 0; query failure makes whole dashboard unavailable |
| Executive INV-LOW-STOCK-INTERNAL | Stok Rendah | Inventory; threshold per variant, inventory summed for INTERNAL RAW_MATERIAL + FINISHED_GOOD | COUNT, variant, current snapshot | No archive filter in executive query; WIP/customer-owned excluded by purpose/type filter | Threshold from variant; role-filtered; client refresh; warehouse inventory | 0 valid |
| Executive FIN-AR-OVERDUE / FIN-AP-OVERDUE | Piutang/Hutang Overdue | Finance; actionable invoice aggregate remaining | STOCK+CURRENCY, IDR, now | AR excludes opening-balance cohorts and requires positive remaining; AP legacy query lacks equivalent positive-balance filter | No target; finance links; client refresh | 0 valid; action failure unavailable |
| Sales SALES-DRAFT / SALES-READY / SALES-OPEN-DO / SALES-TRIPS-TODAY | Draf, Siap Kirim, Pengiriman Berjalan, Armada Hari Ini | Sales; status counts and WIB day bounds | COUNT, document/vehicle, snapshot or today | Lifecycle filters in sales-dashboard | Sales access; no generatedAt; links to workbench | Page currently substitutes zeros on action failure, so unavailable is conflated with zero |
| Sales SALES-AR-OVERDUE | Piutang Jatuh Tempo | Finance/Sales; actionable operational AR remaining | STOCK+CURRENCY + COUNT, IDR/invoice, now | UNPAID/PARTIAL/OVERDUE, due before today, positive remaining; opening-balance cohorts excluded | Sales surface; no generatedAt; invoice drill-down | 0 valid; page fallback conflates failure |
| Sales SALES-READY-NO-DO (C7) | Siap kirim tanpa DO | Sales; legacy takes 20 READY rows, removes rows with open DO, then takes 5 | COUNT/sample, order, current snapshot | READY_TO_SHIP; open DO PENDING/LOADING | Sales access; no generatedAt; order link | Empty can be false because pre-cap hides eligible row |
| Sales SALES-CREDIT-RISK (C7) | Risiko kredit | Sales/Finance; takes 30 customers, performs invoice+SO aggregates per customer, stops at 5 | CURRENCY-derived attention, IDR/customer, current snapshot | Active customer with positive credit limit; unpaid/open SO | Pricing/credit-sensitive; no generatedAt; customer link | Empty can be false; query path is N+1 |
| Sales SALES-REVENUE | Omzet | Finance AnalyticsService; POSTED GL 4* range | FLOW, IDR, selected range | Official GL mapping in analytics service | Target NOT_CONFIGURED; Sales page; report context | 0 valid; page fallback conflates failure |
| Purchasing PUR-PR / PUR-PO-DRAFT / PUR-PO-RECEIPT | PR proses, PO draf, tunggu/sisa terima | Purchasing; lifecycle counts | COUNT, document, snapshot | OPEN/APPROVED PR; DRAFT/SENT/PARTIAL_RECEIVED PO | Purchasing access; no generatedAt; workbench links | 0 valid; page fallback conflates failure |
| Purchasing PUR-AP-OVERDUE (C6) | Hutang jatuh tempo | Finance/Purchasing; legacy notIn PAID/CANCELLED + dueDate < now; amount total-paid | STOCK+CURRENCY + COUNT, IDR/invoice, now | DRAFT can enter; no positive-remaining predicate | Purchasing access; no generatedAt; invoice link | Stale settled rows may count; page fallback conflates failure |
| Purchasing PUR-SPEND-MTD | Belanja bulan ini | Purchasing; PO total created this month | FLOW, IDR, local calendar MTD | Excludes DRAFT/CANCELLED | Budget NOT_CONFIGURED; purchasing access; no generatedAt | 0 valid |
| Purchasing PUR-REORDER | Perlu dipesan ulang | Inventory analytics getSuggestedPurchases | COUNT/sample, variant, snapshot | Current service-defined stock scope | R1B conformance; purchasing access; warehouse link | Empty valid only on successful service |
| Production PROD-OUTPUT-TODAY | Hasil produksi hari ini | Production; positive executions grouped by process + variant + primaryUnit | FLOW, quantity per explicit unit, WIB today | Excludes VOIDED | No target; authenticated production surface; client refresh every 30s | Empty valid; action failure page substitutes empty data |
| Production PROD-SPK-PROGRESS | SPK aktif | Production; produced/planned within each SPK | RATIO, %, live per SPK | IN_PROGRESS; execution excludes VOIDED | Per-SPK plan is available; authenticated; 30s refresh; order link | 0 when planned zero is ambiguous legacy behavior |
| Production PROD-ALERT-DOWNTIME / SCRAP (C4) | Downtime / Scrap Tinggi | Production; action hard-codes >30 minutes and >5% | COUNT/attention, minute/% | Open downtime; IN_PROGRESS execution scrap | Tenant setting exists but action/SWR does not consume it; production access; 30s refresh | Empty valid only if query succeeds; page substitutes empty on failure |
| Warehouse WH-RECEIVE / WH-LOAD / WH-MATERIAL | Terima, Muat, Bahan produksi | Warehouse/Purchasing/Production; lifecycle counts | COUNT, document/SPK, snapshot | SENT/PARTIAL PO, PENDING/LOADING DO, material queue statuses | Authenticated warehouse surface; no generatedAt; workbench links | 0 valid; page fallback conflates failure |
| Warehouse INV-LOW-STOCK-INTERNAL (C5) | Stok menipis | Inventory; threshold per active variant; legacy excludes only SCRAP and CUSTOMER_OWNED | COUNT, variant, snapshot | WIP and other noncanonical locations can suppress alert | R1B canonical location helper; warehouse access; inventory link | 0 valid but may be false-safe |
| Warehouse INV-REORDER-INTERNAL (C5) | Perlu dipesan ulang | Inventory; active variant stock sum vs reorderPoint | COUNT, variant, snapshot | Legacy sums every location, including customer-owned/WIP | R1B canonical stock scope; warehouse access; inventory link | 0 valid but may be false-safe |
| Finance FIN-AR/AP-QUEUE | Piutang/Hutang jatuh tempo & belum lunas | Finance; actionable invoice rows and remaining total | STOCK+CURRENCY + COUNT, IDR/invoice, now | Explicit UNPAID/PARTIAL/OVERDUE; AR positive canonical helper; AP lacks positive filter | Finance read contract; no generatedAt; invoice drill-down | 0 valid; page fallback conflates failure |
| Finance FIN-REVENUE-FLOW | Pendapatan GL | Finance; POSTED account 4* credit-debit in selected range | FLOW, IDR, selected range | POSTED | Finance read contract; no generatedAt; report detail | 0 valid; unavailable conflated on page |
| Finance FIN-CASH/AR/AP-ASOF (C1) | Posisi kas / piutang GL / hutang GL | Finance; currently POSTED movement inside startDate-endDate | Mislabelled STOCK, IDR, selected range (legacy) | Opening entries before start are excluded | R1A must reconcile report as-of endDate; finance guard currently missing (C8) | 0 ambiguous because range can erase opening balance |
| HR HR-PRESENT-TODAY | Hadir hari ini | HRD; AttendanceService summary unique employees | COUNT, person, WIB today | Attendance semantics owned by service | Attendance rate NOT_CONFIGURED; ADMIN/HRD+Finance guard; no generatedAt; attendance detail | Catch currently converts summary failure to 0 (unavailable conflation) |
| HR HR-LEAVE / HR-LOAN / HR-PAYROLL / HR-ALERT | Cuti, pinjaman, payroll, alert | HRD/payroll services and lifecycle counts | COUNT or STOCK+CURRENCY, snapshot | Domain statuses in action/service | HRD finance capability; no generatedAt; domain links | 0 valid only after successful section reads |
| Maklon MKL-NAV-ONLY | Portal Maklon | Static navigation; no condition metric | NOT_CONFIGURED | No source/cohort metric on root | R5A decision gates; route-level access | No data is not zero |
| Distribution DST-NAV-ONLY | Portal Distributor | Static navigation; no condition metric | NOT_CONFIGURED | No discriminator/cohort on root | R5B discovery gate; route-level access | No data is not zero |

## Mobile and field dashboards

| Surface / metric family | Owner / current source | Kind / period | Contract notes |
| --- | --- | --- | --- |
| Admin mobile ADM-EXCEPTIONS / APPROVALS / TASKS / MODULES | MobileAdminService composes Production, Inventory, Purchasing, Finance, HRD readers | COUNT, current snapshot, generatedAt server | Module errors become UNAVAILABLE with null counts; totals exclude unavailable modules. Drill-down per task. Permission is admin mobile portal. |
| Field Sales FS-ROUTE / COMPLIANCE / PIPELINE | Sales route plan, compliance, pipeline services | COUNT/RATIO per explicit route/visit denominator, WIB today, no shared generatedAt | Today-first operational view. Preserve route/compliance definitions; R6 adds common freshness/failure states. |
| Field Sales FS-AR | Finance sales invoice source reduced client-side | STOCK+CURRENCY + COUNT, now | Action failure returns page-level MobileReadError; operational opening-balance exclusions must remain canonical. |
| Field Marketing FM-PIPELINE / REVIEWS / AR | Sales mobile marketing action | COUNT and permission-aware currency, current snapshot, generatedAt server | Amount exists only when capability is granted. |
| Purchasing mobile PM-PR / PO / RECEIPT / ETA / AP | Purchasing mobile action | COUNT and permission-aware IDR, current/today, generatedAt server | AP should converge with Finance in R1D; amount omitted server-side without price capability. |
| Production mobile PRM-SPK / OUTPUT / TARGET / DOWNTIME / QC | Production supervisor action + tenant threshold action | COUNT/quantity grouped only partly; WIB today, generatedAt server | Target mixed mode is currently rendered as one summed “campuran” value: target definition NOT_CONFIGURED pending Production sign-off. Downtime threshold is tenant-aware in mobile. |
| Finance mobile FNM-AR / AP / JOURNAL / RECON / READINESS | Finance mobile action | COUNT, current snapshot, generatedAt server | Nominal is not in root highlights; finance mobile guard required. |
| HRD mobile HRM-PRESENT / LEAVE / REMINDER / PAYROLL | HRD mobile action | COUNT, WIB today/current snapshot, generatedAt server | Present is not an attendance rate. Personal rows only inside HRD portal; no aggregate payroll nominal. |
| Warehouse mobile WHM-LOAD / RECEIVE / OPNAME / TODAY | Multiple inventory/purchasing services composed in page | COUNT, current/today, no generatedAt | Entire result unavailable when key actions fail; PurchaseService/today KPI failures are not uniformly represented. R6 owns freshness parity. |

## R0 executable characterization coverage

| Defect | Executable baseline | R1 owner |
| --- | --- | --- |
| C1 | finance-dashboard test proves cash/AR/AP aggregate receives both range boundaries | R1A |
| C2 | executive service test proves scalar output/input becomes global yield without unit dimension | R1C |
| C3 | executive service test proves unscoped customer-owned fixture can use selling-price fallback | R1B |
| C4 | production live-overview test executes a 60-minute downtime and proves the zero-argument action hard-codes it critical without tenant threshold input | R1C |
| C5 | warehouse test proves WIP can suppress RM low-stock | R1B |
| C6 | purchasing test proves denylist admits DRAFT and has no positive-remaining predicate | R1D |
| C7 | sales test proves READY/customer candidate pre-caps and per-customer aggregates | R1E |
| C8 | finance-dashboard test proves requireAuth executes while Finance read guard does not | R1A |

## Decision gates carried forward

Cost basis valuation, Production target grouping, Executive target source, Purchasing on-time event, inventory accuracy denominator/cutoff, attendance/turnover denominator, Maklon margin cohort, Distribution cohort, and any new SLA remain NOT_CONFIGURED until owner evidence required by parent roadmap exists. No R0 test or row above supplies that sign-off.
