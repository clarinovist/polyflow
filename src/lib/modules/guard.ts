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
        super(
            `Module "${moduleKey}" tidak tersedia untuk tenant ini.`,
        );
        this.name = 'ModuleNotEntitledError';
    }
}

// ---------------------------------------------------------------------------
// Guard for server actions (throws on denial)
// ---------------------------------------------------------------------------

/**
 * Wraps a server action to enforce module entitlement.
 * Throws ModuleNotEntitledError if the module is not active.
 *
 * Usage:
 *   export const myAction = withModuleGuard('HRD', async (input) => { ... });
 */
export function withModuleGuard<TArgs extends unknown[], TResult>(
    moduleKey: ModuleKey,
    fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
    return async (...args: TArgs): Promise<TResult> => {
        const tenantId = tenantIdContext.getStore();
        if (!tenantId) {
            throw new ModuleNotEntitledError(moduleKey, 'unknown');
        }

        const active = await isModuleActive(tenantId, moduleKey);
        if (!active) {
            throw new ModuleNotEntitledError(moduleKey, tenantId);
        }

        return fn(...args);
    };
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
 * Higher-order wrapper for route handlers that need module guard.
 * Combines withTenantRoute + module check.
 *
 * Usage:
 *   export const GET = withModuleRoute('FINANCE', async (req) => { ... });
 */
export function withModuleRoute(
    moduleKey: ModuleKey,
    handler: (req: Request) => Promise<NextResponse | Response>,
): (req: Request) => Promise<NextResponse | Response> {
    return async (req: Request): Promise<NextResponse | Response> => {
        const deny = await requireModuleOrNextResponse(moduleKey);
        if (deny) return deny;
        return handler(req);
    };
}
