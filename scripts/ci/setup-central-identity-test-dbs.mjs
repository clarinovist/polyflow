import { readFileSync } from 'node:fs';
import pg from 'pg';

if (process.env.CI !== 'true') throw new Error('This fixture is CI-only');
const raw = process.env.CENTRAL_IDENTITY_TEST_ADMIN_URL;
if (!raw) throw new Error('CENTRAL_IDENTITY_TEST_ADMIN_URL is required');
const adminUrl = new URL(raw);
if (
    adminUrl.protocol !== 'postgresql:' ||
    adminUrl.hostname !== '127.0.0.1' ||
    adminUrl.port !== '55439' ||
    adminUrl.pathname !== '/postgres' ||
    adminUrl.search
) {
    throw new Error('Only the isolated localhost CI service is allowed');
}

const databases = [
    'polyflow_central_main_test',
    'polyflow_central_tenant_a_test',
    'polyflow_central_tenant_b_test',
];
const featureSql = readFileSync(
    'prisma/migrations/20260927_multi_tenant_identity_foundation/migration.sql',
    'utf8',
);
const roleValues = [
    'ADMIN',
    'WAREHOUSE',
    'PRODUCTION',
    'PLANNING',
    'FINANCE',
    'HRD',
    'SALES',
];
const baselineSql = `
CREATE TYPE "Role" AS ENUM (${roleValues.map((role) => `'${role}'`).join(',')});
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE','SUSPENDED','TRIAL');
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT,
  "password" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'WAREHOUSE',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
  "tokenVersion" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE "Tenant" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "subdomain" TEXT NOT NULL UNIQUE,
  "dbUrl" TEXT NOT NULL,
  "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
  "plan" TEXT NOT NULL DEFAULT 'TRIAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
try {
    for (const database of databases) {
        // Never drop/reset an existing DB. A collision fails the CI job.
        await admin.query(`CREATE DATABASE "${database}"`);
        const target = new URL(adminUrl);
        target.pathname = `/${database}`;
        const db = new pg.Client({ connectionString: target.toString() });
        await db.connect();
        try {
            await db.query(baselineSql);
            // Execute the exact feature migration, including CHECK constraints
            // and partial unique indexes Prisma cannot express.
            await db.query(featureSql);
        } finally {
            await db.end();
        }
    }
} finally {
    await admin.end();
}
console.log('Disposable MAIN and two tenant identity databases are ready.');
