import { withTenantRoute } from '@/lib/core/tenant';
import { NextRequest } from 'next/server';
import { handleAssistantRequest } from '@/lib/bot/durable/route-handler';
import { getAssistantRuntime } from '@/lib/bot/durable/runtime-config';

/**
 * Streaming (SSE) varian dari POST /api/chat.
 *
 * Endpoint lama TETAP ADA dan tidak berubah perilakunya — panel jatuh ke sana
 * bila stream gagal.
 *
 * CATATAN TENANT-CONTEXT (penting):
 * Seluruh agentic loop di-await DI DALAM handler `withTenantRoute`, yaitu di
 * dalam `start()` milik ReadableStream yang dikonsumsi sebelum handler selesai.
 * Jangan pernah memindahkan `generateVirtualCsReply` ke pekerjaan yang
 * dijadwalkan SETELAH handler return — AsyncLocalStorage tenant sudah lepas di
 * titik itu dan tool akan query DB tenant yang salah tanpa error apa pun.
 */
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
    type AssistantStreamEvent =
        import('@/lib/bot/assistant-types').AssistantStreamEvent;
    const startedAt = Date.now();
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json(
            { success: false, error: 'Unauthorized' },
            { status: 401 },
        );
    }

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
    const sessionUserId = verifiedUser.id;

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let closed = false;
            const send = (event: AssistantStreamEvent) => {
                if (closed) return;
                try {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
                    );
                } catch {
                    // Client menutup koneksi — berhenti mengirim.
                    closed = true;
                }
            };

            try {
                const result = await generateVirtualCsReply(
                    {
                        question,
                        channel: 'web',
                        requesterName: session.user?.name || undefined,
                    },
                    {
                        tenantId,
                        sessionUser: verifiedUser,
                        permissionsVerified: true,
                        conversationId,
                        workContext,
                        onEvent: send,
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
                    userId: sessionUserId,
                    tenantId,
                    requesterName: session.user?.name || undefined,
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
                        userId: sessionUserId,
                    },
                );
                send({
                    type: 'done',
                    data: {
                        ...result,
                        interactionId,
                        bugReportNotice,
                    } as typeof result & {
                        interactionId: string | null;
                    },
                });
            } catch (error) {
                console.error('[CHAT_STREAM] Failed:', error);

                await logVirtualCsEvent({
                    channel: 'web',
                    product: POLYFLOW_PRODUCT_ID,
                    question,
                    allowed: false,
                    blockedReason: 'Internal Server Error',
                    success: false,
                    userId: sessionUserId,
                    tenantId,
                    requesterName: session.user?.name || undefined,
                    latencyMs: Date.now() - startedAt,
                    conversationId,
                    requestId,
                }).catch(() => {
                    /* audit gagal tidak boleh menutupi error asli */
                });

                send({
                    type: 'error',
                    message:
                        'Maaf, layanan AI sedang mengalami kendala. Silakan coba lagi sebentar lagi.',
                });
            } finally {
                // Sentinel non-JSON — client WAJIB strip baris ini sebelum parse.
                if (!closed) {
                    try {
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    } catch {
                        /* koneksi sudah tertutup */
                    }
                }
                closed = true;
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            // Cegah proxy (Nginx di VPS) menahan buffer sampai response selesai.
            'X-Accel-Buffering': 'no',
        },
    });
});

const durablePOST = withTenantRoute(async function durablePOST(
    req: NextRequest,
) {
    return handleAssistantRequest(req, { stream: true });
});

export async function POST(req: NextRequest) {
    return getAssistantRuntime() === 'legacy'
        ? legacyPOST(req)
        : durablePOST(req);
}
