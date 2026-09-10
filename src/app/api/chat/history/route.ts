import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { verifyAssistantSessionUser } from '@/lib/bot/assistant-session';
import { buildAssistantContext } from '@/lib/bot/assistant-context';
import {
    historyQuerySchema,
    queryConversationHistory,
} from '@/lib/bot/conversation-history';

const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export const GET = withTenantRoute(async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401, headers: privateHeaders },
        );
    }
    const tenantId = getTenantIdFromContext();
    if (!tenantId) {
        return NextResponse.json(
            { error: 'Tenant tidak tersedia.' },
            { status: 403, headers: privateHeaders },
        );
    }
    const user = await verifyAssistantSessionUser(session.user);
    if (!user) {
        return NextResponse.json(
            { error: 'Sesi tidak valid.' },
            { status: 403, headers: privateHeaders },
        );
    }
    const parsed = historyQuerySchema.safeParse(
        Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Permintaan riwayat tidak valid.' },
            { status: 400, headers: privateHeaders },
        );
    }
    try {
        const result = await queryConversationHistory(
            buildAssistantContext(user, tenantId),
            parsed.data,
        );
        if (
            parsed.data.mode === 'detail' &&
            'conversation' in result &&
            !result.conversation
        ) {
            return NextResponse.json(
                {
                    error: 'Percakapan tidak tersedia untuk akses Anda saat ini.',
                },
                { status: 404, headers: privateHeaders },
            );
        }
        return NextResponse.json(result, { headers: privateHeaders });
    } catch {
        return NextResponse.json(
            { error: 'Riwayat belum dapat dimuat. Silakan coba lagi.' },
            { status: 500, headers: privateHeaders },
        );
    }
});
