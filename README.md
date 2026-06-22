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

- Node.js 20+
- PostgreSQL 15+
- npm

### Installation

```bash
# Clone
git clone <repository-url>
cd polyflow

# Install
npm install

# Environment
cp .env.example .env
# Edit .env with your database credentials

# Database
npx prisma migrate dev
npx prisma db seed

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Multi-Tenancy

PolyFlow uses **database-per-tenant** isolation. Each tenant has its own PostgreSQL database, accessed via subdomain routing (e.g., `kiyowo.polyflow.uk`).

---

## Project Structure

```
src/
├── actions/       # Server actions
├── services/      # Business logic
├── app/           # Next.js App Router pages
├── components/    # React components
├── lib/           # Utilities, auth, schemas
prisma/            # Database schema & migrations
scripts/           # Operational scripts
```

---

## Scripts

| Command         | Description              |
| --------------- | ------------------------ |
| `npm run dev`   | Start development server |
| `npm run build` | Production build         |
| `npm run test`  | Run tests                |
| `npm run lint`  | Run linter               |

---

## License

Private and proprietary.

---

**Author:** Nugroho
