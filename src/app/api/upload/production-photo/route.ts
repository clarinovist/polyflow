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

    // Validate file type. Allow empty MIME (iOS Safari camera capture)
    // and HEIC — downstream compression converts to JPEG when possible.
    const fileType = file.type || "";
    const isJpeg = !fileType || ["image/jpeg", "image/jpg"].includes(fileType);
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!isJpeg && !allowedTypes.includes(fileType)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, WebP, and HEIC images are allowed" },
        { status: 400 }
      );
    }

    // Max 15MB. Camera raw (HEIC/JPEG) can be 8-12MB before compression.
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Ukuran foto melebihi 15MB. Ambil ulang dari jarak lebih dekat." },
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
