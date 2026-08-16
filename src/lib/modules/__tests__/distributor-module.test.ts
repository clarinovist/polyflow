import { describe, it, expect, afterEach } from 'vitest';
import {
    MODULE_DEFINITIONS,
    getModule,
    expandPackageModules,
    getPackage,
    PACKAGE_TEMPLATES,
    resolvePathToModule,
} from '../module-registry';
import {
    hasWorkspaceEntitlement,
    canAccessWorkspace,
    WORKSPACE_ACCESS_POLICY,
} from '@/lib/auth/access-policy';
import { getNavItemsForWorkspace } from '@/lib/navigation/registry';
import { flattenCatalog } from '@/lib/auth/permission-catalog';

const g = globalThis as unknown as {
    __polyflowEntitlementContext?: { getStore: () => string[] | undefined };
};

describe('DISTRIBUTOR module — registry', () => {
    it('is defined in MODULE_DEFINITIONS', () => {
        const mod = MODULE_DEFINITIONS.find((m) => m.key === 'DISTRIBUTOR');
        expect(mod).toBeDefined();
        expect(getModule('DISTRIBUTOR').landingPath).toBe('/distribution');
        expect(getModule('DISTRIBUTOR').workspaceRoots).toEqual([
            '/distribution',
        ]);
        expect(getModule('DISTRIBUTOR').alwaysActive).toBe(false);
    });

    it("resolves '/distribution' paths to DISTRIBUTOR", () => {
        expect(resolvePathToModule('/distribution')).toBe('DISTRIBUTOR');
        expect(resolvePathToModule('/distribution/some/deep')).toBe(
            'DISTRIBUTOR',
        );
    });
});

describe('POLYFLOW_DISTRIBUTION package', () => {
    it('exists in PACKAGE_TEMPLATES', () => {
        const pkg = PACKAGE_TEMPLATES.find((p) => p.key === 'DISTRIBUTION');
        expect(pkg).toBeDefined();
        expect(pkg?.label).toBe('Polyflow Distribution');
    });

    it('expands to distribution modules without manufacturing-only ones', () => {
        const modules = expandPackageModules('DISTRIBUTION');
        expect(modules).toContain('CORE');
        expect(modules).toContain('SALES');
        expect(modules).toContain('PURCHASING');
        expect(modules).toContain('INVENTORY');
        expect(modules).toContain('FINANCE');
        expect(modules).toContain('DISTRIBUTOR');
        expect(modules).not.toContain('PRODUCTION');
        expect(modules).not.toContain('MAKLON');
        expect(modules).not.toContain('HRD');
    });

    it('ERP_COMPLETE includes DISTRIBUTOR', () => {
        expect(expandPackageModules('ERP_COMPLETE')).toContain('DISTRIBUTOR');
    });

    it('getPackage throws for unknown package', () => {
        expect(() => getPackage('NOPE')).toThrow(/Unknown package/);
    });
});

describe('distribution workspace — access policy', () => {
    afterEach(() => {
        delete g.__polyflowEntitlementContext;
    });

    function setEntitlements(modules: string[]) {
        g.__polyflowEntitlementContext = { getStore: () => modules };
    }

    it('entitled when tenant has DISTRIBUTOR active', () => {
        setEntitlements(['CORE', 'SALES', 'DISTRIBUTOR']);
        expect(hasWorkspaceEntitlement('distribution')).toBe(true);
    });

    it('not entitled when tenant lacks DISTRIBUTOR', () => {
        setEntitlements(['CORE', 'SALES', 'PRODUCTION']);
        expect(hasWorkspaceEntitlement('distribution')).toBe(false);
    });

    it('distribution has a role policy entry', () => {
        expect(WORKSPACE_ACCESS_POLICY.distribution).toContain('SALES');
        expect(WORKSPACE_ACCESS_POLICY.distribution).toContain('ADMIN');
    });

    it('ADMIN role can access distribution workspace', () => {
        expect(
            canAccessWorkspace({ role: 'ADMIN' }, 'distribution'),
        ).toBe(true);
    });

    it('SALES role can access distribution workspace', () => {
        expect(
            canAccessWorkspace({ role: 'SALES' }, 'distribution'),
        ).toBe(true);
    });

    it('isolated WAREHOUSE role cannot access distribution workspace', () => {
        expect(
            canAccessWorkspace({ role: 'WAREHOUSE' }, 'distribution'),
        ).toBe(false);
    });
});

describe('distribution workspace — navigation & permission catalog', () => {
    it('has nav items registered under distribution workspace', () => {
        const items = getNavItemsForWorkspace('distribution');
        expect(items.length).toBeGreaterThan(0);
        expect(items.map((i) => i.id)).toContain('dist-dashboard');
        // Alias items point at canonical routes owned by other workspaces
        const alias = items.find((i) => i.id === 'dist-sales-orders');
        expect(alias?.isAlias).toBe(true);
        expect(alias?.canonicalHref).toBe('/sales/orders');
    });

    it('no duplicate hrefs introduced by distribution nav', async () => {
        const { findDuplicateHrefs } = await import(
            '@/lib/navigation/registry'
        );
        expect(findDuplicateHrefs()).toEqual([]);
    });

    it('permission catalog has /distribution node', () => {
        const keys = flattenCatalog().map((n) => n.key);
        expect(keys).toContain('/distribution');
    });
});
