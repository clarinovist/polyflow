/**
 * Server-side module entitlement enforcement for server actions and API routes.
 *
 * Usage in server actions:
 *   import { withModuleGuard } from '@/lib/modules/guard';
 *
 *   export const myAction = withTenant(
 *     withModuleGuard('HRD', async (input) => {
 *       // ... action logic
 *     })
 *   );
 *
 * Usage in API routes:
 *   import { requireModuleOrNextResponse } from '@/lib/modules/guard';
 *
 *   export const GET = withTenantRoute(async (req) => {
 *     const deny = await requireModuleOrNextResponse('FINANCE');
 *     if (deny) return deny;
 *     // ... handler logic
 *   });
 */

import { tenantIdContext } from '@/lib/core/prisma';
import { getMainPrisma } from '@/lib/core/prisma';
import type { ModuleKey } from '@/lib/modules/module-registry';
import { NextResponse } from 'next/server';
import { BusinessRuleError } from '@/lib/errors/errors';

// ---------------------------------------------------------------------------
// Active module resolution (mirrors access-policy.ts logic for standalone use)
// ---------------------------------------------------------------------------

async function isModuleActive(
    tenantId: string,
    moduleKey: ModuleKey,
): Promise<boolean> {
    if (moduleKey === 'CORE') return true;
    try {
        const mainPrisma = getMainPrisma();
        const now = new Date();
        const entitlement = await mainPrisma.tenantModule.findUnique({
            where: {
                tenantId_moduleKey: { tenantId, moduleKey },
            },
        });
        if (!entitlement) return false;
        if (entitlement.status !== 'ACTIVE') return false;
        if (entitlement.expiresAt && entitlement.expiresAt < now) return false;
        return true;
    } catch {
        return false; // fail-closed
    }
}

// ---------------------------------------------------------------------------
// Guard for server actions (throws on denial)
// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ModuleNotEntitledError extends BusinessRuleError {
    constructor(
        public readonly moduleKey: ModuleKey,
        public readonly tenantId: string,
    ) {
        super(`Module "${moduleKey}" tidak tersedia untuk tenant ini.`);
        this.name = 'ModuleNotEntitledError';
    }
}
// ---------------------------------------------------------------------------
// Guard for API routes (returns NextResponse on denial)
// ---------------------------------------------------------------------------

/**
 * Checks module entitlement for an API route handler.
 * Returns a NextResponse 403 if denied, or null if entitled (proceed).
 *
 * Usage:
 *   export const GET = withTenantRoute(async (req) => {
 *     const deny = await requireModuleOrNextResponse('FINANCE');
 *     if (deny) return deny;
 *     // ... handler
 *   });
 */
export async function requireModuleOrNextResponse(
    moduleKey: ModuleKey,
): Promise<NextResponse | null> {
    if (moduleKey === 'CORE') return null;

    const tenantId = tenantIdContext.getStore();
    if (!tenantId) {
        return NextResponse.json(
            {
                error: 'MODULE_NOT_ENTITLED',
                moduleKey,
                message: `Module "${moduleKey}" is not available.`,
            },
            { status: 403 },
        );
    }

    const active = await isModuleActive(tenantId, moduleKey);
    if (!active) {
        return NextResponse.json(
            {
                error: 'MODULE_NOT_ENTITLED',
                moduleKey,
                message: `Module "${moduleKey}" is not available for this tenant.`,
            },
            { status: 403 },
        );
    }

    return null;
}

/**
 * Same as `requireModuleOrNextResponse` but passes when **any** of the given
 * modules is active.
 *
 * For documents reachable from more than one workspace: a delivery note lives
 * under /sales for a SALES tenant and under /warehouse for an INVENTORY one,
 * and the OPERATIONS package ships INVENTORY without SALES — a single-key
 * guard would lock those tenants out of their own surat jalan.
 *
 * Usage:
 *   const deny = await requireAnyModuleOrNextResponse(['SALES', 'INVENTORY']);
 *   if (deny) return deny;
 */
export async function requireAnyModuleOrNextResponse(
    moduleKeys: ModuleKey[],
): Promise<NextResponse | null> {
    if (moduleKeys.length === 0 || moduleKeys.includes('CORE')) return null;

    const denied = NextResponse.json(
        {
            error: 'MODULE_NOT_ENTITLED',
            moduleKey: moduleKeys.join('|'),
            message: `None of the modules "${moduleKeys.join('", "')}" are available for this tenant.`,
        },
        { status: 403 },
    );

    const tenantId = tenantIdContext.getStore();
    if (!tenantId) return denied;

    for (const moduleKey of moduleKeys) {
        if (await isModuleActive(tenantId, moduleKey)) return null;
    }

    return denied;
}
// ---------------------------------------------------------------------------
// Guard for routes NOT wrapped in withTenantRoute (e.g. upload routes)
// ---------------------------------------------------------------------------

/**
 * Checks module entitlement for a route handler that is NOT inside
 * withTenantRoute (and therefore has no tenantIdContext set).
 *
 * Resolves the tenant from request headers, then checks activeModules.
 * Returns a NextResponse 403 if denied, or null if entitled (proceed).
 *
 * Usage:
 *   export async function POST(req: NextRequest) {
 *     const deny = await requireModuleFromRequest(req, 'HRD');
 *     if (deny) return deny;
 *     // ... handler
 *   }
 */
export async function requireModuleFromRequest(
    req: Request,
    moduleKey: ModuleKey,
): Promise<NextResponse | null> {
    if (moduleKey === 'CORE') return null;

    try {
        const { resolveTenantContext } = await import('@/lib/core/tenant');
        const result = await resolveTenantContext(req.headers);
        // Only NONE is a non-tenant request; NOT_FOUND may be a registry failure.
        if (result.type === 'NONE') return null;
        if (result.type === 'NOT_FOUND' || !result.activeModules.includes(moduleKey)) {
            return NextResponse.json(
                {
                    error: 'MODULE_NOT_ENTITLED',
                    moduleKey,
                    message: `Module "${moduleKey}" is not available for this tenant.`,
                },
                { status: 403 },
            );
        }
        return null;
    } catch {
        // fail-closed: deny on error
        return NextResponse.json(
            {
                error: 'MODULE_NOT_ENTITLED',
                moduleKey,
                message: `Module "${moduleKey}" is not available.`,
            },
            { status: 403 },
        );
    }
}