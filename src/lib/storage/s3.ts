import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.S3_REGION || "id-cgk-1",
  endpoint: process.env.S3_ENDPOINT || "https://id-cgk-1.linodeobjects.com",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET = process.env.S3_BUCKET || "polyflow-uploads";
const PUBLIC_URL =
  process.env.S3_PUBLIC_URL || `https://id-cgk-1.linodeobjects.com/${BUCKET}`;

export interface UploadResult {
  url: string;
  key: string;
}

export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
  const publicUrl = `${PUBLIC_URL}/${key}`;

  return { uploadUrl, publicUrl };
}

export function buildCustomerPhotoKey(
  customerId: string,
  filename: string,
): string {
  const ext = filename.split(".").pop() || "jpg";
  const timestamp = Date.now();
  return `customers/${customerId}/${timestamp}.${ext}`;
}
