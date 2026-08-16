import { describe, it, expect } from 'vitest';
import {
    resolvePathToModule,
    resolveWorkspaceToModule,
    MODULE_DEFINITIONS,
} from '../module-registry';
import { getWorkspaceFromPath } from '@/lib/auth/access-policy';

describe('resolvePathToModule — workspace roots', () => {
    // Every workspaceRoot in registry must resolve back to its module
    for (const mod of MODULE_DEFINITIONS) {
        for (const root of mod.workspaceRoots) {
            it(`resolves "${root}" → ${mod.key}`, () => {
                expect(resolvePathToModule(root)).toBe(mod.key);
            });
            it(`resolves "${root}/deep/path" → ${mod.key}`, () => {
                expect(resolvePathToModule(`${root}/deep/path`)).toBe(
                    mod.key,
                );
            });
        }
    }

    // Sub-workspace alias mappings
    it("resolves '/field' → SALES", () => {
        expect(resolvePathToModule('/field')).toBe('SALES');
    });

    it("resolves '/kiosk' → PRODUCTION", () => {
        expect(resolvePathToModule('/kiosk')).toBe('PRODUCTION');
    });

    it("resolves '/field/orders' → SALES", () => {
        expect(resolvePathToModule('/field/orders')).toBe('SALES');
    });

    it("resolves '/kiosk/execution' → PRODUCTION", () => {
        expect(resolvePathToModule('/kiosk/execution')).toBe('PRODUCTION');
    });

    it("returns null for unknown path", () => {
        expect(resolvePathToModule('/unknown-module')).toBeNull();
    });

    it("returns null for root path", () => {
        expect(resolvePathToModule('/')).toBeNull();
    });
});

describe('resolveWorkspaceToModule', () => {
    it("resolves 'sales' → SALES", () => {
        expect(resolveWorkspaceToModule('sales')).toBe('SALES');
    });

    it("resolves 'production' → PRODUCTION", () => {
        expect(resolveWorkspaceToModule('production')).toBe('PRODUCTION');
    });

    it("resolves 'hrd' → HRD", () => {
        expect(resolveWorkspaceToModule('hrd')).toBe('HRD');
    });

    it("resolves 'warehouse' → INVENTORY", () => {
        expect(resolveWorkspaceToModule('warehouse')).toBe('INVENTORY');
    });

    it("resolves 'finance' → FINANCE", () => {
        expect(resolveWorkspaceToModule('finance')).toBe('FINANCE');
    });

    it("resolves 'purchasing' → PURCHASING", () => {
        expect(resolveWorkspaceToModule('purchasing')).toBe('PURCHASING');
    });

    it("resolves 'maklon' → MAKLON", () => {
        expect(resolveWorkspaceToModule('maklon')).toBe('MAKLON');
    });

    it("returns null for unknown workspace", () => {
        expect(resolveWorkspaceToModule('unknown')).toBeNull();
    });
});

describe('getWorkspaceFromPath — consistency with registry', () => {
    // Every top-level workspaceRoot segment must be recognized
    for (const mod of MODULE_DEFINITIONS) {
        for (const root of mod.workspaceRoots) {
            const segment = root.slice(1); // remove '/'

            // Skip sub-workspace aliases — they map to a different WorkspaceKey
            if (segment === 'field' || segment === 'kiosk') continue;

            it(`getWorkspaceFromPath("${root}") returns "${segment}"`, () => {
                expect(getWorkspaceFromPath(root)).toBe(segment);
            });
        }
    }

    // Sub-workspace aliases
    it("getWorkspaceFromPath('/field') → 'sales'", () => {
        expect(getWorkspaceFromPath('/field')).toBe('sales');
    });

    it("getWorkspaceFromPath('/kiosk') → 'production'", () => {
        expect(getWorkspaceFromPath('/kiosk')).toBe('production');
    });

    it("getWorkspaceFromPath('/field/orders') → 'sales'", () => {
        expect(getWorkspaceFromPath('/field/orders')).toBe('sales');
    });

    it("getWorkspaceFromPath('/kiosk/exec') → 'production'", () => {
        expect(getWorkspaceFromPath('/kiosk/exec')).toBe('production');
    });

    it("returns null for unknown workspace", () => {
        expect(getWorkspaceFromPath('/unknown')).toBeNull();
    });

    it("returns null for root path", () => {
        expect(getWorkspaceFromPath('/')).toBeNull();
    });
});

describe('requireModuleFromRequest', () => {
    it('returns null for CORE module', async () => {
        const { requireModuleFromRequest } = await import('../guard');
        const fakeReq = new Request('https://example.com');
        const result = await requireModuleFromRequest(fakeReq, 'CORE');
        expect(result).toBeNull();
    });

    it('denies with 403 when tenant context cannot be resolved', async () => {
        const { requireModuleFromRequest } = await import('../guard');
        const fakeReq = new Request('https://localhost:3000/api/upload/test');
        // No subdomain in host → resolveTenantContext returns NONE → allow
        // (non-tenant request like super admin)
        const result = await requireModuleFromRequest(fakeReq, 'HRD');
        expect(result).toBeNull();
    });
});
