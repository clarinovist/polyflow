import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
    TelegramAssistantLinkError,
    TelegramAssistantLinkService,
} from '@/services/telegram/assistant-link-service';
import { loadTelegramAssistantConfig } from '@/lib/telegram/assistant-config';
import { getMainPrisma, getTenantDb } from '@/lib/core/prisma';
import {
    CentralIdentityAccessError,
    CentralIdentityService,
} from '@/services/auth/central-identity-service';
import { AuthorizationError } from '@/lib/errors/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const privateHeaders = {
    'Cache-Control': 'private, no-store',
    Vary: 'Cookie',
    'X-Content-Type-Options': 'nosniff',
};

/** Mint a short-lived token only from an authenticated CENTRAL browser session.
 * Tenant-local ids, LOCAL sessions, superadmin and impersonation all fail closed. */
export async function POST() {
    const session = await auth();
    const user = session?.user as
        | {
              globalAccountId?: string;
              membershipId?: string;
              tenantId?: string;
              id?: string;
              globalRevocationVersion?: number;
              membershipVersion?: number;
              localAuthVersion?: number;
              isSuperAdmin?: boolean;
              impersonatedBy?: string;
          }
        | undefined;
    if (!user) {
        return NextResponse.json(
            { error: 'Autentikasi diperlukan.' },
            { status: 401, headers: privateHeaders },
        );
    }
    if (
        !user.globalAccountId ||
        !user.membershipId ||
        !user.tenantId ||
        !user.id ||
        user.globalRevocationVersion === undefined ||
        user.membershipVersion === undefined ||
        user.localAuthVersion === undefined ||
        user.isSuperAdmin ||
        user.impersonatedBy
    ) {
        return NextResponse.json(
            { error: 'Akun pusat CENTRAL diperlukan.' },
            { status: 403, headers: privateHeaders },
        );
    }
    try {
        const config = loadTelegramAssistantConfig();
        const main = getMainPrisma();
        await new CentralIdentityService({
            mainDb: main,
            loadTenantDb: async (tenantId) => {
                const tenant = await main.tenant.findFirst({
                    where: { id: tenantId, status: 'ACTIVE' },
                    select: { dbUrl: true },
                });
                if (!tenant?.dbUrl) {
                    throw new AuthorizationError('Tenant tidak aktif.');
                }
                return getTenantDb(tenant.dbUrl);
            },
        }).validateSessionBinding({
            globalAccountId: user.globalAccountId,
            membershipId: user.membershipId,
            tenantId: user.tenantId,
            tenantUserId: user.id,
            globalRevocationVersion: user.globalRevocationVersion,
            membershipVersion: user.membershipVersion,
            localAuthVersion: user.localAuthVersion,
        });
        const created = await new TelegramAssistantLinkService(
            main,
        ).createLinkToken(
            {
                globalAccountId: user.globalAccountId,
                isSuperAdmin: user.isSuperAdmin,
            },
        );
        return NextResponse.json(
            {
                token: created.token,
                expiresAt: created.expiresAt.toISOString(),
                startUrl: `https://t.me/${config.TELEGRAM_ASSISTANT_BOT_USERNAME}?start=${encodeURIComponent(created.token)}`,
            },
            { headers: privateHeaders },
        );
    } catch (error) {
        const status =
            error instanceof TelegramAssistantLinkError ||
            error instanceof CentralIdentityAccessError ||
            error instanceof AuthorizationError
                ? 403
                : 503;
        return NextResponse.json(
            {
                error:
                    status === 403
                        ? 'Akun pusat CENTRAL tidak aktif.'
                        : 'Integrasi Telegram belum tersedia.',
            },
            { status, headers: privateHeaders },
        );
    }
}
