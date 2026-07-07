import { NextRequest, NextResponse } from "next/server";
import { generateR2PresignedUploadUrl, buildProductionPhotoKey } from "@/lib/storage/r2";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const executionId = formData.get("executionId") as string | null;

    if (!file || !executionId) {
      return NextResponse.json(
        { error: "file and executionId are required" },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, WebP, and HEIC images are allowed" },
        { status: 400 }
      );
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be under 5MB" },
        { status: 400 }
      );
    }

    const key = buildProductionPhotoKey(executionId, file.name);
    const { publicUrl } = await generateR2PresignedUploadUrl(key, file.type);

    // Upload directly from server (avoids CORS issues with browser-to-R2 upload)
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3Client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
      },
    });

    const buffer = Buffer.from(await file.arrayBuffer());

    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET || "polyflow-uploads",
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    );

    return NextResponse.json({ success: true, publicUrl, key });
  } catch (error) {
    console.error("Failed to upload production photo:", error);
    return NextResponse.json(
      { error: "Failed to upload photo" },
      { status: 500 }
    );
  }
}
