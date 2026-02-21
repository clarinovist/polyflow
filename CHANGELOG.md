# Changelog

All notable changes to PolyFlow ERP are documented here.

## [1.2.0](https://github.com/clarinovist/polyflow/compare/v1.1.0...v1.2.0) (2026-02-21)


### Features

* add external api for products and inventory with api key auth ([8e2c33c](https://github.com/clarinovist/polyflow/commit/8e2c33c7ece338c2a1eebf79545f7d1f6b049e7c))
* add migration script for employee receivables and manual journal test ([a74e2f9](https://github.com/clarinovist/polyflow/commit/a74e2f9107272206fc71e4d722c4ece952a0a67b))
* **finance:** refactor closing entry system, fix report inconsistencies, and add opening balance correction ([e4a43a8](https://github.com/clarinovist/polyflow/commit/e4a43a8d51adf7c891e409b0123d006dfb65df7c))
* use 11310 Raw Materials for opening balance of Persediaan BB ([d727610](https://github.com/clarinovist/polyflow/commit/d7276105e25ad99fc4f89a66dd2be97c4ad14f41))


### Bug Fixes

* add stock opname double-count correction script (OB-OPNAME-ADJ) ([9bb3f65](https://github.com/clarinovist/polyflow/commit/9bb3f65431da00dfbc653e5c531c4842d96e0230))
* **build:** correct BomCategory type in production actions ([cc71f81](https://github.com/clarinovist/polyflow/commit/cc71f81abf7562aae86746f3328e0acff1edc2c4))
* **ci:** add set -e to deploy script for better error handling ([06ed983](https://github.com/clarinovist/polyflow/commit/06ed983da9ef44770577c9416676b81d5f0503c7))
* correct OB-CORRECTION entry date timezone issue (UTC vs WIB) ([a409cd4](https://github.com/clarinovist/polyflow/commit/a409cd4c538d878f8cd0e861b5498665e6aefea5))
* **db:** add cascade delete to StockOpnameItem relation ([de9fd2a](https://github.com/clarinovist/polyflow/commit/de9fd2a4788964a4f76954d1d120e778ec674e2d))
* make fix-30000-zero script more comprehensive ([900032e](https://github.com/clarinovist/polyflow/commit/900032ea8b09dcf4b5030e0fdca0a7b222e2d62d))
* prevent unbilled payables (21120) negative balance ([d66d3bc](https://github.com/clarinovist/polyflow/commit/d66d3bc9d8a080a34dbccd5ba06ce26597bb314b))
* production cost flow & inventory GL reclassification ([3b31f64](https://github.com/clarinovist/polyflow/commit/3b31f641003dec26be82061667a5eea5e2042e80))
* recovery script — restore voided OB entries, targeted void only ([2df0799](https://github.com/clarinovist/polyflow/commit/2df079973964f8e32f2dc8609b910307fd3e5c6c))
* update OB-OPNAME-ADJ date to Feb 1, add fix-30000-zero script ([b998301](https://github.com/clarinovist/polyflow/commit/b9983014b94e7ff703bbfd73908e17ba2c3f2ad9))
* use Jan 30 date for OB-CORRECTION to match other OB entries and avoid timezone issues ([1630c4b](https://github.com/clarinovist/polyflow/commit/1630c4b313e00115f3b97e36aea8084a89a24476))

## [1.1.0](https://github.com/clarinovist/polyflow/compare/v1.0.0...v1.1.0) (2026-02-15)


### Features

* enhance production analytics with top scrap products and improved leaderboard layout ([124efff](https://github.com/clarinovist/polyflow/commit/124efff3b5ad1f54c29b3d59285aa44b11df2561))
* implement closing period journal entries and scrap warning in production ([04a1d41](https://github.com/clarinovist/polyflow/commit/04a1d410a008d069643794d5ab85d38884f3edef))


### Bug Fixes

* correct packaging product GL accounts, add debug/fix scripts ([b7fc023](https://github.com/clarinovist/polyflow/commit/b7fc0234b05a20c621ece8df4f8a911494ae0760))
* correct production order filtering for packing and extrusion tabs ([0e61ff1](https://github.com/clarinovist/polyflow/commit/0e61ff12d16c5326c5b10d7eb843272ae190d53f))
* **docker:** add compat-openssl11 for prisma on alpine ([f203e4c](https://github.com/clarinovist/polyflow/commit/f203e4c9fe6712550bec616216367569f243bfe7))
* **docker:** remove compat-openssl11, use native openssl3 with prisma binary target, fix ENV format warnings ([a63c608](https://github.com/clarinovist/polyflow/commit/a63c608404403f11d72925a34a4e4fc031bdd500))
* resolve negative packaging balance, fix closing period build error, add debug scripts ([b3b103d](https://github.com/clarinovist/polyflow/commit/b3b103d3a70e24a1211a8480dce24c2d224f9d60))

## [1.0.0] - 2026-02-15

### Added
- **Testing Foundation** — Vitest unit tests for InventoryService, ProductionCostService, and JournalsService
- **CI Test Gate** — `npm run test:run` integrated into GitHub Actions (tests must pass before build)
- **Automated Versioning** — `release-please` GitHub Action for automatic version bumps and changelog

### Improved
- **Error Handling** — `ApplicationError` hierarchy with `safeAction` wrapper and error boundaries
- **Security & Config** — Parameterized Docker credentials, expanded `.env.example`, health check endpoint
- **Monitoring** — Structured logger with severity levels and error serialization
- **Database Stability** — Verified 43 migrations, automated backup script with 7-day retention

---

## [0.9.0] - 2026-02-14

### Added
- **Standard Cost History** - `CostHistory` model tracking per-variant cost changes with trend charts
- **BOM Cost/Unit Sorting** - Interactive column sorting (asc/desc toggle) on BOM list page
- **Stock Opname Auto-Numbering** - `opnameNumber` column with unique index on `StockOpname`
- **Delete OPEN Opname Sessions** - Users can now delete stock opname sessions that are still OPEN
- **Database Push Script** - `scripts/push-db-to-prod.sh` to sync local DB to production VPS
- **Cash Position Report** - Monthly cash flow breakdown with trend chart and PDF export
- **Fiscal Period Generation** - Fixed button visibility across all years

### Changed
- **BOM Cost Display** - Cost per unit (per kg) is now the primary display; total formula cost moved to secondary
- **Warehouse Operations Page** - Simplified to focus on Job Queue, removed redundant stats
- **Inventory Layout** - Horizontal tab-based warehouse navigator replacing sidebar
- **Date Filters** - Added to Incoming Receipts, Outgoing Orders, Stock Opname pages
- **CI/CD Consolidation** - Merged separate build-and-push and deploy workflows into single `ci-cd.yml`
- **README.md** - Comprehensive update covering 3 weeks of missing development history

### Fixed
- **P2022 Error** - Added missing `opnameNumber` migration for `StockOpname` table
- **P2022 Error** - Applied migration for missing `MaterialIssue.status` column
- **Payment Journal Cleanup** - Voiding journal entries on payment deletion
- **Costing Dashboard** - Handling missing relations and invalid dates in `CostingService`
- **Empty Opname Sessions** - Prevented creation of sessions without items

---

## [v0.1.0] - 2026-01-13

### Initial Release
- Product Management with multi-variant SKU tracking
- Inventory Management with multi-location stock tracking
- Production Module with BOM, Machine, and Work Order management
- Operator Kiosk Portal for production floor
- Warehouse Portal for material fulfillment
- Sales Module (Quotations, Orders, Deliveries, Invoices)
- Purchasing Module (PO, Goods Receipts, Invoices)
- Finance & Accounting (COA, Journals, AR/AP, COGM, WIP)
- Analytics & Reporting dashboards
- PolyFlow Design System with dark mode
- Docker Compose deployment
- Prisma ORM with PostgreSQL
