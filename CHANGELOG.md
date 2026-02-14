# Changelog

All notable changes to PolyFlow ERP are documented here.

## [Unreleased]

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
