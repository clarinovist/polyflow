# Changelog

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
