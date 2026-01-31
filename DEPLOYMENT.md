# Deployment Instructions

## Prerequisites
- Docker Engine installed
- Docker Compose installed (v2.x recommended)

## Setup

1.  **Clone the repository** to your VPS.
2.  **Configure Environment Variables**:
    ```bash
    cp .env.example .env
    ```
    Edit `.env` and set a secure `AUTH_SECRET`:
    ```bash
    openssl rand -base64 32
    ```
  **Critical**: Set `NEXTAUTH_URL` to your canonical public domain (especially for VPS):
    ```bash
  NEXTAUTH_URL=https://your-domain.com # e.g. https://erp.nugrohopramono.my.id
    ```
    
    Update `DATABASE_URL` if you are using an external database. If using the included Postgres service, use the internal container port 5432:
    `DATABASE_URL=postgresql://polyflow:polyflow@polyflow-db:5432/polyflow`

## CI/CD Pipeline (GitHub Actions)

This project includes a **GitHub Actions** workflow (`.github/workflows/build.yml`) that automatically builds and pushes a Docker image to the **GitHub Container Registry (GHCR)** whenever changes are pushed to the `main` branch.

### Prerequisites

To enable this workflow, you must verify the following in your repository settings:

1.  **Actions Secrets**:
    *   `CR_PAT`: A **Personal Access Token (Classic)** with `write:packages` and `read:packages` scopes. This is used as the password to log in to GHCR.
    
2.  **Workflow Permissions**:
    *   The workflow requires `packages: write` and `contents: read` permissions, which are configured in the `build.yml` file itself.

### How it Works

1.  **Trigger**: Pushing to `main`.
2.  **Build**: Docker image is built using `docker build`.
3.  **Cache**: Utilizes Docker Buildx cache (`type=registry`) stored in GHCR (`:buildcache` tag) to speed up subsequent builds.
4.  **Push**: The final image is pushed to `ghcr.io/clarinovist/polyflow:latest`.

### Usage in Production

To use the image built by this pipeline in your `docker-compose.yml`, update the `image` field:

```yaml
services:
  polyflow:
    image: ghcr.io/clarinovist/polyflow:latest
    # build: .  <-- Comment this out if pulling from registry
    # ...
```

## Build and Run

### Option A: Pull from GitHub Container Registry (Recommended)

Since you have a CI/CD pipeline, the recommended way is to pull the pre-built image from GHCR.

1.  **Log in to GHCR** (if private):
    ```bash
    echo $CR_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
    ```

2.  **Pull and Start**:
    ```bash
    docker compose pull
    docker compose up -d
    ```

### Option B: Build Locally (Legacy)

If you made changes directly on the server or want to build from source:

```bash
docker compose up -d --build
```

The application will be accessible via your domain through the ceritakita nginx reverse proxy, e.g. `https://erp.nugrohopramono.my.id`.

> [!NOTE]
> This compose setup does not publish an app port on the host by default (safer). If you need direct access for debugging, temporarily publish `3002:3000` in `docker-compose.yml`.

## Initial Data Seeding

> [!CAUTION]
> The seed command **modifies/resets data**. Run this only once during initial setup!

To populate the database with initial data (users, products, etc.):

To populate the database with initial data (users, products, etc.):

```bash
docker compose exec polyflow node prisma/seed.js
```

**Note**: The seed script is now built into the Docker image, so no manual copying is required.

## One-time production cutover: purge SO/PO/WO history

This repo includes a safety-gated purge script that removes transactional history for:
- Sales Orders (SO) and dependent docs (delivery orders, invoices, related stock movements/reservations)
- Purchase Orders (PO) and dependent docs (goods receipts, purchase invoices/payments, related stock movements)
- Work Orders (WO) which are `ProductionOrder` and dependent docs (shifts, executions, materials, issues, inspections)

It is designed to **keep master data** intact (Products, BOM, Inventory balances, Batches, Locations, Customers, Suppliers).

### What this purge does

Deleted (transaction history)
- Sales: Sales Orders + items, deliveries, sales invoices, stock movements, stock reservations
- Purchasing: Purchase Orders + items, goods receipts + items, purchase invoices + payments, stock movements
- Production (WO = `ProductionOrder`): orders + shifts, executions, planned materials, issues/inspections/scrap
- Finance (optional): auto-generated journal entries that reference deleted transactional docs

