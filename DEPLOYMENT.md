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
    
    Update `DATABASE_URL` if you are using an external database. If using the included Postgres service, ensure it points to the internal port 5434:
    `DATABASE_URL=postgresql://polyflow:polyflow@polyflow-db:5434/polyflow`

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
    docker compose -f docker-compose.prod.yml pull
    docker compose -f docker-compose.prod.yml up -d
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
```bash
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d
```
```

### Port Conflicts
- **App Port**: Defaults to `3002` on the host. Change in `docker-compose.yml` if needed.
- **DB Port**: Internal only (`5434`). Not exposed to the host by default for security.

## Maintenance

- **View Logs**:
  ```bash
  ```bash
  docker compose -f docker-compose.prod.yml logs -f polyflow
  ```
  ```

- **Stop Services**:
  ```bash
  ```bash
  docker compose -f docker-compose.prod.yml down
  ```
  ```

- **Run Migrations Manually**:
  ```bash
  docker compose -f docker-compose.prod.yml exec polyflow npx prisma@5.22.0 migrate deploy
  ```

- **Reset Demo Catalog & Production Data (Keep Users)**:
  Use this if you want to start fresh (clear products, BOMs, inventory, production orders, etc.) but keep the admin user and master records.
  ```bash
  docker exec -t polyflow-db psql -U polyflow -d polyflow -h localhost -p 5434 -v ON_ERROR_STOP=1 -c \
    'TRUNCATE TABLE "QualityInspection", "ScrapRecord", "MaterialIssue", "ProductionShift", "ProductionOrder", "ProductionExecution", "ProductionMaterial", "StockReservation", "StockOpnameItem", "StockOpname", "Batch", "BomItem", "Bom", "StockMovement", "Inventory", "SupplierProduct", "ProductVariant", "Product" CASCADE;'
  ```
