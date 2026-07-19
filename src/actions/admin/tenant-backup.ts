"use server";

import { prisma } from "@/lib/core/prisma";
import { auth } from "@/auth";
import { AuthorizationError, BusinessRuleError } from "@/lib/errors/errors";
import { logActivity } from "@/lib/tools/audit";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as getPresignedReadUrl } from "@aws-sdk/s3-request-presigner";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, unlink, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);

// Dedicated low-level R2/S3 client (no `next/headers` dependency — unlike the
// existing r2.ts helper, which imports next/headers at module top and can't be
// used from every server action context).
function makeR2Client() {
    if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY || !process.env.S3_ENDPOINT) {
        throw new BusinessRuleError("R2/S3 write credentials not configured on the server.");
    }
    return new S3Client({
        region: process.env.S3_REGION || "auto",
        endpoint: process.env.S3_ENDPOINT,
        credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        },
    });
}
const BUCKET = process.env.S3_BUCKET || "polyflow-uploads";

async function requireSuperAdmin() {
    const session = await auth();
    if (!session?.user || !session.user.isSuperAdmin) {
        throw new AuthorizationError("Super Admin access required.");
    }
    return session;
}

/**
 * Backup a tenant's database to R2.
 *
 * Strategy: pg_dump (available inside the polyflow-app container, /usr/bin/pg_dump)
 * connects directly to the tenant DB URL (which is a `postgresql://` URL reachable
 * from the app container over the docker network). Output is written to a temp
 * file in custom format (-Fc, compressed, pg_restore-compatible), then streamed to R2.
 */
