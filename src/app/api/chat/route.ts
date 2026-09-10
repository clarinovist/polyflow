import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { generateVirtualCsReply } from '@/lib/bot/virtual-cs-service';
import { POLYFLOW_PRODUCT_ID } from '@/lib/bot/product-scope';
import { logVirtualCsEvent } from '@/lib/bot/chat-audit';
import { checkChatRateLimit } from '@/lib/bot/chat-rate-limit';
import { parseChatRequestBody } from '@/lib/bot/chat-request';
import { verifyAssistantSessionUser } from '@/lib/bot/assistant-session';

// Rate limit (20 req/menit per user) di-share dengan /api/chat/stream lewat
// `@/lib/bot/chat-rate-limit` — jangan bikin peta lokal di sini lagi.

export const POST = withTenantRoute(async function POST(req: NextRequest) {
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
    const { question, conversationId, workContext } = parsed.data;
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
        });

        return NextResponse.json({
            success: true,
            product: POLYFLOW_PRODUCT_ID,
            data: { ...result, interactionId },
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
