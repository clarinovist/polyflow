import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, BUCKET } from "@/lib/storage/r2";

/**
 * Proxy endpoint for R2 images.
 * Serves images through the same domain — no CORS issues, no R2 public access needed.
 * Usage: /api/images/kiyowo/production/xxx/photo.jpg
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const key = path.join("/");

    if (!key) {
      return new NextResponse("Missing path", { status: 400 });
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    const response = await r2Client.send(command);

    if (!response.Body) {
      return new NextResponse("File not found", { status: 404 });
    }

    // Transform to stream for NextResponse
    const stream = response.Body.transformToWebStream();

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": response.ContentType || "image/jpeg",
        "Cache-Control": "public, max-age=86400", // Cache 24 hours
      },
    });
  } catch (error) {
    console.error("Image proxy error:", error);
    return new NextResponse("Image not found", { status: 404 });
  }
}
