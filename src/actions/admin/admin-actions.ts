"use server";

import { prisma } from "@/lib/core/prisma";
import { exec } from "child_process";
import util from "util";
import { Role } from "@prisma/client";
import { Client } from "pg";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";
import { logger } from "@/lib/config/logger";
import { safeAction, AuthorizationError, BusinessRuleError } from "@/lib/errors/errors";

const execPromise = util.promisify(exec);

function buildTenantDbName(subdomain: string): string {
    const normalized = subdomain.replace(/-/g, '_');
    const dbName = `polyflow_${normalized}`;

    if (!/^[a-z][a-z0-9_]*$/.test(dbName)) {
        throw new BusinessRuleError("Derived database name is invalid.");
    }

    return dbName;
}

function quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
}

export async function createAndProvisionTenant(formData: FormData) {
    return safeAction(async () => {
        const session = await auth();
        if (session?.user?.role !== Role.ADMIN) {
            throw new AuthorizationError("Unauthorized: Super Admin access required.");
        }

        const name = formData.get("name") as string;
        const subdomain = formData.get("subdomain") as string;
        const adminName = formData.get("adminName") as string;
        const adminEmail = formData.get("adminEmail") as string;
        const adminPassword = formData.get("adminPassword") as string;

        if (!name || !subdomain || !adminName || !adminEmail || !adminPassword) {
            throw new BusinessRuleError("All fields are required.");
        }

        // Basic validation
        if (!/^[a-z0-9-]+$/.test(subdomain)) {
            throw new BusinessRuleError("Subdomain must contain only lowercase letters, numbers, and hyphens.");
        }

        // Hash the password before passing to the seeder
        const passwordHash = await bcrypt.hash(adminPassword, 10);

        // 1. Check if subdomain exists in Main DB
        const existing = await prisma.tenant.findUnique({
            where: { subdomain },
        });

        if (existing) {
            throw new BusinessRuleError("Subdomain already exists.");
        }

        const dbName = buildTenantDbName(subdomain);

        // Parse DATABASE_URL from environment to build the new one
        const mainDbUrl = process.env.DATABASE_URL;
        if (!mainDbUrl) {
            throw new BusinessRuleError("Main DATABASE_URL not found in environment.");
        }

        const urlObj = new URL(mainDbUrl);
        urlObj.pathname = `/${dbName}`;
        const newDbUrl = urlObj.toString();

        try {
            // 2. Create the Database using the pg module directly
            console.log(`[SuperAdmin] Creating database: ${dbName}`);

            const client = new Client({
                host: urlObj.hostname,
                port: Number(urlObj.port),
                user: urlObj.username,
                password: urlObj.password,
                database: "postgres", // Connect to default postgres DB to create a new one
            });

            try {
                await client.connect();
                await client.query(`CREATE DATABASE ${quoteIdentifier(dbName)};`);
            } finally {
                await client.end();
            }
        } catch (dbError: unknown) {
            logger.error("Failed to create database", { error: dbError, dbName, module: 'AdminActions' });
            throw new BusinessRuleError(`Failed to create database: ${(dbError as Error).message}`);
        }

        try {
            // 3. Migrate the new database via Prisma
            console.log(`[SuperAdmin] Migrating database: ${dbName}`);
            await execPromise(`npx prisma@5.22.0 migrate deploy`, {
                env: { ...process.env, DATABASE_URL: newDbUrl },
            });

            // 4. Seed the database
            console.log(`[SuperAdmin] Seeding database: ${dbName} for tenant: ${name}`);
            await execPromise(`npx tsx prisma/seed-tenant.ts`, {
                env: {
                    ...process.env,
                    DATABASE_URL: newDbUrl,
                    TENANT_ADMIN_NAME: adminName,
                    TENANT_ADMIN_EMAIL: adminEmail,
                    TENANT_ADMIN_PASSWORD_HASH: passwordHash
                },
            });

            // 5. Register in Main DB
            console.log(`[SuperAdmin] Registering tenant: ${name}`);
            await prisma.tenant.create({
                data: {
                    name,
                    subdomain,
                    dbUrl: newDbUrl,
                    status: 'ACTIVE',
                    plan: 'TRIAL',
                }
            });

            return null;

        } catch (provisionError: unknown) {
            // Rollback: try to drop the database if provisioning failed
            logger.error("Provisioning failed, rolling back...", { error: provisionError, dbName, tenantName: name, module: 'AdminActions' });
            try {
                const client = new Client({
                    host: urlObj.hostname,
                    port: Number(urlObj.port),
                    user: urlObj.username,
                    password: urlObj.password,
                    database: "postgres",
                });
                try {
                    await client.connect();
                    await client.query(`DROP DATABASE ${quoteIdentifier(dbName)};`);
                } finally {
                    await client.end();
                }
            } catch (e) {
                logger.error("Rollback DROP DATABASE failed", { error: e, dbName, module: 'AdminActions' });
            }
            throw new BusinessRuleError(`Provisioning failed: ${(provisionError as Error).message}`);
        }
    });
}

