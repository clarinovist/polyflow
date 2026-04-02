import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { NextRequest, NextResponse } from 'next/server';
import { generateVirtualCsReply } from '@/lib/bot/virtual-cs-service';
import { POLYFLOW_PRODUCT_ID } from '@/lib/bot/product-scope';
import { logVirtualCsEvent } from '@/lib/bot/chat-audit';

export const POST = withTenantRoute(async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized',
      },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null) as { question?: string } | null;
  const question = body?.question?.trim();

  if (!question) {
    return NextResponse.json(
      {
        success: false,
        error: 'Question is required.',
      },
      { status: 400 }
    );
  }

  try {
    const result = await generateVirtualCsReply({
      question,
      channel: 'web',
      requesterName: session.user.name || undefined,
    });

    await logVirtualCsEvent({
      channel: 'web',
      product: POLYFLOW_PRODUCT_ID,
      question,
      allowed: result.safety.allowed,
      blockedReason: result.safety.blockedReason,
      success: true,
      userId: (session.user as { id?: string }).id,
      requesterName: session.user.name || undefined,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      success: true,
      product: POLYFLOW_PRODUCT_ID,
      data: result,
    });
  } catch (error) {
    console.error('[CHAT_BRIDGE] Failed:', error);

    await logVirtualCsEvent({
      channel: 'web',
      product: POLYFLOW_PRODUCT_ID,
      question,
      allowed: false,
      blockedReason: 'Internal Server Error',
      success: false,
      userId: (session.user as { id?: string }).id,
      requesterName: session.user.name || undefined,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Internal Server Error',
      },
      { status: 500 }
    );
  }
});
