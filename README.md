# PolyFlow ERP 🏭

**Modern ERP for Plastic Converting Manufacturing**

PolyFlow is a multi-tenant ERP system designed for plastic converting and manufacturing operations. Built with **Next.js 16**, **Prisma**, and **PostgreSQL**.

---

## Features

- **Multi-location Inventory** — Real-time stock tracking, transfers, adjustments, and stock opname
- **Production Management** — BOM, work orders, material consumption, scrap tracking
- **Sales & Purchasing** — Quotations, orders, delivery, goods receipt, invoicing
- **Finance & Accounting** — Double-entry journal, chart of accounts, fiscal periods, payments
- **Multi-Portal** — Admin dashboard, warehouse portal, operator kiosk, finance workspace
- **AI Chatbot** — Natural language queries for analytics and reporting

---

## Tech Stack

| Layer     | Technology                 |
| --------- | -------------------------- |
| Framework | Next.js 16 (App Router)    |
| Language  | TypeScript                 |
| Database  | PostgreSQL 15 + Prisma ORM |
| UI        | shadcn/ui + Tailwind CSS 4 |
| Auth      | NextAuth v5 (JWT)          |
| Testing   | Vitest                     |

---

## Getting Started

### Prerequisites

- Node.js sesuai [`.nvmrc`](.nvmrc) (gunakan `nvm install && nvm use`)
- PostgreSQL 15+
- npm

### Installation

```bash
# Clone
git clone <repository-url>
cd polyflow

# Install using the committed lockfile
nvm install
nvm use
npm ci

# Environment
cp .env.example .env
# Edit .env with credentials for a disposable LOCAL development database only

# Database (verify DATABASE_URL targets your local database before migrating/seeding)
npm run db:generate
npx prisma@5.22.0 migrate dev
npm run db:seed

# Run Next.js without the production-to-local DB sync wrapper
npx next dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Database safety:** `npm run dev` also runs `scripts/sync-db-prod.sh`, which
> downloads production data and restores local databases before starting Next.js.
> Use it only when that sync is explicitly intended and approved. `npx next dev`
> skips the sync, but the app still uses the database configured in `.env`.
> See [CONTRIBUTING](docs/CONTRIBUTING.md) for setup details.

---

## Multi-Tenancy

PolyFlow uses **database-per-tenant** isolation. Each tenant has its own PostgreSQL database, accessed via subdomain routing (for example, `tenant.example.com`).

---

## Project Structure

```text
src/               # Application source, grouped by layer and domain
├── actions/       # Server actions
├── services/      # Business logic
├── app/           # Next.js App Router pages
├── components/    # React components
└── lib/           # Utilities, auth, schemas
prisma/            # Database schema & versioned migrations
docs/              # Guides, reference docs, and explicitly marked archives
scripts/           # Operational tools, CI helpers, and archived scripts
public/            # Static application assets
```

See the [repository map](docs/development/repository-structure.md) for file placement
and the distinction between shared source, historical documents, and local artifacts.

---

## Scripts

| Command         | Description                                      |
| --------------- | ------------------------------------------------ |
| `npx next dev`  | Start Next.js without production DB sync          |
| `npm run dev`   | Sync production DB to local, then start Next.js    |
| `npm run build` | Production build                                 |
| `npm run test`  | Run tests                                        |
| `npm run lint`  | Run linter                                       |

## Documentation

- [Documentation index](docs/README.md)
- [Contributing and local setup](docs/CONTRIBUTING.md)
- [Architecture overview](ARCHITECTURE.md)
- [Release changelog](CHANGELOG.md)
- [Script directory guide](scripts/README.md)
- [Workflow and verification policy](AGENTS.md)

---

## License

Private and proprietary.

---

**Author:** Nugroho