export async function updateTenant(tenantId: string, formData: FormData) {
    return safeAction(async () => {
        const session = await auth();
        if (session?.user?.role !== Role.ADMIN) {
            throw new AuthorizationError("Unauthorized: Super Admin access required.");
        }

        const name = formData.get("name") as string;
        const subdomain = formData.get("subdomain") as string;
        const status = formData.get("status") as string;
        const dbUrl = formData.get("dbUrl") as string;

        if (!name || !subdomain) {
            throw new BusinessRuleError("Name and subdomain are required.");
        }

        if (!/^[a-z0-9-]+$/.test(subdomain)) {
            throw new BusinessRuleError("Subdomain must contain only lowercase letters, numbers, and hyphens.");
        }

        try {
            const existing = await prisma.tenant.findUnique({
                where: { subdomain },
            });

            if (existing && existing.id !== tenantId) {
                throw new BusinessRuleError("Subdomain is already used by another tenant.");
            }

            await prisma.tenant.update({
                where: { id: tenantId },
                data: {
                    name,
                    subdomain,
                    status: status as import("@prisma/client").TenantStatus,
                    dbUrl: dbUrl || undefined,
                }
            });

            return null;
        } catch (error: unknown) {
            if (error instanceof BusinessRuleError) throw error;
            logger.error("Failed to update tenant", { error, tenantId, module: 'AdminActions' });
            throw new BusinessRuleError(`Failed to update tenant: ${(error as Error).message}`);
        }
    });
}

export async function resetTenantAdminPassword(tenantId: string, formData: FormData) {
    return safeAction(async () => {
        const session = await auth();
        if (session?.user?.role !== Role.ADMIN) {
            throw new AuthorizationError("Unauthorized: Super Admin access required.");
        }

        const newPassword = formData.get("newPassword") as string;
        if (!newPassword || newPassword.length < 6) {
            throw new BusinessRuleError("Password must be at least 6 characters.");
        }

        try {
            const tenant = await prisma.tenant.findUnique({
                where: { id: tenantId }
            });

            if (!tenant || !tenant.dbUrl) {
                throw new BusinessRuleError("Tenant or database URL not found.");
            }

            const passwordHash = await bcrypt.hash(newPassword, 10);

            const { getTenantDb, tenantContext } = await import('@/lib/core/prisma');
            const tenantDb = getTenantDb(tenant.dbUrl);

            const result = await tenantContext.run(tenantDb, async () => {
                const adminUser = await getTenantDb(tenant.dbUrl).user.findFirst({
                    where: { role: Role.ADMIN },
                    orderBy: { createdAt: 'asc' }
                });

                if (!adminUser) {
                    throw new BusinessRuleError("No admin user found for this tenant.");
                }

                await getTenantDb(tenant.dbUrl).user.update({
                    where: { id: adminUser.id },
                    data: { password: passwordHash }
                });

                return null;
            });

            return result;
        } catch (e: unknown) {
            if (e instanceof BusinessRuleError) throw e;
            logger.error("Failed to reset tenant admin password", { error: e, tenantId, module: 'AdminActions' });
            throw new BusinessRuleError(`Failed to reset password: ${(e as Error).message}`);
        }
    });
}
