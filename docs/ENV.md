# Environment Variables Reference

Source of truth: `.env.example`

## Required Variables

| Variable            | Description                   | Example                                                  |
| ------------------- | ----------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`      | PostgreSQL connection string  | `postgresql://polyflow:polyflow@localhost:5434/polyflow` |
| `AUTH_SECRET`       | NextAuth.js session secret    | Generate: `openssl rand -base64 32`                      |
| `NEXTAUTH_SECRET`   | NextAuth.js encryption secret | Generate: `openssl rand -base64 32`                      |
| `AUTH_TRUST_HOST`   | Trust reverse-proxy host headers (required behind nginx, multi-tenant) | `true`                          |

> **Multi-tenant note:** Do **not** set `NEXTAUTH_URL`/`AUTH_URL` to a single
> canonical domain. This app is multi-tenant (each tenant is served on its own
> subdomain, e.g. `kiyowo.polyflow.uk`, and superadmin on `admin.polyflow.uk`).
> Pinning `NEXTAUTH_URL` to one host breaks auth on the other hosts. Instead set
> `AUTH_TRUST_HOST=true` so Auth.js trusts the `Host`/`X-Forwarded-*` headers the
> reverse proxy forwards. Only `NEXTAUTH_URL_INTERNAL=http://localhost:3000` is
> used (for internal container calls).

## Database (Docker Compose)

| Variable            | Required | Description         | Default      |
| ------------------- | -------- | ------------------- | ------------ |
| `POSTGRES_USER`     | Yes      | PostgreSQL username | `polyflow`   |
| `POSTGRES_PASSWORD` | Yes      | PostgreSQL password | — (must set) |
| `POSTGRES_DB`       | Yes      | Database name       | `polyflow`   |

## Migration Control

| Variable          | Required | Description                                           | Default |
| ----------------- | -------- | ----------------------------------------------------- | ------- |
| `SKIP_MIGRATIONS` | No       | Set to `1` to skip auto-migrations on container start | `0`     |

## AI / LLM (Optional)

| Variable       | Required | Description                    | Default                     |
| -------------- | -------- | ------------------------------ | --------------------------- |
| `LLM_BASE_URL` | No       | OpenAI-compatible endpoint URL | `http://localhost:11434/v1` |
| `LLM_API_KEY`  | No       | API key for LLM service        | —                           |
| `LLM_MODEL`    | No       | Model identifier               | `deepseek-r1:7b`            |

## Company Configuration (Optional)

Used for print templates (invoices, delivery orders, etc.):

| Variable                | Description                                  | Example                                              |
| ----------------------- | -------------------------------------------- | ---------------------------------------------------- |
| `COMPANY_NAME`          | Business name                                | `CV MELINDO JAYA`                                    |
| `COMPANY_LOGO_URL`      | Logo path                                    | `/logos/melindo.png`                                 |
| `COMPANY_ADDRESS`       | Business address                             | `Puri Niaga RT.005 RW.006, Sawahan...`               |
| `COMPANY_PHONE`         | Contact phone                                | `0271 82017580, 0271 6882007`                        |
| `COMPANY_EMAIL`         | Contact email                                | `jaya.melindo@gmail.com`                             |
| `COMPANY_SIGNER_NAME`   | Authorized signer                            | `Nugroho Pramono`                                    |
| `COMPANY_FOOTER_NOTE`   | Print footer text                            | `BARANG YANG SUDAH DITERIMA TIDAK BISA DIKEMBALIKAN` |
| `BANK_ACCOUNTS_NON_PPN` | Bank accounts (JSON array) for non-PPN sales (print templates) | `[{"holder":"...","bank":"...","account":"..."}]`    |
| `BANK_ACCOUNTS_PPN`     | Bank accounts (JSON array) for PPN sales (print templates)     | `[{"holder":"...","bank":"...","account":"..."}]`    |

Payment method labels (Transfer BCA/Mandiri + Cek/Giro clearing) use **in-app Settings**
stored per tenant in `AppSetting` (`payment.banks`), not env vars.

## Backup Script (Optional)

| Variable         | Description                  | Default                 |
| ---------------- | ---------------------------- | ----------------------- |
| `BACKUP_DIR`     | Backup file output directory | `/opt/backups/polyflow` |
| `DB_CONTAINER`   | Docker container name for DB | `polyflow-db`           |
| `RETENTION_DAYS` | Days to keep backup files    | `7`                     |
