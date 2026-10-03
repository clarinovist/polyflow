import { withTenantRoute } from '@/lib/core/tenant';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { validateExternalRequest } from '@/lib/api/external-api-helper';
import { isPolyflowScoped, POLYFLOW_PRODUCT_ID } from '@/lib/bot/product-scope';
import { rateLimit } from '@/lib/api/rate-limit';
import { logVirtualCsEvent } from '@/lib/bot/chat-audit';
import { AssistantWorkerProtocolError } from '@/lib/bot/durable/protocol';
import { runRestrictedTelegramSubmission } from '@/lib/bot/durable/telegram';

export const POST = withTenantRoute(async function POST(req: NextRequest) {
    const startedAt = Date.now();

    const { isValid, response } = await validateExternalRequest(req);
    if (!isValid) return response;

    if (!isPolyflowScoped(req)) {
        await logVirtualCsEvent({
            channel: 'telegram',
            product: POLYFLOW_PRODUCT_ID,
            question: '[scope-mismatch]',
            allowed: false,
            blockedReason: 'Product scope mismatch',
            success: false,
            latencyMs: Date.now() - startedAt,
        });

        return NextResponse.json(
            {
                success: false,
                error: 'Product scope mismatch. Endpoint ini hanya untuk Polyflow.',
            },
            { status: 403 },
        );
    }

    const ip = (req.headers.get('x-forwarded-for') || 'unknown')
        .split(',')[0]
        .trim();
    const limiter = rateLimit(`bot-query:${ip}`, 60, 60_000);
    if (!limiter.success) {
        return NextResponse.json(
            {
                success: false,
                error: 'Rate limit exceeded.',
            },
            { status: 429 },
        );
    }

    const body = (await req.json().catch(() => null)) as {
        requestId?: string;
        question?: string;
        requesterName?: string;
    } | null;
    const question = body?.question?.trim();

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

    try {
        // Telegram remains public-KB-only until an authoritative identity map
        // exists. Even the manual web rollback must not widen this channel.
        const result = await submitRestrictedTelegram({
            requestId: body?.requestId,
            question,
            tenantId,
        });

        const interactionId = await logVirtualCsEvent({
            channel: 'telegram',
            product: POLYFLOW_PRODUCT_ID,
            question,
            answer: result.answer,
            allowed: result.safety.allowed,
            blockedReason: result.safety.blockedReason,
            success: true,
            tenantId,
            requesterName: body?.requesterName,
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
        console.error('[BOT_QUERY] Failed:', error);

        await logVirtualCsEvent({
            channel: 'telegram',
            product: POLYFLOW_PRODUCT_ID,
            question,
            allowed: false,
            blockedReason: 'Internal Server Error',
            success: false,
            tenantId,
            requesterName: body?.requesterName,
            latencyMs: Date.now() - startedAt,
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

async function submitRestrictedTelegram(input: {
    requestId?: string;
    question: string;
    tenantId?: string;
}): ReturnType<typeof runRestrictedTelegramSubmission> {
    if (!input.tenantId || !input.requestId) {
        throw new AssistantWorkerProtocolError(
            'INVALID_REQUEST',
            'Telegram Pi Durable requires a stable requestId and resolved tenant.',
            400,
        );
    }
    // No verified tenant user exists on this integration yet. Use the separate
    // global/public KB-only durable conversation; no tenant business tool is installed.
    return runRestrictedTelegramSubmission({
        requestId: input.requestId,
        question: input.question,
    });
}
