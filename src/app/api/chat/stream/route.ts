import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { getTenantIdFromContext, prisma } from '@/lib/core/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { generateVirtualCsReply } from '@/lib/bot/virtual-cs-service';
import { POLYFLOW_PRODUCT_ID } from '@/lib/bot/product-scope';
import { logVirtualCsEvent } from '@/lib/bot/chat-audit';
import { checkChatRateLimit } from '@/lib/bot/chat-rate-limit';
import type { AssistantStreamEvent } from '@/lib/bot/assistant-types';

/**
 * Streaming (SSE) varian dari POST /api/chat.
 *
 * Endpoint lama TETAP ADA dan tidak berubah perilakunya — panel jatuh ke sana
 * bila stream gagal, dan Telegram mini-app masih memakainya.
 *
 * CATATAN TENANT-CONTEXT (penting):
 * Seluruh agentic loop di-await DI DALAM handler `withTenantRoute`, yaitu di
 * dalam `start()` milik ReadableStream yang dikonsumsi sebelum handler selesai.
 * Jangan pernah memindahkan `generateVirtualCsReply` ke pekerjaan yang
 * dijadwalkan SETELAH handler return — AsyncLocalStorage tenant sudah lepas di
 * titik itu dan tool akan query DB tenant yang salah tanpa error apa pun.
 */
export const POST = withTenantRoute(async function POST(req: NextRequest) {
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

    const body = (await req.json().catch(() => null)) as {
        question?: string;
        conversationId?: string;
    } | null;
    const question = body?.question?.trim();
    const conversationId = body?.conversationId;

    if (!question) {
        return NextResponse.json(
            { success: false, error: 'Question is required.' },
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
                        sessionUser: session.user as {
                            id?: string;
                            name?: string | null;
                            role?: string;
                            roles?: string[];
                            isSuperAdmin?: boolean;
                            allowedResources?: string[] | 'ALL';
                        },
                        conversationId,
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
                });

                send({
                    type: 'done',
                    data: { ...result, interactionId } as typeof result & {
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
