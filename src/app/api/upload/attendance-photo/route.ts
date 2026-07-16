import { NextRequest, NextResponse } from "next/server";
import {
  getTenantPrefix,
  buildAttendancePhotoKey,
  uploadToR2,
} from "@/lib/storage/r2";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 1 * 1024 * 1024; // 1MB post-compress

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const employeeId = formData.get("employeeId") as string | null;
    const kindRaw = (formData.get("kind") as string | null) ?? "clock_in";
    const kind = kindRaw === "clock_out" ? "clock_out" : "clock_in";

    if (!file || !employeeId) {
      return NextResponse.json(
        { error: "file and employeeId are required" },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, and WebP images are allowed" },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File size must be under 1MB" },
        { status: 400 },
      );
    }

    const tenant = await getTenantPrefix();
    const key = buildAttendancePhotoKey(tenant, employeeId, kind, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const publicUrl = await uploadToR2(key, buffer, file.type);

    return NextResponse.json({ success: true, publicUrl, key });
  } catch (error) {
    console.error("Failed to upload attendance photo:", error);
    return NextResponse.json(
      { error: "Failed to upload photo" },
      { status: 500 },
    );
  }
}
