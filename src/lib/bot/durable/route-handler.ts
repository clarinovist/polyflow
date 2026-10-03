import { NextResponse, type NextRequest } from 'next/server';
import type { AssistantStreamEvent } from '../assistant-types';
import { POLYFLOW_PRODUCT_ID } from '../product-scope';
import { AssistantWorkerProtocolError } from './protocol';
import {
    applyChatRateLimitOnce,
    prepareAssistantWebRequest,
    submitDurableAssistant,
} from './web-bridge';

export async function handleAssistantRequest(
    request: NextRequest,
    options: { stream: boolean },
): Promise<Response> {
    try {
        const prepared = await prepareAssistantWebRequest(request);
        if (
            !applyChatRateLimitOnce(
                prepared.envelope.userId,
                prepared.envelope.requestId,
            )
        ) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Terlalu banyak permintaan. Silakan tunggu sebentar sebelum bertanya lagi.',
                },
                { status: 429 },
            );
        }
        if (!options.stream) {
            const final = await submitDurableAssistant(prepared);
            return NextResponse.json(
                final.status === 'done'
                    ? {
                          success: true,
                          product: POLYFLOW_PRODUCT_ID,
                          data: final.response,
                      }
                    : {
                          success: false,
                          error:
                              final.error?.message ??
                              'Submission tidak dapat diselesaikan.',
                      },
                { status: final.status === 'done' ? 200 : 422 },
            );
        }
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
                let closed = false;
                const send = (event: AssistantStreamEvent) => {
                    if (closed) return;
                    try {
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify(event)}\n\n`,
                            ),
                        );
                    } catch {
                        closed = true;
                    }
                };
                try {
                    // Deliberately do not tie durable work to the browser fetch
                    // signal. Disconnecting a watcher must not cancel accepted work.
                    const final = await submitDurableAssistant(prepared, {
                        stream: send,
                    });
                    if (final.status === 'done' && final.response) {
                        send({ type: 'done', data: final.response });
                    } else {
                        send({
                            type: 'error',
                            message:
                                final.error?.message ??
                                'Submission tidak dapat diselesaikan.',
                        });
                    }
                } catch (error) {
                    send({ type: 'error', message: clientSafeMessage(error) });
                } finally {
                    if (!closed)
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                }
            },
        });
        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'private, no-cache, no-transform',
                Connection: 'keep-alive',
                'X-Accel-Buffering': 'no',
            },
        });
    } catch (error) {
        const protocol =
            error instanceof AssistantWorkerProtocolError
                ? error
                : new AssistantWorkerProtocolError(
                      'UNAVAILABLE',
                      'Layanan asisten sedang tidak tersedia.',
                      503,
                      true,
                  );
        return NextResponse.json(
            { success: false, error: protocol.message, code: protocol.code },
            { status: protocol.status },
        );
    }
}

function clientSafeMessage(error: unknown): string {
    if (error instanceof AssistantWorkerProtocolError) return error.message;
    if (error instanceof DOMException && error.name === 'AbortError') {
        return 'Koneksi terputus. Sambungkan kembali dengan request yang sama.';
    }
    return 'Layanan asisten sedang tidak tersedia.';
}
