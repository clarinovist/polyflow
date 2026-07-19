import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { headers } from "next/headers";
import { extractSubdomain } from "@/lib/core/tenant";

// Reuse existing S3-compatible env vars (already configured for Cloudflare R2)
export const r2Client = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
});

export const BUCKET = process.env.S3_BUCKET || "polyflow-uploads";
const PUBLIC_URL = process.env.S3_PUBLIC_URL || "";

/**
 * Get tenant identifier from request headers.
 * Returns tenant subdomain (e.g., "kiyowo", "melindo") or "default" if not found.
 */
export async function getTenantPrefix(): Promise<string> {
  try {
    const headersList = await headers();
    const host = headersList.get("host") || "";
    const forwardedHost = headersList.get("x-forwarded-host") || "";

    let subdomain = extractSubdomain(host);
    if (!subdomain) {
      subdomain = extractSubdomain(forwardedHost);
    }

    return subdomain || "default";
  } catch {
    return "default";
  }
}

export async function generateR2PresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn });
  const publicUrl = `${PUBLIC_URL}/${key}`;

  return { uploadUrl, publicUrl };
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
 * Format: {tenant}/production/{executionId}/{timestamp}.{ext}
 */
export function buildProductionPhotoKey(
  tenant: string,
  executionId: string,
  filename: string,
): string {
  const ext = filename.split(".").pop() || "jpg";
  const timestamp = Date.now();
  return `${tenant}/production/${executionId}/${timestamp}.${ext}`;
}

/**
 * Build R2 key for attendance selfies.
 * Format: {tenant}/attendance/{employeeId}/{kind}-{timestamp}.{ext}
 * kind: clock_in | clock_out
 */
export function buildAttendancePhotoKey(
  tenant: string,
  employeeId: string,
  kind: "clock_in" | "clock_out",
  filename: string,
): string {
  const ext = filename.split(".").pop() || "jpg";
  const timestamp = Date.now();
  return `${tenant}/attendance/${employeeId}/${kind}-${timestamp}.${ext}`;
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
  const ext = filename.split(".").pop() || "jpg";
  const timestamp = Date.now();
  return `${tenant}/customers/${customerId}/${timestamp}.${ext}`;
}

/**
 * Build R2 key for HRD documents (disciplinary SP scans, leave sick letters).
 * Format: {tenant}/hrd-docs/{category}/{entityId}/{timestamp}.{ext}
 */
export function buildHrdDocKey(
  tenant: string,
  category: 'disciplinary' | 'leave',
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
  const ext = filename.split(".").pop() || "jpg";
  const timestamp = Date.now();
  return `${tenant}/delivery/${deliveryOrderId}/${photoType}/${timestamp}.${ext}`;
}
export function buildBackupKey(
  tenant: string,
  database: string,
): string {
  const date = new Date().toISOString().split("T")[0];
  return `${tenant}/backups/${database}/${date}.sql.gz`;
}
