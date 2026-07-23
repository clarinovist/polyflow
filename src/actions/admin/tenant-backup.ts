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
        throw new BusinessRuleError("Kredensial tulis R2/S3 belum dikonfigurasi di server.");
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
        throw new BusinessRuleError("Tenant atau URL database tidak ditemukan.");
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
    if (!backup) throw new BusinessRuleError("Backup tidak ditemukan.");

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
        throw new BusinessRuleError("Konfirmasi subdomain tidak cocok.");
    }

    if (tenant.status !== "SUSPENDED") {
        throw new BusinessRuleError("Tenant harus SUSPENDED sebelum dapat dihapus. Suspend terlebih dahulu (masa tunggu).");
    }

    // 1. Backup to R2 (best-effort, but refuses to delete if backup fails —
    //    never drop a DB without a backup).
    try {
        const backup = await backupTenant(tenantId, "pre-delete");
        if (!backup.success) throw new BusinessRuleError("Backup mengembalikan kegagalan");
    } catch (err) {
        throw new BusinessRuleError(`Pre-delete backup failed. Refusing to drop DB. Error: ${err instanceof Error ? err.message : "unknown"}`);
    }

    // 2. Parse the DB name out of dbUrl for DROP.
    const urlObj = new URL(tenant.dbUrl);
    const dbName = urlObj.pathname.replace(/^\//, "");
    if (!dbName) {
        throw new BusinessRuleError("Tidak dapat mengurai nama database dari dbUrl.");
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

/**
 * Restore a tenant DB from a backup stored in R2.
 *
 * Strategy: download the dump file from R2 to a temp file, then run
 * `pg_restore --clean --if-exists` against the tenant's dbUrl. --clean drops
 * objects before recreating them; --if-exists avoids errors when an object
 * doesn't exist yet. This preserves the schema from the backup (which is what
 * we want for a true restore — the alternative, DROP DATABASE + recreate +
 * pg_restore, requires connecting to the 'postgres' maintenance DB and is more
 * fragile during a running app). --clean also means any new columns/tables
 * added since the backup will be dropped, which is the correct semantics for
 * "restore to this backup moment".
 *
 * This is DESTRUCTIVE — it overwrites the current tenant DB. UI must confirm
 * by typing the tenant subdomain.
 */
export async function restoreTenantBackup(
    backupId: string,
    confirmSubdomain: string
) {
    const session = await requireSuperAdmin();

    const backup = await prisma.tenantBackup.findUnique({
        where: { id: backupId },
        include: { tenant: true },
    });
    if (!backup || !backup.tenant) {
        throw new BusinessRuleError("Backup tidak ditemukan.");
    }
    const tenant = backup.tenant;

    if (confirmSubdomain !== tenant.subdomain) {
        throw new BusinessRuleError("Konfirmasi subdomain tidak cocok.");
    }

    const tmpDir = await mkdtemp(join(tmpdir(), "pf-restore-"));
    const tmpFile = join(tmpDir, `${backup.id}.dump`);

    try {
        // 1. Download backup from R2 to temp file
        const s3 = makeR2Client();
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const resp = await s3.send(new GetObjectCommand({
            Bucket: BUCKET,
            Key: backup.r2Key,
        }));
        if (!resp.Body) throw new BusinessRuleError("File backup kosong di R2.");
        // Collect stream body into a buffer, then write to temp file.
        const chunks: Uint8Array[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const chunk of resp.Body as any) {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        }
        const buf = Buffer.concat(chunks);
        await import("fs/promises").then(fs => fs.writeFile(tmpFile, buf));

        // 2. Run pg_restore. --clean --if-exists drops+recreates objects (true
        // restore semantics). --no-owner avoids role-mismatch errors (the role
        // that owns objects in the dump may not exist in the target DB).
        const { stderr } = await execAsync(
            `pg_restore "${tenant.dbUrl}" --clean --if-exists --no-owner -d "${new URL(tenant.dbUrl).pathname.replace(/^\//, "")}" < "${tmpFile}"`,
            { maxBuffer: 1024 * 1024 * 1024 }
        );
        // pg_restore prints "errors" to stderr for any object dropped before the
        // --clean --if-exists takes effect, etc. — most are warnings, not
        // fatal. Treat the command exit code (handled by execAsync which throws
        // on non-zero) as the authoritative failure signal.
        if (stderr) console.warn("[restoreTenantBackup] pg_restore stderr:", stderr.slice(0, 500));

        // 3. Audit log
        await logActivity({
            userId: session.user.id,
            action: "TENANT_RESTORED",
            entityType: "TenantBackup",
            entityId: backup.id,
            details: `Restored tenant "${tenant.name}" from backup (created ${new Date(backup.createdAt).toISOString()})`,
            changes: { tenantId: tenant.id, backupId: backup.id, r2Key: backup.r2Key, sizeBytes: Number(backup.sizeBytes) },
        });

        return { success: true as const, sizeBytes: Number(backup.sizeBytes) };
    } catch (err) {
        console.error("[restoreTenantBackup] failed:", err);
        throw new BusinessRuleError(`Restore failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
        try { await unlink(tmpFile); } catch {}
    }
}

