import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { extractSubdomain } from '@/lib/core/tenant';

// Reuse existing S3-compatible env vars (already configured for Cloudflare R2)
export const r2Client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    },
});

export const BUCKET = process.env.S3_BUCKET || 'polyflow-uploads';

/**
 * Short content fingerprint (16 hex chars of sha256) used in object keys, so a
 * retried upload of the same bytes overwrites the same key instead of piling up
 * duplicate objects. Older timestamp-based keys keep working: keys are opaque.
 */
export function contentFingerprint(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

/** Extension from a filename, falling back when it is missing or implausible. */
function safeExtension(filename: string, fallback: string): string {
    if (!filename.includes('.')) return fallback;
    const ext = filename.split('.').pop()!.toLowerCase();
    return /^[a-z0-9]{1,5}$/.test(ext) ? ext : fallback;
}

/**
 * Get tenant identifier from request headers.
 * Returns tenant subdomain (e.g., "kiyowo", "melindo") or "default" if not found.
 */
export async function getTenantPrefix(): Promise<string> {
    try {
        const headersList = await headers();
        const host = headersList.get('host') || '';
        const forwardedHost = headersList.get('x-forwarded-host') || '';

        let subdomain = extractSubdomain(host);
        if (!subdomain) {
            subdomain = extractSubdomain(forwardedHost);
        }

        return subdomain || 'default';
    } catch {
        return 'default';
    }
}
/**
 * Upload file directly to R2 (server-side, avoids CORS issues).
 */
export async function uploadToR2(
    key: string,
    buffer: Buffer,
    contentType: string,
): Promise<string> {
    await r2Client.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        }),
    );

    return `/api/images/${key}`;
}

/**
 * Build R2 key for production photos.
 * Format: {tenant}/production/{executionId}/{fingerprint}.{ext}
 * `fingerprint` (content hash) makes retries idempotent; without it a timestamp
 * is used for backward compatibility.
 */
export function buildProductionPhotoKey(
    tenant: string,
    executionId: string,
    filename: string,
    fingerprint?: string,
): string {
    const ext = safeExtension(filename, 'jpg');
    const name = fingerprint || String(Date.now());
    return `${tenant}/production/${executionId}/${name}.${ext}`;
}

/**
 * Build R2 key for attendance selfies.
 * Format: {tenant}/attendance/{employeeId}/{kind}-{fingerprint}.{ext}
 * kind: clock_in | clock_out
 */
export function buildAttendancePhotoKey(
    tenant: string,
    employeeId: string,
    kind: 'clock_in' | 'clock_out',
    filename: string,
    fingerprint?: string,
): string {
    const ext = safeExtension(filename, 'jpg');
    const name = fingerprint || String(Date.now());
    return `${tenant}/attendance/${employeeId}/${kind}-${name}.${ext}`;
}

/**
 * Build R2 key for customer photos.
 * Format: {tenant}/customers/{customerId}/{timestamp}.{ext}
 */
export function buildCustomerPhotoKey(
    tenant: string,
    customerId: string,
    filename: string,
): string {
    const ext = filename.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    return `${tenant}/customers/${customerId}/${timestamp}.${ext}`;
}

/**
 * Build R2 key for HRD documents (disciplinary SP scans, leave sick letters).
 * Format: {tenant}/hrd-docs/{category}/{entityId}/{timestamp}.{ext}
 */
export function buildHrdDocKey(
    tenant: string,
    category: 'disciplinary' | 'leave' | 'loan' | 'employee',
    entityId: string,
    filename: string,
): string {
    const ext = filename.split('.').pop() || 'pdf';
    const timestamp = Date.now();
    return `${tenant}/hrd-docs/${category}/${entityId}/${timestamp}.${ext}`;
}

/**
 * Build R2 key for database backups.
 * Format: {tenant}/backups/{database}/{date}.sql.gz
 */
/**
 * Build R2 key for delivery photos.
 * Format: {tenant}/delivery/{deliveryOrderId}/{photoType}/{timestamp}.{ext}
 * photoType: 'vehicle' | 'proof_of_delivery'
 */
export function buildDeliveryPhotoKey(
    tenant: string,
    deliveryOrderId: string,
    photoType: string,
    filename: string,
): string {
    const ext = filename.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    return `${tenant}/delivery/${deliveryOrderId}/${photoType}/${timestamp}.${ext}`;
}
/**
 * Build R2 key for warehouse operational attachments.
 * Format: {tenant}/warehouse/{entityType}/{entityId}/{checkpoint}/{timestamp}.{ext}
 * entityType: 'do' | 'gr'
 */
export function buildWarehouseAttachmentKey(
    tenant: string,
    entityType: 'do' | 'gr' | 'po' | 'opname',
    entityId: string,
    checkpoint: string,
    filename: string,
): string {
    const ext = filename.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    return `${tenant}/warehouse/${entityType}/${entityId}/${checkpoint}/${timestamp}.${ext}`;
}

/**
 * Build R2 key for sales remittance proof-of-payment photos.
 * Format: {tenant}/remittance-proof/{userId}/{timestamp}.{ext}
 * remittanceId isn't known yet at upload time (upload happens before create), so
 * we namespace by the uploading user instead — consistent with buildCustomerPhotoKey.
 */
export function buildRemittanceProofKey(
    tenant: string,
    userId: string,
    filename: string,
): string {
    const ext = filename.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    return `${tenant}/remittance-proof/${userId}/${timestamp}.${ext}`;
}
