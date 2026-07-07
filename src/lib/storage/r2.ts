import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET = process.env.R2_BUCKET || "polyflow-uploads";
const PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

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