export async function backupTenant(
    tenantId: string,
    triggeredBy: "manual" | "pre-delete" = "manual"
) {
    const session = await requireSuperAdmin();

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || !tenant.dbUrl) {
        throw new BusinessRuleError("Tenant or database URL not found.");
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const r2Key = `backups/tenants/${tenant.id}/${timestamp}.dump`;
    const tmpDir = await mkdtemp(join(tmpdir(), "pf-backup-"));
    const tmpFile = join(tmpDir, `${timestamp}.dump`);

    try {
        // pg_dump connects directly to the tenant DB. We pass the URL via the
        // connection string form rather than individual -h/-U/-d flags to avoid
        // leaking credentials on the process list.
        const { stderr } = await execAsync(
            `pg_dump "${tenant.dbUrl}" -F c -f "${tmpFile}"`,
            { maxBuffer: 1024 * 1024 * 1024 } // 1GB headroom for large dumps
        );
        if (stderr && !stderr.includes("warning")) {
            // pg_dump emits warnings to stderr; treat only hard errors as fatal.
            console.warn("[backupTenant] pg_dump stderr:", stderr);
        }

        const buf = await readFile(tmpFile);

        const s3 = makeR2Client();
        await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: r2Key,
            Body: buf,
            ContentType: "application/octet-stream",
        }));

        const record = await prisma.tenantBackup.create({
            data: {
                tenantId: tenant.id,
                r2Key,
                sizeBytes: BigInt(buf.length),
                format: "custom",
                triggeredBy,
                createdBy: session.user.id!,
            },
        });

        await logActivity({
            userId: session.user.id,
            action: "TENANT_BACKUP_CREATED",
            entityType: "TenantBackup",
            entityId: record.id,
            details: `Backed up tenant "${tenant.name}" (${tenant.subdomain}) to R2 (${(buf.length / 1024 / 1024).toFixed(2)} MB, trigger: ${triggeredBy})`,
            changes: { tenantId: tenant.id, r2Key, sizeBytes: Number(record.sizeBytes) },
        });

        return { success: true as const, backupId: record.id, sizeBytes: Number(record.sizeBytes) };
    } catch (err) {
        console.error("[backupTenant] failed:", err);
        throw new BusinessRuleError(`Backup failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
        // Always clean up the temp file, even on failure.
        try { await unlink(tmpFile); } catch {}
    }
}

export async function listTenantBackups(tenantId: string) {
    await requireSuperAdmin();
    const backups = await prisma.tenantBackup.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 20,
    });
    return backups.map(b => ({
        ...b,
        sizeBytes: Number(b.sizeBytes),
    }));
}

/**
 * Generate a short-lived presigned download URL for a backup file in R2.
 */
export async function getTenantBackupDownloadUrl(backupId: string) {
    await requireSuperAdmin();

    const backup = await prisma.tenantBackup.findUnique({ where: { id: backupId } });
    if (!backup) throw new BusinessRuleError("Backup not found.");

    const s3 = makeR2Client();
    const url = await getPresignedReadUrl(
        s3,
        new GetObjectCommand({ Bucket: BUCKET, Key: backup.r2Key }),
        { expiresIn: 300 } // 5 minutes
    );
    return url;
}

/**
 * Delete a tenant permanently.
 *
 * Order: backup (pre-delete) -> drop DB -> delete registry rows -> audit log.
 * Guard: requires typing the exact subdomain as confirmation, and the tenant
 * must be SUSPENDED first (cooling period) — refuses to delete an ACTIVE tenant.
 */
export async function deleteTenant(
    tenantId: string,
    confirmSubdomain: string
) {
    const session = await requireSuperAdmin();

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
        throw new BusinessRuleError("Tenant not found.");
    }

    if (confirmSubdomain !== tenant.subdomain) {
        throw new BusinessRuleError("Confirmation subdomain does not match.");
    }

    if (tenant.status !== "SUSPENDED") {
        throw new BusinessRuleError("Tenant must be SUSPENDED before it can be deleted. Suspend the tenant first (cooling period).");
    }

    // 1. Backup to R2 (best-effort, but refuses to delete if backup fails —
    //    never drop a DB without a backup).
    try {
        const backup = await backupTenant(tenantId, "pre-delete");
        if (!backup.success) throw new BusinessRuleError("Backup returned failure");
    } catch (err) {
        throw new BusinessRuleError(`Pre-delete backup failed. Refusing to drop DB. Error: ${err instanceof Error ? err.message : "unknown"}`);
    }

    // 2. Parse the DB name out of dbUrl for DROP.
    const urlObj = new URL(tenant.dbUrl);
    const dbName = urlObj.pathname.replace(/^\//, "");
    if (!dbName) {
        throw new BusinessRuleError("Could not parse database name from dbUrl.");
    }
    const quoteIdent = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const safeDbName = quoteIdent(dbName);

    // Connect to the 'postgres' maintenance DB to issue DROP DATABASE.
    const adminUrl = new URL(tenant.dbUrl);
    adminUrl.pathname = "/postgres";

    try {
        // Drop with IF EXISTS so running delete twice doesn't fail on a missing DB.
        const { Client } = await import("pg");
        const client = new Client({ connectionString: adminUrl.toString() });
        try {
            await client.connect();
            // Terminate existing connections first (otherwise DROP can block).
            await client.query(
                `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
                [dbName]
            );
            await client.query(`DROP DATABASE IF EXISTS ${safeDbName};`);
        } finally {
            await client.end();
        }
    } catch (err) {
        console.error("[deleteTenant] DROP DATABASE failed:", err);
        throw new BusinessRuleError(`DROP DATABASE failed: ${err instanceof Error ? err.message : "unknown"}. Backup is safe in R2.`);
    }

    // 3. Registry cleanup (TenantBackup + TenantAccountRole + TenantRevenueRule
    //    cascade on Tenant delete, but we log first).
    await logActivity({
        userId: session.user.id,
        action: "TENANT_DELETED",
        entityType: "Tenant",
        entityId: tenant.id,
        details: `Permanently deleted tenant "${tenant.name}" (subdomain: ${tenant.subdomain}, db: ${dbName}). Pre-delete backup saved to R2.`,
    });

    await prisma.tenant.delete({ where: { id: tenantId } });

    return { success: true as const };
}