Preserved (master data)
- Products, Product Variants, BOMs
- Locations, Customers, Suppliers, Machines

Optional behavior
- `--reset-inventory`: sets Inventory and Batch quantities to 0 (intended for fresh stock opname)

### Prerequisites / Checklist
- Do this in a maintenance window; stop users from creating transactions.
- Confirm you are operating on the correct server and project folder.
- Confirm containers are up: `docker compose ps`
- Confirm the app container has the script: `docker compose exec polyflow ls -la scripts/purge-transaction-history.js`
- Confirm `DATABASE_URL` inside the app container points to the intended DB.

### Backup first (recommended)

Create a compressed Postgres dump from the DB container (saved to the host):

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U polyflow -d polyflow -Fc > backups/polyflow-before-purge.dump
```

### Runbook (docker container)

Dry-run (prints counts only, no changes)

```bash
docker compose exec -T polyflow node scripts/purge-transaction-history.js
```

Execute (delete history)

```bash
docker compose exec -T polyflow node scripts/purge-transaction-history.js --execute --yes --production
```

Common production cutover (recommended for clean slate + stock opname)

```bash
docker compose exec -T polyflow node scripts/purge-transaction-history.js --execute --yes --production --purge-finance --reset-inventory
```

Verify (run dry-run again; transactional counts should be zero)

```bash
docker compose exec -T polyflow node scripts/purge-transaction-history.js
```

Dry-run (recommended first)
- `docker compose exec polyflow node scripts/purge-transaction-history.js`

Execute
- `docker compose exec polyflow node scripts/purge-transaction-history.js --execute --yes --production`

Optional: purge auto-generated finance journals
- `docker compose exec polyflow node scripts/purge-transaction-history.js --execute --yes --production --purge-finance`

Optional: reset Inventory/Batch balances to 0 (for fresh stock opname)
- `docker compose exec polyflow node scripts/purge-transaction-history.js --execute --yes --production --reset-inventory`

### Notes
- Deleting stock movements removes audit trail. Use only if you intentionally want a clean transactional slate.
- If you use `--reset-inventory`, you are explicitly choosing to rebuild balances via stock opname.

## Initial Login

- **URL**: `http://your-server-ip:3002/login`
- **Email**: `admin@polyflow.com`
- **Password**: `admin123`

> [!IMPORTANT]
> Change this password immediately after logging in.

## Troubleshooting

### Database Schema Not Empty (P3005)
If you see migrations failing because the database is not empty (e.g., re-deploying over old volumes), and you want to **reset everything**:

```bash
docker compose down -v
docker compose up -d
```

### Port Conflicts
- **App Port**: This compose setup does not publish an app port on the host by default (access via reverse proxy).
- **DB Port**: Internal only (`5432`). Not exposed to the host by default for security.

## Maintenance

- **View Logs**:
  ```bash
  docker compose logs -f polyflow
  ```

- **Stop Services**:
  ```bash
  docker compose down
  ```

- **Run Migrations Manually**:
  ```bash
  docker compose exec polyflow npx prisma@5.22.0 migrate deploy
  ```

  If you prefer using npm scripts:
  ```bash
  docker compose exec polyflow npm run db:migrate:deploy
  ```

- **Reset Demo Catalog & Production Data (Keep Users)**:
  Use this if you want to start fresh (clear products, BOMs, inventory, production orders, etc.) but keep the admin user and master records.
  ```bash
  docker exec -t polyflow-db psql -U polyflow -d polyflow -h localhost -p 5434 -v ON_ERROR_STOP=1 -c \
    'TRUNCATE TABLE "QualityInspection", "ScrapRecord", "MaterialIssue", "ProductionShift", "ProductionOrder", "ProductionExecution", "ProductionMaterial", "StockReservation", "StockOpnameItem", "StockOpname", "Batch", "BomItem", "Bom", "StockMovement", "Inventory", "SupplierProduct", "ProductVariant", "Product" CASCADE;'
  ```
