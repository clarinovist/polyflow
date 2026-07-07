import { NextRequest, NextResponse } from "next/server";
import {
  getTenantPrefix,
  buildProductionPhotoKey,
  uploadToR2,
} from "@/lib/storage/r2";

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

    const tenant = await getTenantPrefix();
    const key = buildProductionPhotoKey(tenant, executionId, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const publicUrl = await uploadToR2(key, buffer, file.type);

    return NextResponse.json({ success: true, publicUrl, key });
  } catch (error) {
    console.error("Failed to upload production photo:", error);
    return NextResponse.json(
      { error: "Failed to upload photo" },
      { status: 500 }
    );
  }
}
