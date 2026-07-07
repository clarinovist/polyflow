import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Reuse existing S3-compatible env vars (already configured for Cloudflare R2)
const r2Client = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET = process.env.S3_BUCKET || "polyflow-uploads";
const PUBLIC_URL = process.env.S3_PUBLIC_URL || "";

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

export function buildProductionPhotoKey(
  executionId: string,
  filename: string,
): string {
  const ext = filename.split(".").pop() || "jpg";
  const timestamp = Date.now();
  return `production/${executionId}/${timestamp}.${ext}`;
}
