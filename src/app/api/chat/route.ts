import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { getTenantIdFromContext, prisma } from '@/lib/core/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { generateVirtualCsReply } from '@/lib/bot/virtual-cs-service';
import { POLYFLOW_PRODUCT_ID } from '@/lib/bot/product-scope';
import { logVirtualCsEvent } from '@/lib/bot/chat-audit';
import { checkChatRateLimit } from '@/lib/bot/chat-rate-limit';

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

    const body = (await req.json().catch(() => null)) as {
        question?: string;
        conversationId?: string;
    } | null;
    const question = body?.question?.trim();
    const conversationId = body?.conversationId;

    if (!question) {
        return NextResponse.json(
            {
                success: false,
                error: 'Question is required.',
            },
            { status: 400 },
        );
    }

    if (question.length > 2000) {
        return NextResponse.json(
            {
                success: false,
                error: 'Question is too long. Maximum 2000 characters allowed.',
            },
            { status: 400 },
        );
    }

    const tenantId = getTenantIdFromContext();

    // Explicit session ↔ tenant binding: verify user exists in this tenant's DB
    const sessionUserId = (session.user as { id?: string }).id;
    if (sessionUserId) {
        const userInTenant = await prisma.user.findUnique({
            where: { id: sessionUserId },
            select: { id: true },
        });
        if (!userInTenant) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Session tidak valid untuk tenant ini.',
                },
                { status: 403 },
            );
        }
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
                sessionUser: session.user as {
                    id?: string;
                    name?: string | null;
                    role?: string;
                    roles?: string[];
                    isSuperAdmin?: boolean;
                    allowedResources?: string[] | 'ALL';
                },
                conversationId,
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
            userId: (session.user as { id?: string }).id,
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
            userId: (session.user as { id?: string }).id,
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
