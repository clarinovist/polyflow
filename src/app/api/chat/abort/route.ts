import { NextResponse, type NextRequest } from 'next/server';
import { withTenantRoute } from '@/lib/core/tenant';
import { prepareAssistantWebRequest } from '@/lib/bot/durable/web-bridge';
import { getAssistantWorkerClient } from '@/lib/bot/durable/worker-client';
import { AssistantWorkerProtocolError } from '@/lib/bot/durable/protocol';

export const POST = withTenantRoute(async function POST(request: NextRequest) {
    try {
        const prepared = await prepareAssistantWebRequest(request);
        const result = await getAssistantWorkerClient().abort(
            prepared.envelope,
        );
        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        const failure =
            error instanceof AssistantWorkerProtocolError
                ? error
                : new AssistantWorkerProtocolError(
                      'UNAVAILABLE',
                      'Pembatalan belum dapat dikonfirmasi.',
                      503,
                      true,
                  );
        return NextResponse.json(
            { success: false, error: failure.message, code: failure.code },
            { status: failure.status },
        );
    }
});
