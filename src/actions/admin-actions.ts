"use server";

import { prisma } from "@/lib/prisma";
import { exec } from "child_process";
import util from "util";
import { Role } from "@prisma/client";
import { Client } from "pg";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";

const execPromise = util.promisify(exec);

export async function createAndProvisionTenant(formData: FormData) {
    const session = await auth();
    if (session?.user?.role !== Role.ADMIN) {
        throw new Error("Unauthorized: Super Admin access required.");
    }

    const name = formData.get("name") as string;
    const subdomain = formData.get("subdomain") as string;
    const adminName = formData.get("adminName") as string;
    const adminEmail = formData.get("adminEmail") as string;
    const adminPassword = formData.get("adminPassword") as string;

    if (!name || !subdomain || !adminName || !adminEmail || !adminPassword) {
        return { error: "All fields are required." };
    }

    // Basic validation
    if (!/^[a-z0-9-]+$/.test(subdomain)) {
        return { error: "Subdomain must contain only lowercase letters, numbers, and hyphens." };
    }

    // Hash the password before passing to the seeder
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    // 1. Check if subdomain exists in Main DB
    const existing = await prisma.tenant.findUnique({
        where: { subdomain },
    });

    if (existing) {
        return { error: "Subdomain already exists." };
    }

    const dbName = `polyflow_${subdomain.replace(/-/g, '_')}`;

    // Parse DATABASE_URL from environment to build the new one
    // e.g. postgresql://user:pass@host:port/dbname
    const mainDbUrl = process.env.DATABASE_URL;
    if (!mainDbUrl) {
        return { error: "Main DATABASE_URL not found in environment." };
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

        await client.connect();
        await client.query(`CREATE DATABASE ${dbName};`);
        await client.end();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (dbError: any) {
        console.error("Failed to create database:", dbError);
        return { error: `Failed to create database: ${dbError.message}` };
    }

    try {
        // 3. Migrate the new database via Prisma
        console.log(`[SuperAdmin] Migrating database: ${dbName}`);
        await execPromise(`npx prisma@5.22.0 migrate deploy`, {
            env: { ...process.env, DATABASE_URL: newDbUrl },
        });

        // 4. Seed the database
        console.log(`[SuperAdmin] Seeding database: ${dbName} for tenant: ${name}`);
        // We use tsx assuming it's available, otherwise fallback to npx prisma db seed.
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

        return { success: true };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (provisionError: any) {
        // Rollback: try to drop the database if provisioning failed
        console.error("Provisioning failed, rolling back...", provisionError);
        try {
            const client = new Client({
                host: urlObj.hostname,
                port: Number(urlObj.port),
                user: urlObj.username,
                password: urlObj.password,
                database: "postgres",
            });
            await client.connect();
            await client.query(`DROP DATABASE ${dbName};`);
            await client.end();
        } catch (e) {
            console.error("Rollback DROP DATABASE failed:", e);
        }
        return { error: `Provisioning failed: ${provisionError.message}` };
    }
}

export async function updateTenant(tenantId: string, formData: FormData) {
    const session = await auth();
    if (session?.user?.role !== Role.ADMIN) {
        throw new Error("Unauthorized: Super Admin access required.");
    }

    const name = formData.get("name") as string;
    const subdomain = formData.get("subdomain") as string;
    const status = formData.get("status") as string;
    const dbUrl = formData.get("dbUrl") as string;

    if (!name || !subdomain) {
        return { error: "Name and subdomain are required." };
    }

    if (!/^[a-z0-9-]+$/.test(subdomain)) {
        return { error: "Subdomain must contain only lowercase letters, numbers, and hyphens." };
    }

    try {
        const existing = await prisma.tenant.findUnique({
            where: { subdomain },
        });

        if (existing && existing.id !== tenantId) {
            return { error: "Subdomain is already used by another tenant." };
        }

        await prisma.tenant.update({
            where: { id: tenantId },
            data: {
                name,
                subdomain,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                status: status as any,
                dbUrl: dbUrl || undefined, // Don't wipe it out if empty accidentally
            }
        });

        return { success: true };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("Failed to update tenant:", error);
        return { error: `Failed to update tenant: ${error.message}` };
    }
}

export async function resetTenantAdminPassword(tenantId: string, formData: FormData) {
    const session = await auth();
    if (session?.user?.role !== Role.ADMIN) {
        throw new Error("Unauthorized: Super Admin access required.");
    }

    const newPassword = formData.get("newPassword") as string;
    if (!newPassword || newPassword.length < 6) {
        return { error: "Password must be at least 6 characters." };
    }

    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId }
        });

        if (!tenant || !tenant.dbUrl) {
            return { error: "Tenant or database URL not found." };
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);

        // Dynamically import tenant context tools
        const { getTenantDb, tenantContext } = await import('@/lib/prisma');
        const tenantDb = getTenantDb(tenant.dbUrl);

        // Run query logically switched to the tenant DB
        const result = await tenantContext.run(tenantDb, async () => {
            // Find the primary admin (usually the first one created)
            const adminUser = await getTenantDb(tenant.dbUrl).user.findFirst({
                where: { role: Role.ADMIN },
                orderBy: { createdAt: 'asc' }
            });

            if (!adminUser) {
                return { error: "No admin user found for this tenant." };
            }

            await getTenantDb(tenant.dbUrl).user.update({
                where: { id: adminUser.id },
                data: { password: passwordHash }
            });

            return { success: true };
        });

        return result;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        console.error("Failed to reset tenant admin password:", e);
        return { error: `Failed to reset password: ${e.message}` };
    }
}
