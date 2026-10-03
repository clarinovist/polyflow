import { withTenantRoute } from '@/lib/core/tenant';
import { NextRequest } from 'next/server';
import { handleAssistantRequest } from '@/lib/bot/durable/route-handler';
import { getAssistantRuntime } from '@/lib/bot/durable/runtime-config';

// Rate limit (20 req/menit per user) di-share dengan /api/chat/stream lewat
// `@/lib/bot/chat-rate-limit` — jangan bikin peta lokal di sini lagi.

const legacyPOST = withTenantRoute(async function legacyPOST(req: NextRequest) {
    const { auth } = await import('@/auth');
    const { getTenantIdFromContext } = await import('@/lib/core/prisma');
    const { NextResponse } = await import('next/server');
    const { generateVirtualCsReply } =
        await import('@/lib/bot/virtual-cs-service');
    const { POLYFLOW_PRODUCT_ID } = await import('@/lib/bot/product-scope');
    const { logVirtualCsEvent } = await import('@/lib/bot/chat-audit');
    const { checkChatRateLimit } = await import('@/lib/bot/chat-rate-limit');
    const { parseChatRequestBody } = await import('@/lib/bot/chat-request');
    const { verifyAssistantSessionUser } =
        await import('@/lib/bot/assistant-session');
    const { assistantBugReportNotice } = await import('@/lib/bot/bug-report');
    const startedAt = Date.now();
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json(
            {
                success: false,
                error: 'Unauthorized',
            },
            { status: 401 },
        );
    }

    // Rate limit check
    const userId = (session.user as { id?: string }).id || '';
    if (userId && !checkChatRateLimit(userId)) {
        return NextResponse.json(
            {
                success: false,
                error: 'Terlalu banyak permintaan. Silakan tunggu sebentar sebelum bertanya lagi.',
            },
            { status: 429 },
        );
    }

    const parsed = parseChatRequestBody(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: parsed.error },
            { status: 400 },
        );
    }
    const { requestId, question, conversationId, workContext } = parsed.data;
    const tenantId = getTenantIdFromContext();

    const verifiedUser = await verifyAssistantSessionUser(session.user);
    if (!verifiedUser) {
        return NextResponse.json(
            {
                success: false,
                error: 'Session tidak valid untuk tenant ini.',
            },
            { status: 403 },
        );
    }

    try {
        // Build assistant context from session + tenant
        const result = await generateVirtualCsReply(
            {
                question,
                channel: 'web',
                requesterName: session.user.name || undefined,
            },
            {
                tenantId,
                sessionUser: verifiedUser,
                permissionsVerified: true,
                conversationId,
                workContext,
            },
        );

        const interactionId = await logVirtualCsEvent({
            channel: 'web',
            product: POLYFLOW_PRODUCT_ID,
            question,
            answer: result.answer,
            allowed: result.safety.allowed,
            blockedReason: result.safety.blockedReason,
            success: true,
            userId: verifiedUser.id,
            tenantId,
            requesterName: session.user.name || undefined,
            latencyMs: Date.now() - startedAt,
            citedSlugs: result.citedArticles?.map((a) => a.slug) || [],
            confidence: result.confidence,
            conversationId: result.conversationId,
            requestId,
            disposition: result.disposition,
        });

        const bugReportNotice = await assistantBugReportNotice(
            result,
            interactionId,
            {
                tenantId,
                userId: verifiedUser.id,
            },
        );
        return NextResponse.json({
            success: true,
            product: POLYFLOW_PRODUCT_ID,
            data: { ...result, interactionId, bugReportNotice },
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
            userId: verifiedUser.id,
            tenantId,
            requesterName: session.user.name || undefined,
            latencyMs: Date.now() - startedAt,
            conversationId,
            requestId,
        });

        return NextResponse.json(
            {
                success: false,
                error: 'Internal Server Error',
            },
            { status: 500 },
        );
    }
});

const durablePOST = withTenantRoute(async function durablePOST(
    req: NextRequest,
) {
    return handleAssistantRequest(req, { stream: false });
});

export async function POST(req: NextRequest) {
    return getAssistantRuntime() === 'legacy'
        ? legacyPOST(req)
        : durablePOST(req);
}
