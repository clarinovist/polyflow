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
    Update `DATABASE_URL` if you are using an external database, otherwise the default value works with the included Postgres service.

## Initial Data Seeding

> [!CAUTION]
> The seed command **deletes existing data**. Run this only once during initial setup!

To populate the database with initial data (users, products, etc.), run:

```bash
docker compose up -d --build
docker compose exec app npx prisma db seed
```

## Initial Login

- **Email**: `admin@polyflow.com`
- **Password**: `admin123`

> [!IMPORTANT]
> Change this password immediately after logging in.

## Build and Run

Run the following command to build the Docker image and start the services in detached mode:

```bash
docker compose up -d --build
```

## Maintenance

- **View Logs**:
  ```bash
  docker compose logs -f app
  ```

- **Stop Services**:
  ```bash
  docker compose down
  ```

- **Run Migrations Manually** (if needed):
  ```bash
  docker compose exec app npx prisma migrate deploy
  ```
