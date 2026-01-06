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
    Update `DATABASE_URL` if you are using an external database. If using the included Postgres service, ensure it points to the internal port 5434:
    `DATABASE_URL=postgresql://polyflow:polyflow@polyflow-db:5434/polyflow`

## Build and Run

Run the following command to build the Docker image and start the services in detached mode:

```bash
docker compose up -d --build
```

The application will be accessible at `http://your-server-ip:3002`.

## Initial Data Seeding

> [!CAUTION]
> The seed command **modifies/resets data**. Run this only once during initial setup!

To populate the database with initial data (users, products, etc.):

**Option 1: Standard Method**
```bash
docker compose exec app npx prisma db seed
```

**Option 2: Manual Method (If Standard Fails)**
If you encounter errors about missing `ts-node` or config, use this method:

1.  Copy the seed file to the container:
    ```bash
    # If the file is already compiled to JS locally:
    docker cp prisma/seed.js polyflow-app:/app/prisma/seed.js
    
    # OR if you only have TS, you might need to compile it first or rely on the build process if it includes it.
    ```
    
2.  Run the seed script directly with Node:
    ```bash
    docker compose exec app node prisma/seed.js
    ```

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
- **App Port**: Defaults to `3002` on the host. Change in `docker-compose.yml` if needed.
- **DB Port**: Internal only (`5434`). Not exposed to the host by default for security.

## Maintenance

- **View Logs**:
  ```bash
  docker compose logs -f app
  ```

- **Stop Services**:
  ```bash
  docker compose down
  ```

- **Run Migrations Manually**:
  ```bash
  docker compose exec app npx prisma@5.22.0 migrate deploy
  ```
