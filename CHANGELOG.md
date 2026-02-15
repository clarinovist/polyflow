# Changelog

All notable changes to PolyFlow ERP are documented here.

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
