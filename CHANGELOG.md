# Changelog

## [Unreleased]

### Features

* **access-control:** granular per-sub-fitur permission catalog (Phase 0-4)
  - `permission-catalog.ts`: hierarchical ~80 resource paths across all modules
  - `permission-match.ts`: shared `canSeeNavHref`/`filterNavGroups` helpers
  - All portal layouts (sales, purchasing, production, maklon, finance, hrd,
    warehouse) now enforce nested-gate + preferred landing + defense-in-depth
    deep path deny
  - All portal sidebars filter nav by permissions (sales, purchasing, production,
    maklon, finance, hrd, warehouse)
  - Sales mobile BottomNav gates Stok tab on `/warehouse/inventory`
  - `AccessControlTab` rewritten as indented tree from catalog with parent
    bulk-grant + indeterminate state
  - SALES default: `/warehouse` → `/warehouse/inventory` only (least privilege)
  - `updatePermissionsBulk` action for module-root select-all
  - `audit-permission-orphans.ts` script to find stale RolePermission rows

## [1.8.0](https://github.com/clarinovist/polyflow/compare/v1.7.0...v1.8.0) (2026-06-18)


### Features

* add Berita Acara Cash Opname page with print layout ([3602f7e](https://github.com/clarinovist/polyflow/commit/3602f7e48b417444e6e3e61e8ecf0e37725dfd2e))
* add polyflow audit log monitor script ([1d58749](https://github.com/clarinovist/polyflow/commit/1d587494db966712552154d366b19ac7884c28be))
* add telegram notification to audit monitor ([d4e753d](https://github.com/clarinovist/polyflow/commit/d4e753de5129f8a0352611d3c68b677a37c5d331))
* **auth:** centralize access/session policy and optimize api key validation ([af0a19b](https://github.com/clarinovist/polyflow/commit/af0a19b12b3cfe8d4fb003475636b8f733e0c7c6))
* balance sheet summary view with grouped accounts and Cash/Bank expansion ([9b8b66a](https://github.com/clarinovist/polyflow/commit/9b8b66a257a94ec9dc869fcd696136cb430a88a4))
* **finance:** add daily petty cash report workflow ([0d0abb1](https://github.com/clarinovist/polyflow/commit/0d0abb1bf1e5c0475cad4e4c16c661bb20bb5092))
* **production:** karung per-BAL backflush + monthly packing report ([76499a7](https://github.com/clarinovist/polyflow/commit/76499a78198649c9499c507cb0a6567db213ea06))


### Bug Fixes

* accounting audit — tenant-aware account resolver, validation, audit trails, tests ([5e35b91](https://github.com/clarinovist/polyflow/commit/5e35b9193c6f4fd4454ad279def1f2f981384258))
* add dark mode variants to 48 components for full dark mode support ([21ef87a](https://github.com/clarinovist/polyflow/commit/21ef87a9dd5c4bf151467828d4844ee0a3f8c8b5))
* add missing createJournalEntry import in reports-service.ts ([7e5d385](https://github.com/clarinovist/polyflow/commit/7e5d38515f403ef86d6e381a1979b654e91af680))
* auto-detect and fast-forward entryNumber sequence when behind actual entries ([8aa11c8](https://github.com/clarinovist/polyflow/commit/8aa11c8cbda2fc557aea7c8de67f32a4b8bdee22))
* BOM cascade must use standardCost, not inventory average ([2a28aad](https://github.com/clarinovist/polyflow/commit/2a28aad446f2c30fae9abb93b097274ee789f6ed))
* cash opname cleanup — remove unused imports, add KAS BON and PENGEMBALIAN lines ([c3a5e61](https://github.com/clarinovist/polyflow/commit/c3a5e618057d454835ecb7b62339c688d30dcf35))
* **ci:** add back docker/setup-buildx-action for cache support ([277a189](https://github.com/clarinovist/polyflow/commit/277a1898edc203d1ff487887e7e635c03473932f))
* **ci:** add explicit packages:write permission to build-and-push and deploy jobs ([f76d6a6](https://github.com/clarinovist/polyflow/commit/f76d6a66bd08567849f08432bcbacb4fde74195e))
* **ci:** use CR_PAT for ghcr.io push/pull instead of GITHUB_TOKEN ([98589d0](https://github.com/clarinovist/polyflow/commit/98589d07ada1a1fffa624eca4918aec42b9f5222))
* **ci:** use GITHUB_TOKEN instead of CR_PAT for ghcr.io auth ([c8d9a94](https://github.com/clarinovist/polyflow/commit/c8d9a949acd4790c258bd85d64a1858aed4a7772))
* code review fixes for petty cash report — role auth, void audit trail, toast feedback ([464bfcb](https://github.com/clarinovist/polyflow/commit/464bfcbd5cc087c0ac9e574a95b8cad3b16cab4a))
* **dashboard:** remove type export from server action file to prevent Turbopack build failure ([d16fd31](https://github.com/clarinovist/polyflow/commit/d16fd31ba2ce201e908d3592a2c40bc0a696655f))
* fetch all SUP-* codes, parse numeric parts, find max in JS. ([8a28f18](https://github.com/clarinovist/polyflow/commit/8a28f18342acb663d2578573a20d9769e9c5cc60))
* getNextSupplierCode use numeric max instead of lexicographic sort ([8a28f18](https://github.com/clarinovist/polyflow/commit/8a28f18342acb663d2578573a20d9769e9c5cc60))
* production RSC serialization errors caused by minified Decimal class detection ([7f735b0](https://github.com/clarinovist/polyflow/commit/7f735b0eee7e382d776226e4836f65e7767b0bd2))
* **purchasing:** handle null dueDate in PurchaseInvoiceTable and set termOfPaymentDays for opening balance AP entries ([29b5c1d](https://github.com/clarinovist/polyflow/commit/29b5c1d5d335315df7dbc3f18e9cd958375306aa))
* record COGS on sales shipment and fallback standardCost for first production output ([05fdbca](https://github.com/clarinovist/polyflow/commit/05fdbca10615328d5b7ee1fecb9053e35e2aeb87))
* redirect tenant subdomain root path to /login instead of landing page ([228dc11](https://github.com/clarinovist/polyflow/commit/228dc115c42974a825d7e23933aae652f558180d))
* replace 'as any' with proper types in balance sheet tests ([e18bc37](https://github.com/clarinovist/polyflow/commit/e18bc37bc7228aacb93e0d0911d68d42d65b7014))
* **test:** update PackingReportItem expectation with karungConsumed + karungCost fields ([c6a1059](https://github.com/clarinovist/polyflow/commit/c6a1059b64f71b8914a23854b68075fb8e9107d8))
* use GITHUB_TOKEN for ghcr.io auth in build-and-push job ([6fd25d5](https://github.com/clarinovist/polyflow/commit/6fd25d540abd10323d488b286710d6d04ad43dea))
* use GITHUB_TOKEN for ghcr.io login instead of CR_PAT ([7e2cc27](https://github.com/clarinovist/polyflow/commit/7e2cc277ff2de4c0552ba7795b3541082e371a24))

## [1.7.0](https://github.com/clarinovist/polyflow/compare/v1.6.0...v1.7.0) (2026-05-27)


### Features

* add cost guardrail phase 1 diagnostics ([ed47ed2](https://github.com/clarinovist/polyflow/commit/ed47ed2a0b8797439104f7889f65d9c254e8c9d4))
* add maklon stage routing ([af9c604](https://github.com/clarinovist/polyflow/commit/af9c6048beba98f3c42a3ccb98c8d11ecf03697a))
* add raw material price shock simulator ([3b484cc](https://github.com/clarinovist/polyflow/commit/3b484cc6aa1037986212731074af009ac1ae6c44))
* **bom:** expose hpp calculator and material simulator in BOM workspace ([264f7ed](https://github.com/clarinovist/polyflow/commit/264f7eddd94ff4d55005f8dcf943b4c81d36fd44))
* **finance:** expose hpp calculator and material simulator in top-level navigation ([53f8e64](https://github.com/clarinovist/polyflow/commit/53f8e64b84a5c17341f485d840033062573d8efb))
* **finance:** show buyer/supplier on journal metadata (SALES/PURCHASE_INVOICE) ([81b032f](https://github.com/clarinovist/polyflow/commit/81b032f6d1be332e512ebf75acf60a8c24b84438))
* **finance:** show order notes in journal metadata ([d1dbb70](https://github.com/clarinovist/polyflow/commit/d1dbb7090260cab87055bc4e9f689b70dbed3fba))
* harden security, optimize costing queries, and expand test coverage ([6cba39f](https://github.com/clarinovist/polyflow/commit/6cba39f65baa32096916017936cddb0edffd84d3))
* implement BOM tiered cost cascade phases 1-4 ([13ba74c](https://github.com/clarinovist/polyflow/commit/13ba74c5b2ec20171c99620b784b89f9db806c5f))
* **lang:** PR [#1](https://github.com/clarinovist/polyflow/issues/1) — bahasa Indonesia label mapping foundation ([a885c4b](https://github.com/clarinovist/polyflow/commit/a885c4be8cdbf535e7aa0b7e7f077f546942150e))
* **lang:** PR [#3](https://github.com/clarinovist/polyflow/issues/3) — kiosk operator localization ([7e13f7a](https://github.com/clarinovist/polyflow/commit/7e13f7a8b0d00affc32eda629bc8b60b65686166))
* **lang:** PR [#4](https://github.com/clarinovist/polyflow/issues/4)A — warehouse page localization ([88fd78b](https://github.com/clarinovist/polyflow/commit/88fd78b4cb3ec82b8481c12cb42ce4b8b8ffa1c9))
* **lang:** PR [#4](https://github.com/clarinovist/polyflow/issues/4)B — production page localization ([40b985b](https://github.com/clarinovist/polyflow/commit/40b985bc3d1733ce1c51ee47bd77c356090402a5))
* **lang:** PR [#5](https://github.com/clarinovist/polyflow/issues/5) — status display import foundation ([6868b03](https://github.com/clarinovist/polyflow/commit/6868b03041a846905c1e90d3b83bd7c2e82d798c))
* **lang:** PR [#5](https://github.com/clarinovist/polyflow/issues/5) — status display localization ([c4f5bb0](https://github.com/clarinovist/polyflow/commit/c4f5bb0d28d0c8fbd3d2cb4cac8f5640103299a8))
* **lang:** PR [#6](https://github.com/clarinovist/polyflow/issues/6)A — Sales UI localization + polish commit ([b4cbda5](https://github.com/clarinovist/polyflow/commit/b4cbda56e1651432c13d8160dc5bbbff72f957c4))
* **lang:** PR [#6](https://github.com/clarinovist/polyflow/issues/6)B — Purchasing UI localization + polish commit ([86a3f37](https://github.com/clarinovist/polyflow/commit/86a3f37df3d0d1af3cea3732769598d1c388d8f6))
* **lang:** PR [#7](https://github.com/clarinovist/polyflow/issues/7)A — final success toast sweep ([0fe95f4](https://github.com/clarinovist/polyflow/commit/0fe95f4a25e83548bac1a058227a50139a418d8d))
* **lang:** PR [#7](https://github.com/clarinovist/polyflow/issues/7)A — Purchasing module toast success messages ([be2fe9d](https://github.com/clarinovist/polyflow/commit/be2fe9de2702785ddc34e6fb63d4b091b3907b1e))
* **lang:** PR [#7](https://github.com/clarinovist/polyflow/issues/7)A — Sales module toast success messages ([e797743](https://github.com/clarinovist/polyflow/commit/e7977432a0d4be94c73fcabe4f3c94ce88112739))
* **lang:** PR [#7](https://github.com/clarinovist/polyflow/issues/7)A — Warehouse, Customers and other modules toast success messages ([1b378db](https://github.com/clarinovist/polyflow/commit/1b378db0988f48a1a638476d12689883d94ddb6d))
* **lang:** PR [#7](https://github.com/clarinovist/polyflow/issues/7)A-2 — Production + Products + Maklon success toast localization ([8e5440f](https://github.com/clarinovist/polyflow/commit/8e5440f2b2e5a60df8bf5e4f9d6344516e5357f9))
* **lang:** PR [#7](https://github.com/clarinovist/polyflow/issues/7)A-2 — Production detail success toast polish ([dc2d6f5](https://github.com/clarinovist/polyflow/commit/dc2d6f5b00485ff7e8d055af5fc369bff586f807))
* **lang:** PR [#7](https://github.com/clarinovist/polyflow/issues/7)A-3 — Finance/Admin/Settings/Analytics/Warehouse success toast localization ([8c617c2](https://github.com/clarinovist/polyflow/commit/8c617c2c9095d9a791ae09be4d0ef36e4b66cf7f))
* **lang:** PR [#7](https://github.com/clarinovist/polyflow/issues/7)B-1 — Purchasing module error toasts ([92e24e5](https://github.com/clarinovist/polyflow/commit/92e24e51474d3b59474d908197e970f0ed1cd978))
* **lang:** PR [#7](https://github.com/clarinovist/polyflow/issues/7)B-1 — Sales module error toasts ([8017399](https://github.com/clarinovist/polyflow/commit/8017399f992fae020d946e0e14ef4dfd4e1c37e2))
* **lang:** PR [#7](https://github.com/clarinovist/polyflow/issues/7)B-2 — Warehouse and Production error toasts ([969cad9](https://github.com/clarinovist/polyflow/commit/969cad9fcf4496a73f79c5df495be013a3f3636c))
* **lang:** PR [#7](https://github.com/clarinovist/polyflow/issues/7)B-3 — Finance Admin Settings error toasts ([ccd6c41](https://github.com/clarinovist/polyflow/commit/ccd6c41e548734441ecdc08b4820afb76b3f0b92))
* **lang:** PR [#7](https://github.com/clarinovist/polyflow/issues/7)C — empty state localization sweep ([e4b668c](https://github.com/clarinovist/polyflow/commit/e4b668cacfc4bd48418544c97b9c06dd638ecdc4))
* **lang:** PR [#7](https://github.com/clarinovist/polyflow/issues/7)D — confirmation dialog localization ([d07f557](https://github.com/clarinovist/polyflow/commit/d07f55799fffbbce47c897bf0d7a1512309c7804))
* **lang:** PR [#8](https://github.com/clarinovist/polyflow/issues/8) — CTA and loading copy sweep ([12e01af](https://github.com/clarinovist/polyflow/commit/12e01afdf87d9a47e7d317361285e6bd350885f4))
* **lang:** PR [#8](https://github.com/clarinovist/polyflow/issues/8) — final back-link polish ([e103616](https://github.com/clarinovist/polyflow/commit/e103616b0a3211d545b69d2593b852b31b8f1bad))
* **lang:** PR [#8](https://github.com/clarinovist/polyflow/issues/8) — final toast fallback cleanup ([0705813](https://github.com/clarinovist/polyflow/commit/07058133bcee38c8e55590c64aa8da09b15226fb))
* **lang:** PR [#8](https://github.com/clarinovist/polyflow/issues/8) — final user-facing copy cleanup ([069cac3](https://github.com/clarinovist/polyflow/commit/069cac30157cd481ac4cab0b7350734f0b2b8e2e))
* **lang:** PR [#8](https://github.com/clarinovist/polyflow/issues/8) — import and fallback copy polish ([840cd64](https://github.com/clarinovist/polyflow/commit/840cd6429265e05c940903ca740bc795e8a587fd))
* **lang:** PR [#8](https://github.com/clarinovist/polyflow/issues/8) — visible English copy sweep batch 1 ([7157ba2](https://github.com/clarinovist/polyflow/commit/7157ba2bcb72168290c9e75f70059d61a83096d3))
* **opname:** add manual item to stock opname + fix pre-existing TS errors ([7329cb7](https://github.com/clarinovist/polyflow/commit/7329cb7f44dce68e687c22876509513fcae59309))
* **production:** WO Pack output UOM conversion (PACK to KG) ([771278a](https://github.com/clarinovist/polyflow/commit/771278a4da2e511f5f26f7c0426a5df8e6917c4c))
* sales/delivery UOM audit - snapshot entered qty, unit, conversion ([bb5751f](https://github.com/clarinovist/polyflow/commit/bb5751f0e70e2e62cc5b7ab2cfef3b752af4285c))
* switch chatbot LLM to Ollama (deepseek-r1:7b) with env config ([395f400](https://github.com/clarinovist/polyflow/commit/395f400afad78b8f871f222bfe633a764f672590))


### Bug Fixes

* add maklon stock repair ([85c5b14](https://github.com/clarinovist/polyflow/commit/85c5b140a4384acc4f3d1ded78baec1da3d6af7a))
* align production order create inputs with Prisma relations ([e5236fb](https://github.com/clarinovist/polyflow/commit/e5236fb19a44af350d6c3e29ab188e61aec43c87))
* **ci:** handle stale deploy container ([304ffb4](https://github.com/clarinovist/polyflow/commit/304ffb44a57d33035df71cff8354fc524e981b7f))
* correct backflush location resolution for Maklon orders ([c0ff6ac](https://github.com/clarinovist/polyflow/commit/c0ff6ac68ca2732612ba579a042d84c52fa598d6))
* **db:** add self-healing mode to entrypoint to resolve migration drift in production ([c6a4333](https://github.com/clarinovist/polyflow/commit/c6a4333e6efe8ad15c0a9e4e6b45d1ad7f0e69eb))
* fallback to standardCost when inventory value is zero ([f9a12d7](https://github.com/clarinovist/polyflow/commit/f9a12d7d78034f646f3ce35b9e57706fb7fb8008))
* **finance:** fix GL account 12900 error and align COA with transaction types ([761bd16](https://github.com/clarinovist/polyflow/commit/761bd16a77bcdde9d8b404b3ab282b7800f9297b))
* **lang:** getStatusLabel with explicit domain parameter ([33009d7](https://github.com/clarinovist/polyflow/commit/33009d774eafca9ee1091003c719d4181e5d4538))
* **lang:** resolve shadowing + extend sales status mapping ([55d9d10](https://github.com/clarinovist/polyflow/commit/55d9d10739e7526c44f8842ba19446ba4fdd8516))
* lint errors — remove unused variable and no-explicit-any cast ([dfe27b8](https://github.com/clarinovist/polyflow/commit/dfe27b86014e3b282f931202bd6bef20e8e528a7))
* lint errors — rm unused imports, add eslint-disable comments ([348cca6](https://github.com/clarinovist/polyflow/commit/348cca639d14b613deaccafa500182a0b948c067))
* make maklon repair script no-op on clean data ([1868bbf](https://github.com/clarinovist/polyflow/commit/1868bbfc983a6d364c68d6a66f7287b87a19fe1d))
* multi-tenant logout redirect when NEXTAUTH_URL is unset ([47f9529](https://github.com/clarinovist/polyflow/commit/47f952956b757d63ffa4f0a1eaa62883ac7ab8fa))
* **production:** prioritise machine location and use precise avg cost for maklon ([b19d35c](https://github.com/clarinovist/polyflow/commit/b19d35cd22f348d9d7257f78b85700503fb13a0f))
* **production:** resolve consumption location per item for Maklon orders ([469badd](https://github.com/clarinovist/polyflow/commit/469badde3e65f7d97717df220a25d688c9c9a8b6))
* **production:** specify class name for resolveMaterialLocation to avoid this context loss ([8ca182e](https://github.com/clarinovist/polyflow/commit/8ca182edb08d6614a6209e1a419552a0b7cac9b3))
* **products:** align detail types with action payload ([cf29cd9](https://github.com/clarinovist/polyflow/commit/cf29cd9d86af62398e1005ea04923f9f67d08676))
* **products:** unwrap edit product action response ([a9bdef6](https://github.com/clarinovist/polyflow/commit/a9bdef69820e5e253510887b00edf2aab2310faa))
* repair maklon sales order locations ([55aa3ae](https://github.com/clarinovist/polyflow/commit/55aa3ae8761f037e398118f5014c71eac4953c8b))
* sanitize product.variants and variant.inventories to avoid runtime map/reduce on undefined ([468e615](https://github.com/clarinovist/polyflow/commit/468e6152232f050b0aca5aa149971fcae57bb56b))
* **stock-ledger:** perbaiki filter tanggal transaksi hari berjalan ([#41](https://github.com/clarinovist/polyflow/issues/41)) ([9455dd9](https://github.com/clarinovist/polyflow/commit/9455dd938852684c97c3af540a840bdd90c3d8ec))
* unwrap return detail safe action responses ([3943dc4](https://github.com/clarinovist/polyflow/commit/3943dc48c379e7a03fb0712d3e6c2f272bfd071b))
* update CTA buttons on landing page — all point to /register ([5b6a526](https://github.com/clarinovist/polyflow/commit/5b6a52666e0d9b92ff7d3f55f568f8db1994bda2))
* use relation connect in child production order create ([22502e9](https://github.com/clarinovist/polyflow/commit/22502e9829dd82eff44471687fe2769d0388c0f3))
* **vitest:** handle decimal conversionFactor and set default test run mode ([8fee9cc](https://github.com/clarinovist/polyflow/commit/8fee9cce6020c16a59fc83d7e1908e64a90c56dd))
* **warehouse:** refine goods receipt default location logic and fix build errors ([dbef97d](https://github.com/clarinovist/polyflow/commit/dbef97d8f418efd39f1f0604b6a43ab89e350f80))

## [Unreleased]

### Features

* add Cost Guardrail Phase 1 across Product Detail, BOM screens, and finance costing audit with source badges, anomaly warnings, family consistency review, and variant-level cost diagnostics

### Tests

* add cost audit utility tests and expand costing diagnostics coverage for anomaly review workflows

## [1.7.0](https://github.com/clarinovist/polyflow/compare/v1.6.0...v1.7.0) (2026-04-26)


### Features

* add HPP Calculator page, finance actions, and production benchmark service
* add pure HPP simulation utility with baseline and variance calculation support


### Bug Fixes

* **auth:** harden API key handling by storing hashed keys, validating with timing-safe checks, and returning non-sensitive key listing data
* **admin:** harden tenant database create/drop statements using validated and quoted identifiers
* **finance:** remove N+1 stock movement queries in finished goods and WIP cost reporting
* **production:** refactor execution reversal adjacent lookup to single query path
* **production:** remove `any` casts in cost services for maklon conversion cost flow
* **purchasing:** batch return stock movement writes using `createMany`
* **kiosk:** remove unnecessary scanner/session timeout logs and pass operatorId to downtime logging
* **inventory:** remove obsolete commented blocks in bulk adjust and opname detail clients
* **support:** guard agentic debug logs behind `AGENTIC_DEBUG=true`


### Tests

* add tests for sanitize utility, error mapping, guardrails, formatRupiah, tenant subdomain extraction, and HPP calculator utility
* add MaklonCostService tests for transaction and non-transaction flows
* update production execution test mocks for refactored adjacent execution lookup

## [1.6.0](https://github.com/clarinovist/polyflow/compare/v1.5.0...v1.6.0) (2026-04-09)


### Features

* add Polyflow-localized Virtual CS APIs, UI widget, OpenClaw bridge, and diagnostics metrics ([693a6a2](https://github.com/clarinovist/polyflow/commit/693a6a206bf6d720fe8e9da4ef44e834d2590061))
* **audit:** implement logActivity for Product, BOM, and Inventory actions ([6146ae3](https://github.com/clarinovist/polyflow/commit/6146ae39f978dd42bff2e99c24c5855eb4037d6b))
* **daily-report:** complete production reporting kiosk forms and production backflush tracking ([9260ad0](https://github.com/clarinovist/polyflow/commit/9260ad0846b413ab86234a0b0e7fdad993aad94b))
* End-to-end Maklon Jasa workflow with Accounting integrations & bug fixes ([19846a1](https://github.com/clarinovist/polyflow/commit/19846a142d99d89566d67846e8a005c5c03ff1e8))
* handle Next.js deployment version mismatch (Server Action not found) ([2950111](https://github.com/clarinovist/polyflow/commit/2950111e5a193ca57a1d63c275af3f98572c0ec5))
* implement maklon full integration (cost manager, receipt detail, profitability report, and unit tests) ([9d46f52](https://github.com/clarinovist/polyflow/commit/9d46f52c27ce36c569b50a626ef269265f18f76a))
* implement Maklon Returns feature ([e0f4045](https://github.com/clarinovist/polyflow/commit/e0f40459a78a4e4ed0350e5f9a6c865b451dd01c))
* Introduce REWORK handling in production processes ([13bf66a](https://github.com/clarinovist/polyflow/commit/13bf66a7958d8a2f3e6f3c6f158ddd09726a3cf7))
* **maklon:** add button to create maklon receipt and fix maklon receipt detail crash ([98ac2b3](https://github.com/clarinovist/polyflow/commit/98ac2b37e39d0ae9cdd69a7cf064e81cc197fe53))
* **maklon:** Multi-location material transfer and issue support ([d2c2c90](https://github.com/clarinovist/polyflow/commit/d2c2c90089d11b5f020b2ffa7b8ba48ceb137a90))
* **support:** switch Virtual CS to OpenAI / OpenRouter LLM using Qwen ([1c97ad2](https://github.com/clarinovist/polyflow/commit/1c97ad28042752a5d25ce8a368896a4ffc2a9b03))
* **tests:** add edge case tests, stock ledger, buy orders, and prisma schema indexes ([e5502b5](https://github.com/clarinovist/polyflow/commit/e5502b50bc1d2c32f7041f0e4ee76068265f12c4))
* upgrade virtual cs to agentic ai with openrouter tools ([945968a](https://github.com/clarinovist/polyflow/commit/945968ab62aafe25f0d65b5f53db94023f5e4a05))


### Bug Fixes

* **analytics:** handle undefined status in charts and fix(coa): proper import order in audit tool ([5ab79a3](https://github.com/clarinovist/polyflow/commit/5ab79a3d536e3510313f2bd7e5eab3317312a8fb))
* **bot:** correct Qwen model ID for OpenRouter API ([d23ed9f](https://github.com/clarinovist/polyflow/commit/d23ed9fc2f9cd35837d234db05aabb221e111de7))
* **coa:** correctly extract ledgerData from safeAction wrapper to prevent TypeError ([3fc5975](https://github.com/clarinovist/polyflow/commit/3fc5975da8d8e5d2ce818f6bf0e883fa943a126e))
* **coa:** handle undefined elements gracefully in AccountListClient and AccountForm ([f2e55d3](https://github.com/clarinovist/polyflow/commit/f2e55d310dcd942f4271a2dc9a5ee0f831947ec7))
* correctly extract sales order data from safeAction response in detail pages ([366e133](https://github.com/clarinovist/polyflow/commit/366e1331c7ecb3853b52721018d59a96cfb6b472))
* **docker:** move libssl dependencies to base stage for prisma ([b38f32d](https://github.com/clarinovist/polyflow/commit/b38f32d4bcb9fc71059814c42ac707361393d1be))
* **finance:** correctly unwrap safeAction response in finance reports ([c22ac75](https://github.com/clarinovist/polyflow/commit/c22ac75d5e9e7cacc4c5d6e6a746de4941fbc9af))
* **finance:** prevent voiding and reversing auto-generated journals directly from finance module ([47b5f99](https://github.com/clarinovist/polyflow/commit/47b5f991913f2eb4fa7edef03c768d4cf3d9cea4))
* **finance:** remove redundant headers from customer and supplier payments ([45ee126](https://github.com/clarinovist/polyflow/commit/45ee1263d5745f5c2971fec1885a4f0ee19d5087))
* **finance:** update fallback label for walk-in payments and remove fetch limit ([dd8cd17](https://github.com/clarinovist/polyflow/commit/dd8cd1722f62f0617a33552b4c9dfa875b7a5b78))
* **inventory:** prevent runtime TypeError identically when items array is missing in opname ([d58e894](https://github.com/clarinovist/polyflow/commit/d58e89471320ecd3a996a7cc5f4e72c2ce058b41))
* **inventory:** prevent runtime TypeError on missing opname session location ([d9a803b](https://github.com/clarinovist/polyflow/commit/d9a803b3250dc7df2ac0c470785c347fc8e02009))
* **lint:** ignore no-require-imports in query scripts ([56b0906](https://github.com/clarinovist/polyflow/commit/56b0906a9e964bfeadfaf99bd51b10ca13a07a0b))
* **lint:** resolve explicit any typescript-eslint errors ([3120b58](https://github.com/clarinovist/polyflow/commit/3120b58ca1b7d13a16fb976a3061c3a2d87fd4ec))
* **maklon:** prevent stock level overwrite in UI and fix Quick Adjust target location ([e2e6d87](https://github.com/clarinovist/polyflow/commit/e2e6d87d30f15b6339552117e7eec21af38c0f31))
* **purchasing:** allow zero unit cost in goods receipt for maklon materials ([cee22d7](https://github.com/clarinovist/polyflow/commit/cee22d72c6220661dcc9b3546ef2193527cc710e))
* re-throw NEXT_REDIRECT and NEXT_NOT_FOUND in safeAction ([a5d87f7](https://github.com/clarinovist/polyflow/commit/a5d87f7c5056be3a6cb635c2aecc97f51e449816))
* Remove unused STARTER_QUESTIONS variable to resolve ESLint CI failure ([562b0d8](https://github.com/clarinovist/polyflow/commit/562b0d8172e65bc25c6b24139efc52d148fcf57a))
* **sales/quotations:** resolve UX issues in form and clear 86 linter errors ([4757d8a](https://github.com/clarinovist/polyflow/commit/4757d8a1bc301644eb2bd21fa197378b94c20ce7))
* **support:** enhance chat panel design to use industrial glassmorphism and fix text visibility ([c6ed320](https://github.com/clarinovist/polyflow/commit/c6ed3201b6c4154086d58867e5e542dcd8d3892e))
* **support:** init OpenAI client at runtime to avoid build-time cache of undefined env var ([c9f858f](https://github.com/clarinovist/polyflow/commit/c9f858ffc02700fc199b15843a23506a402ddcca))
* **support:** remove client-side auth check preventing widget from rendering ([122da3c](https://github.com/clarinovist/polyflow/commit/122da3cb2e2a9b01b1b4dd8bc7230fe127295ebf))
* **support:** reposition chat widget to bottom-right and remove strict topic filter ([42d959f](https://github.com/clarinovist/polyflow/commit/42d959f66d6912b93fdd2536656c3fad7acb5ed0))
* **test:** bypass eslint any error on maklon test mock ([102bf40](https://github.com/clarinovist/polyflow/commit/102bf40ca2470aaee0de47248ddb8f620684e325))
* **test:** update service mocks to resolve typescript TypeError in CI ([03157d5](https://github.com/clarinovist/polyflow/commit/03157d54a3b246ebd973bbe94018dc811ad4383b))
* **ui:** improve virtual CS chat bubble styling and scrolling, fix unused variable in service ([b83b130](https://github.com/clarinovist/polyflow/commit/b83b1305d52f5498979a383550711c4b8fc82811))
* **ui:** resolve textarea focus bug in virtual cs chat widget ([d6b6128](https://github.com/clarinovist/polyflow/commit/d6b6128501bcf67c76539053b1f2bfa8019be2b8))
* **warehouse:** properly extract opname session data from safeAction result ([99af8c8](https://github.com/clarinovist/polyflow/commit/99af8c8b0ba3654196b6896df3c46c79a316b6ae))
