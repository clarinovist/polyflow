/**
 * Tenant module entitlement resolver.
 *
 * This module provides server-only functions to check whether a tenant
 * has an active entitlement for a given module. All queries go through
 * getMainPrisma() — never the tenant proxy.
 *
 * Usage:
 *   const entitlements = await getTenantEntitlements();
 *   if (hasTenantModule(entitlements, 'HRD')) { ... }
 *   requireTenantModule(entitlements, 'HRD'); // throws if not entitled
 */

import { getMainPrisma } from '@/lib/core/prisma';
import { tenantIdContext } from '@/lib/core/prisma';
import type { ModuleKey } from '@/lib/modules/module-registry';
import { getModule } from '@/lib/modules/module-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TenantEntitlement {
    moduleKey: ModuleKey;
    status: string;
    enabledAt: Date;
    expiresAt: Date | null;
    config: unknown;
}

export interface TenantEntitlementContext {
    tenantId: string;
    entitlements: TenantEntitlement[];
    /** Pre-computed set for O(1) lookups. */
    activeModules: Set<ModuleKey>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve entitlements from the control DB for a given tenant. */
async function fetchEntitlements(
    tenantId: string,
): Promise<TenantEntitlement[]> {
    const mainPrisma = getMainPrisma();
    const rows = await mainPrisma.tenantModule.findMany({
        where: { tenantId },
    });

    const now = new Date();
    return rows
        .filter((r) => {
            // ACTIVE status and not expired
            if (r.status !== 'ACTIVE') return false;
            if (r.expiresAt && r.expiresAt < now) return false;
            return true;
        })
        .map((r) => ({
            moduleKey: r.moduleKey as ModuleKey,
            status: r.status,
            enabledAt: r.enabledAt,
            expiresAt: r.expiresAt,
            config: r.config,
        }));
}

/** Build the active modules set from entitlements + always-active CORE. */
function buildActiveModules(
    entitlements: TenantEntitlement[],
): Set<ModuleKey> {
    const active = new Set<ModuleKey>(['CORE']);
    for (const e of entitlements) {
        active.add(e.moduleKey);
    }
    return active;
}

// ---------------------------------------------------------------------------
// Public API — context-scoped (reads from AsyncLocalStorage)
// ---------------------------------------------------------------------------

/**
 * Get the current tenant's entitlement context.
 * Must be called within a `withTenant` scope (i.e., tenantIdContext must be set).
 * Returns null if tenantIdContext is not available.
 */
export async function getTenantEntitlementContext(): Promise<TenantEntitlementContext | null> {
    const tenantId = tenantIdContext.getStore();
    if (!tenantId) return null;

    const entitlements = await fetchEntitlements(tenantId);
    const activeModules = buildActiveModules(entitlements);
    return { tenantId, entitlements, activeModules };
}

/**
 * Check if the current tenant has an active module entitlement.
 * Returns true for CORE always (CORE is always active).
 * Returns false if tenant context is unavailable (safe default).
 */
export async function hasTenantModule(moduleKey: ModuleKey): Promise<boolean> {
    const ctx = await getTenantEntitlementContext();
    if (!ctx) return moduleKey === 'CORE';
    if (moduleKey === 'CORE') return true;
    return ctx.activeModules.has(moduleKey);
}

/**
 * Assert that the current tenant has an active module entitlement.
 * Throws a BusinessRuleError if the module is not entitled.
 */
export async function requireTenantModule(
    moduleKey: ModuleKey,
): Promise<void> {
    if (moduleKey === 'CORE') return;

    const ctx = await getTenantEntitlementContext();
    if (!ctx) {
        // No tenant context — this is likely a non-tenant request (super admin).
        // Allow CORE, deny everything else.
        throw new EntitlementError(
            `Module "${moduleKey}" is not available: no tenant context.`,
        );
    }

    const mod = getModule(moduleKey);

    // Check required modules
    for (const req of mod.requiredModules) {
        if (!ctx.activeModules.has(req)) {
            throw new EntitlementError(
                `Module "${moduleKey}" requires "${req}" which is not active for this tenant.`,
            );
        }
    }

    if (!ctx.activeModules.has(moduleKey)) {
        throw new EntitlementError(
            `Module "${moduleKey}" is not available for tenant "${ctx.tenantId}".`,
        );
    }
}

/**
 * Get the list of active module keys for the current tenant.
 * Always includes CORE.
 */
export async function getActiveModuleKeys(): Promise<ModuleKey[]> {
    const ctx = await getTenantEntitlementContext();
    if (!ctx) return ['CORE'];
    return Array.from(ctx.activeModules);
}

// ---------------------------------------------------------------------------
// Direct API — for cases where tenantId is known but context isn't set
// ---------------------------------------------------------------------------

/**
 * Check module entitlement for a specific tenant (no context required).
 * Useful in background jobs or cron tasks.
 */
export async function hasTenantModuleDirect(
    tenantId: string,
    moduleKey: ModuleKey,
): Promise<boolean> {
    if (moduleKey === 'CORE') return true;
    const entitlements = await fetchEntitlements(tenantId);
    const active = buildActiveModules(entitlements);
    return active.has(moduleKey);
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class EntitlementError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EntitlementError';
    }
}
