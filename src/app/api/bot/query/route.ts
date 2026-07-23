import { withTenantRoute } from "@/lib/core/tenant";
import { getTenantIdFromContext } from "@/lib/core/prisma";
import { NextRequest, NextResponse } from "next/server";
import { validateExternalRequest } from "@/lib/api/external-api-helper";
import { isPolyflowScoped, POLYFLOW_PRODUCT_ID } from "@/lib/bot/product-scope";
import { generateVirtualCsReply } from "@/lib/bot/virtual-cs-service";
import { rateLimit } from "@/lib/api/rate-limit";
import { logVirtualCsEvent } from "@/lib/bot/chat-audit";

export const POST = withTenantRoute(async function POST(req: NextRequest) {
  const startedAt = Date.now();

  const { isValid, response } = await validateExternalRequest(req);
  if (!isValid) return response;

  if (!isPolyflowScoped(req)) {
    await logVirtualCsEvent({
      channel: "telegram",
      product: POLYFLOW_PRODUCT_ID,
      question: "[scope-mismatch]",
      allowed: false,
      blockedReason: "Product scope mismatch",
      success: false,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        success: false,
        error: "Product scope mismatch. Endpoint ini hanya untuk Polyflow.",
      },
      { status: 403 },
    );
  }

  const ip = (req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
  const limiter = rateLimit(`bot-query:${ip}`, 60, 60_000);
  if (!limiter.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Rate limit exceeded.",
      },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    question?: string;
    requesterName?: string;
  } | null;
  const question = body?.question?.trim();

  if (!question) {
    return NextResponse.json(
      {
        success: false,
        error: "Question is required.",
      },
      { status: 400 },
    );
  }

  if (question.length > 2000) {
    return NextResponse.json(
      {
        success: false,
        error: "Question is too long. Maximum 2000 characters allowed.",
      },
      { status: 400 },
    );
  }

  const tenantId = getTenantIdFromContext();

  try {
    const result = await generateVirtualCsReply({
      question,
      channel: "telegram",
      requesterName: body?.requesterName,
    });

    const interactionId = await logVirtualCsEvent({
      channel: "telegram",
      product: POLYFLOW_PRODUCT_ID,
      question,
      answer: result.answer,
      allowed: result.safety.allowed,
      blockedReason: result.safety.blockedReason,
      success: true,
      tenantId,
      requesterName: body?.requesterName,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      success: true,
      product: POLYFLOW_PRODUCT_ID,
      data: { ...result, interactionId },
    });
  } catch (error) {
    console.error("[BOT_QUERY] Failed:", error);

    await logVirtualCsEvent({
      channel: "telegram",
      product: POLYFLOW_PRODUCT_ID,
      question,
      allowed: false,
      blockedReason: "Internal Server Error",
      success: false,
      tenantId,
      requesterName: body?.requesterName,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        success: false,
        error: "Internal Server Error",
      },
      { status: 500 },
    );
  }
});
