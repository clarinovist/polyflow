# Contributing to PolyFlow

## Prerequisites

- Node.js 22+
- Docker & Docker Compose v2.x
- pnpm or npm

## Development Setup

### 1. Clone & Install

```bash
git clone https://github.com/clarinovist/polyflow.git
cd polyflow
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
# Edit .env with your local values (see docs/ENV.md for reference)
```

### 3. Start Services

```bash
# Start PostgreSQL only (recommended for local dev with `npm run dev`)
npm run dev:db

# Or start full stack in Docker
npm run dev:up
```

### 4. Database Setup

```bash
npx prisma@5.22.0 generate
npx prisma@5.22.0 migrate dev
npx prisma@5.22.0 db seed
```

### 5. Run Dev Server

```bash
npm run dev
```

App available at `http://localhost:3000`.

## Available Scripts

| Command                     | Description                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `npm run dev`               | Start dev server (syncs prod DB, generates client, runs Next.js) |
| `npm run dev:db`            | Start only PostgreSQL via Docker Compose                         |
| `npm run dev:up`            | Start full dev stack (app + DB) in Docker                        |
| `npm run dev:up:build`      | Rebuild and start full dev stack                                 |
| `npm run dev:down`          | Stop dev Docker Compose services                                 |
| `npm run db:generate`       | Regenerate Prisma Client                                         |
| `npm run db:migrate:deploy` | Apply pending migrations to database                             |
| `npm run db:migrate:status` | Check migration status                                           |
| `npm run db:seed`           | Seed database with initial data                                  |
| `npm run build`             | Production build (Next.js)                                       |
| `npm run start`             | Start production server                                          |
| `npm run lint`              | Run ESLint                                                       |
| `npm run test`              | Run Vitest test suite                                            |
| `npm run test:watch`        | Run tests in watch mode                                          |
| `npm run test:run`          | Run tests (single pass)                                          |
| `npm run test:coverage`     | Run tests with coverage report                                   |

## Testing

### Writing Tests

- Tests live alongside source code in `__tests__/` directories or as `*.test.ts` files
- Use **Vitest** for unit and integration tests
- Use **Testing Library** for React component tests
- Follow the AAA pattern: **Arrange → Act → Assert**

### Running Tests

```bash
# Single run
npm run test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### Test Structure

```
src/
├── __tests__/           # Domain-agnostic tests
├── actions/
│   └── __tests__/       # Server Action tests
├── lib/
│   └── tools/
│       └── __tests__/   # Tool/utility tests
```

## Code Quality

### Linting

```bash
npm run lint
```

### Code Style

- **Immutability**: Always create new objects, never mutate existing ones
- **File size**: Keep files under 800 lines (target 200-400)
- **Function size**: Keep functions under 50 lines
- **Nesting**: Max 4 levels; prefer early returns
- **Naming**: `camelCase` for functions/variables, `PascalCase` for components/types

### Commit Messages

Use conventional format:

```
<type>: <description>

feat: add stock adjustment history filter
fix: correct FIFO batch allocation order
refactor: extract inventory validation service
docs: update deployment guide
test: add edge cases for BOM scrap calculation
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

## PR Workflow

1. Create a feature branch from `main`
2. Make changes with tests
3. Run `npm run lint && npm run test` to verify
4. Push and create a PR
5. Ensure CI checks pass
6. Request review

## Architecture

- **Next.js 16 App Router** with Server Components + Server Actions
- **Prisma** ORM for database access (PostgreSQL)
- **Zod** for runtime validation
- **shadcn/ui** + Radix UI for components
- **TailwindCSS v4** for styling

See `docs/ARCHITECTURE.md` for full details.
