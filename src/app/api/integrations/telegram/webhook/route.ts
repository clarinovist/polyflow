import { NextResponse } from 'next/server';
import { loadTelegramAssistantConfig } from '@/lib/telegram/assistant-config';
import { handleTelegramAssistantWebhook } from '@/lib/telegram/assistant-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
};

/** Root-host public webhook. Tenant authority is resolved only from MAIN state;
 * this route intentionally does not use withTenantRoute or payload host data. */
export async function POST(request: Request) {
    let config;
    try {
        config = loadTelegramAssistantConfig();
    } catch {
        return NextResponse.json(
            { ok: false },
            { status: 503, headers },
        );
    }
    try {
        const result = await handleTelegramAssistantWebhook(request, config);
        return NextResponse.json(result.body, {
            status: result.status,
            headers,
        });
    } catch (error) {
        console.error('[TELEGRAM_ASSISTANT_WEBHOOK_FAILED]', {
            code:
                error && typeof error === 'object' && 'code' in error
                    ? String(error.code)
                    : 'UNKNOWN',
        });
        return NextResponse.json({ ok: false }, { status: 500, headers });
    }
}
