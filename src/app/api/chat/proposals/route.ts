import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { verifyAssistantSessionUser } from '@/lib/bot/assistant-session';
import { ApplicationError } from '@/lib/errors/errors';
import {
    cancelProposal,
    confirmProposal,
    listPendingProposals,
} from '@/services/assistant/action-proposal-service';
import { buildInvoiceAccessGuard } from '@/services/assistant/invoice-access';
import { normalizeUserRoles } from '@/lib/auth/roles';
import { buildAssistantContext } from '@/lib/bot/assistant-context';
import { checkToolAuthorization } from '@/lib/bot/tool-authorization';
import { proposeCollectionFollowupTool } from '@/lib/bot/durable/proposal-tools';

const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

const decisionSchema = z
    .object({
        proposalId: z.string().min(1).max(100),
        action: z.enum(['confirm', 'cancel']),
    })
    .strict();

function json(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: privateHeaders });
}

/**
 * Same-origin guard for the state-changing POST. JSON content type already
 * forces a CORS preflight; this additionally rejects a mismatched Origin.
 */
function isSameOrigin(req: NextRequest): boolean {
    const origin = req.headers.get('origin');
    if (!origin) return true;
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    try {
        return Boolean(host) && new URL(origin).host === host;
    } catch {
        return false;
    }
}

async function resolveCaller() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: json({ error: 'Unauthorized' }, 401) } as const;
    }
    const tenantId = getTenantIdFromContext();
    if (!tenantId) {
        return { error: json({ error: 'Tenant tidak tersedia.' }, 403) } as const;
    }
    const user = await verifyAssistantSessionUser(session.user);
    if (!user?.id) {
        return { error: json({ error: 'Sesi tidak valid.' }, 403) } as const;
    }
    return { tenantId, user } as const;
}

export const GET = withTenantRoute(async function GET() {
    const caller = await resolveCaller();
    if ('error' in caller) return caller.error;
    try {
        const proposals = await listPendingProposals({
            tenantId: caller.tenantId,
            userId: caller.user.id,
        });
        return json({ success: true, data: { proposals } });
    } catch {
        return json({ error: 'Usulan belum dapat dimuat.' }, 500);
    }
});

export const POST = withTenantRoute(async function POST(req: NextRequest) {
    if (!isSameOrigin(req)) return json({ error: 'Forbidden' }, 403);
    if (!req.headers.get('content-type')?.includes('application/json')) {
        return json({ error: 'Permintaan tidak valid.' }, 415);
    }
    const caller = await resolveCaller();
    if ('error' in caller) return caller.error;

    const parsed = decisionSchema.safeParse(
        await req.json().catch(() => null),
    );
    if (!parsed.success) return json({ error: 'Permintaan tidak valid.' }, 400);

    const { proposalId, action } = parsed.data;
    const identity = {
        proposalId,
        tenantId: caller.tenantId,
        userId: caller.user.id,
    };

    try {
        if (action === 'cancel') {
            const cancelled = await cancelProposal(identity);
            return cancelled
                ? json({ success: true, data: { status: 'CANCELLED' } })
                : json({ error: 'Usulan tidak dapat dibatalkan.' }, 409);
        }
        // Same resource gate the assistant tool needed to create the proposal,
        // re-checked against live DB-verified permissions at confirm time.
        const authorization = checkToolAuthorization(
            proposeCollectionFollowupTool,
            buildAssistantContext(caller.user, caller.tenantId),
        );
        if (!authorization.allowed) {
            return json({ error: 'Akses ditolak.' }, 403);
        }
        const result = await confirmProposal({
            ...identity,
            assertInvoiceAccess: buildInvoiceAccessGuard({
                userId: caller.user.id,
                roles: normalizeUserRoles(caller.user.role, caller.user.roles),
            }),
        });
        return json({
            success: true,
            data: { status: 'CONFIRMED', resultRef: result.resultRef },
        });
    } catch (error) {
        if (error instanceof ApplicationError) {
            if (error.message.startsWith('PROPOSAL_NOT_CONFIRMABLE')) {
                return json(
                    { error: 'Usulan sudah diproses atau kedaluwarsa.' },
                    409,
                );
            }
            const status = error.statusCode === 404 ? 404 : 409;
            return json({ error: error.message }, status);
        }
        return json({ error: 'Usulan belum dapat diproses.' }, 500);
    }
});
