# Changelog

All notable changes to PolyFlow ERP are documented here.

## [1.5.0](https://github.com/clarinovist/polyflow/compare/v1.4.0...v1.5.0) (2026-03-22)


### Features

* standardise quantity decimal formatting and update Unit from PCS to PACK ([2022f5d](https://github.com/clarinovist/polyflow/commit/2022f5d9e52915f0e4596500d5edbec7c7dffd84))


### Bug Fixes

* add pagination to journal entries list ([1c944f9](https://github.com/clarinovist/polyflow/commit/1c944f98da9445d603a9e85f54a9d495b88bcc46))
* **backend:** support pagination in getJournals ([c8bb1c4](https://github.com/clarinovist/polyflow/commit/c8bb1c4a6e2de2f57a71e1e28dd6d59b44877a17))
* **ci:** handle ValueType string to number conversion in StockHistoryChart ([be51200](https://github.com/clarinovist/polyflow/commit/be5120015e63b47e2f04b44f6f9957b1fb84137b))
* **ci:** update recharts formatter types to satisfy strict compilation ([b0ca020](https://github.com/clarinovist/polyflow/commit/b0ca020dffdf381d5dec064c1bcbb1f6695667bd))
* prevent P2025 crash during material substitution in batch issue ([fc83d6f](https://github.com/clarinovist/polyflow/commit/fc83d6f3a0660eb8ce0c939e27ae84dd56db375d))
* Resolve all TypeScript linting errors across the codebase ([71e5ab5](https://github.com/clarinovist/polyflow/commit/71e5ab5cd4883aa7ef5673857f738dc8c291dbe5))
* **test:** configure NextResponse mock for vitest execution ([141df99](https://github.com/clarinovist/polyflow/commit/141df9989d1a00b8f2e0d2becbe21500589149cc))
* **test:** remove unused imports in route.test.ts ([4a28c5b](https://github.com/clarinovist/polyflow/commit/4a28c5b79866936eb7ac5c62aaaac13fa3d68039))


### Performance Improvements

* **coa-audit:** optimize account creation with createMany ([48a1d84](https://github.com/clarinovist/polyflow/commit/48a1d84a23d3f076478a823e236727b1bb2542bc))
* optimize permissions seeding query execution\n\nReplaces O(N) database queries with a single bulk fetch and a single bulk insert using Prisma's `findMany` and `createMany` with `skipDuplicates`, drastically reducing DB load. ([aeee41a](https://github.com/clarinovist/polyflow/commit/aeee41a4d133ceeeeeab4caaff9f4bc466868546))

## [1.4.0](https://github.com/clarinovist/polyflow/compare/v1.3.0...v1.4.0) (2026-03-12)


### Features

* complete sales and purchase returns module ([efcaeb1](https://github.com/clarinovist/polyflow/commit/efcaeb158156d5400184e8d2043192769d8536ca))
* **core:** implement consolidated master plan (P1-P5) ([68a6099](https://github.com/clarinovist/polyflow/commit/68a6099911fc5609b39de5951234cc15a248ad12))


### Bug Fixes

* **accounting:** bypass unbilled payables and directly accrue trade payables on GR ([c5cb483](https://github.com/clarinovist/polyflow/commit/c5cb4839991866c54756c45cc1ecc0f94030cdf4))
* bundle Sentry in standalone build and remove deleted costHistory from seed script ([c8fb4fe](https://github.com/clarinovist/polyflow/commit/c8fb4feb199e9587f8ddde3e1c69febdf54a7977))
* **ci:** add @vitest/coverage-v8 for test coverage reporting ([4d96fb3](https://github.com/clarinovist/polyflow/commit/4d96fb326af78021306a5eee51d1a25ed1e89d9b))
* **ci:** generate dummy SSL certs for Nginx syntax validation ([7b24c59](https://github.com/clarinovist/polyflow/commit/7b24c59fd6d077661eafad29ca1cf8b37b857f8a))
* disable strict ip rate limiting in middleware to prevent false 429 errors on client navigation ([9ec68d8](https://github.com/clarinovist/polyflow/commit/9ec68d814fa5638895dad55bd690a6eea0b57a97))
* handle permission denied for /app/backups in entrypoint - fallback to /tmp/backups ([bfade36](https://github.com/clarinovist/polyflow/commit/bfade3606367f6efe2e948d8fe029a938312acea))
* **nginx:** update domain to polyflow.uk and mock upstream host for CI ([288c654](https://github.com/clarinovist/polyflow/commit/288c6542921289ebc544b07396223f4fe9854259))
* **production:** prevent duplicate planned materials on transfer edit ([7a76086](https://github.com/clarinovist/polyflow/commit/7a76086f4826c0fcfe646b1ef179e7cd9047b2d4))
* Recharts tooltip TS build errors ([eb898b4](https://github.com/clarinovist/polyflow/commit/eb898b470f7db316c65bc05f7375f0a06c211bd7))
* **ui:** adjust grid column spans in Sales and Purchase Return Forms to resolve label overlap ([8759d00](https://github.com/clarinovist/polyflow/commit/8759d00a96491784d16e4f49a9a9dcc58bab5793))
* **ui:** correct typescript mutation inferences in notification bell && update migration docs to polyflow.uk ([aacb078](https://github.com/clarinovist/polyflow/commit/aacb0780320e29f075bf5f82d94f58a8919b5f88))
* **ui:** hide stepper arrows on Qty input in return forms ([9d0f46f](https://github.com/clarinovist/polyflow/commit/9d0f46fb2b9cb66567c0de6cba78f122cb99ae16))
* **ui:** widen Qty column in purchase and sales return forms ([7e22c07](https://github.com/clarinovist/polyflow/commit/7e22c075e2d15c8e986efa0483c8e61098ffe053))

## [1.3.0](https://github.com/clarinovist/polyflow/compare/v1.2.0...v1.3.0) (2026-03-04)


### Features

* add repair script to reverse missed affal backflush WO#WO-260303-EXT17 ([1a64b3a](https://github.com/clarinovist/polyflow/commit/1a64b3a555a5370580bd4dfafbcc2a951d6e5afc))
* **auth:** secure multi-tenant login flow with dedicated super admin route and DB-backed role validation ([97380a5](https://github.com/clarinovist/polyflow/commit/97380a5bdb881b5daf83d7524a9b7b4121d0f72c))


### Bug Fixes

* **accounting:** support uuid product account mapping in auto-journal ([dd40cc5](https://github.com/clarinovist/polyflow/commit/dd40cc5f9818a2baa3b1dd2b660b5b28d518189f))
* include affal (prongkol+daun) in backflush totalConsumed for EXTRUSION orders ([9a8573a](https://github.com/clarinovist/polyflow/commit/9a8573a7062bc904731177d53b96dcad26363d83))
* **prisma:** lock migrate deploy to v5.22.0 to prevent v7 config error ([dd40cc5](https://github.com/clarinovist/polyflow/commit/dd40cc5f9818a2baa3b1dd2b660b5b28d518189f))
* **tenant:** resolve wildcard localhost redirection and centralize subdomain extraction ([866f93f](https://github.com/clarinovist/polyflow/commit/866f93f12c1fa521c4771c62e6c7c02b2b140129))

## [1.2.0](https://github.com/clarinovist/polyflow/compare/v1.1.0...v1.2.0) (2026-02-28)


### Features

* add external api for products and inventory with api key auth ([8e2c33c](https://github.com/clarinovist/polyflow/commit/8e2c33c7ece338c2a1eebf79545f7d1f6b049e7c))
* add migration script for employee receivables and manual journal test ([a74e2f9](https://github.com/clarinovist/polyflow/commit/a74e2f9107272206fc71e4d722c4ece952a0a67b))
* **finance:** refactor closing entry system, fix report inconsistencies, and add opening balance correction ([e4a43a8](https://github.com/clarinovist/polyflow/commit/e4a43a8d51adf7c891e409b0123d006dfb65df7c))
* fix tenant authentication routing, dummy data seeding, and profile data mapping ([a0af056](https://github.com/clarinovist/polyflow/commit/a0af0564541886db7c1f36a61c89afa2e7c7c21a))
* **multi-tenant:** Implementation of Independent Tenant Context routing with AsyncLocalStorage and Server Action proxy ([d7063b0](https://github.com/clarinovist/polyflow/commit/d7063b04e9f458c492beca9f9bb0dbf30febc6d4))
* **sales:** implement smart stock allocation and auto-split MTO/MTS on SO confirm ([fa0f309](https://github.com/clarinovist/polyflow/commit/fa0f309b2dbdb23b3783c60092bfdf5ab0530ae5))
* simplify tenant subdomain middleware ([bfabf7f](https://github.com/clarinovist/polyflow/commit/bfabf7f4f2f33bbf1298f59b97fa3b2fa28f02d3))
* use 11310 Raw Materials for opening balance of Persediaan BB ([d727610](https://github.com/clarinovist/polyflow/commit/d7276105e25ad99fc4f89a66dd2be97c4ad14f41))


### Bug Fixes

* add stock opname double-count correction script (OB-OPNAME-ADJ) ([9bb3f65](https://github.com/clarinovist/polyflow/commit/9bb3f65431da00dfbc653e5c531c4842d96e0230))
* backflush includes scrap quantity in material consumption ([882a359](https://github.com/clarinovist/polyflow/commit/882a3594a7b9b64b92714e4f5ab361016dc0771c))
* **build:** correct BomCategory type in production actions ([cc71f81](https://github.com/clarinovist/polyflow/commit/cc71f81abf7562aae86746f3328e0acff1edc2c4))
* **ci:** add set -e to deploy script for better error handling ([06ed983](https://github.com/clarinovist/polyflow/commit/06ed983da9ef44770577c9416676b81d5f0503c7))
* correct OB-CORRECTION entry date timezone issue (UTC vs WIB) ([a409cd4](https://github.com/clarinovist/polyflow/commit/a409cd4c538d878f8cd0e861b5498665e6aefea5))
* **db:** add cascade delete to StockOpnameItem relation ([de9fd2a](https://github.com/clarinovist/polyflow/commit/de9fd2a4788964a4f76954d1d120e778ec674e2d))
* exclude base domain from subdomain detection in auth.ts ([cc345b6](https://github.com/clarinovist/polyflow/commit/cc345b6521483d2574b990b55f8cb143b784fc34))
* exclude base domain from subdomain detection in settings page ([f169468](https://github.com/clarinovist/polyflow/commit/f1694688022ca5fe2d18b00f6d653bac0713554d))
* exclude base domain from subdomain detection in tenant.ts ([47ad1ef](https://github.com/clarinovist/polyflow/commit/47ad1ef1ff726f131ff7f4316f6eb0b7e25d9998))
* make fix-30000-zero script more comprehensive ([900032e](https://github.com/clarinovist/polyflow/commit/900032ea8b09dcf4b5030e0fdca0a7b222e2d62d))
* prevent unbilled payables (21120) negative balance ([d66d3bc](https://github.com/clarinovist/polyflow/commit/d66d3bc9d8a080a34dbccd5ba06ce26597bb314b))
* production cost flow & inventory GL reclassification ([3b31f64](https://github.com/clarinovist/polyflow/commit/3b31f641003dec26be82061667a5eea5e2042e80))
* recovery script — restore voided OB entries, targeted void only ([2df0799](https://github.com/clarinovist/polyflow/commit/2df079973964f8e32f2dc8609b910307fd3e5c6c))
* **sales:** prevent MTS stock reservations and clean up active reservations upon delivery ([e8de903](https://github.com/clarinovist/polyflow/commit/e8de903dff312745a1e59f15247622c9027140e6))
* sync invoice status when journal is posted ([59f437d](https://github.com/clarinovist/polyflow/commit/59f437d02dab1c1bc5c8b3eb7b385a6b884f288e))
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
