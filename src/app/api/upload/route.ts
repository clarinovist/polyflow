import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { buildCustomerPhotoKey } from "@/lib/storage/s3";
import { requireAuth } from "@/lib/tools/auth-checks";

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

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const customerId = formData.get("customerId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "File type not allowed. Use JPG, PNG, or WebP." },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 },
      );
    }

    const key = customerId
      ? buildCustomerPhotoKey(customerId, file.name)
      : `uploads/${Date.now()}.${file.name.split(".").pop()}`;

    // Server-side upload to S3 with public-read ACL
    const buffer = Buffer.from(await file.arrayBuffer());
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        ACL: "public-read",
      }),
    );

    const publicUrl = `${PUBLIC_URL}/${key}`;
    return NextResponse.json({ url: publicUrl, key });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
