import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/tools/auth-checks";
import {
  getTenantPrefix,
  buildDeliveryPhotoKey,
  uploadToR2,
} from "@/lib/storage/r2";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const deliveryOrderId = formData.get("deliveryOrderId") as string | null;
    const photoType = formData.get("photoType") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!deliveryOrderId) {
      return NextResponse.json({ error: "deliveryOrderId required" }, { status: 400 });
    }

    if (photoType !== "vehicle" && photoType !== "proof_of_delivery") {
      return NextResponse.json({ error: "photoType must be 'vehicle' or 'proof_of_delivery'" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "File type not allowed. Use JPG, PNG, or WebP." },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 5MB." }, { status: 400 });
    }

    const tenant = await getTenantPrefix();
    const key = buildDeliveryPhotoKey(tenant, deliveryOrderId, photoType, file.name);

    const buffer = Buffer.from(await file.arrayBuffer());
    const publicUrl = await uploadToR2(key, buffer, file.type);

    return NextResponse.json({ success: true, url: publicUrl, key });
  } catch (error) {
    console.error("Delivery photo upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
