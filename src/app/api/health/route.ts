import { withTenantRoute } from "@/lib/core/tenant";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/core/prisma";

export const GET = withTenantRoute(async function GET() {
  try {
    // Test database connectivity
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: "healthy",
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
});
