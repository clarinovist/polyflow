import { describe, expect, it } from 'vitest';
import {
    getAvailableMobilePortals,
    getMobilePortalDecision,
} from '../mobile-portal-decision';
import { getMobilePortalById } from '../mobile-portal-registry';

const portal = (id: Parameters<typeof getMobilePortalById>[0]) => {
    const definition = getMobilePortalById(id);
    if (!definition) throw new Error('Missing portal fixture');
    return definition;
};

describe('mobile portal decision resolver', () => {
    it.each([
        [{ user: null }, 'NO_SESSION'],
        [
            {
                user: { role: 'SALES' },
                permissions: ['/finance'],
                activeModules: ['SALES'] as const,
            },
            'RESOURCE',
        ],
        [
            {
                user: { role: 'SALES' },
                permissions: ['/sales'],
                activeModules: [] as const,
            },
            'MODULE',
        ],
        [
            {
                user: { role: 'MARKETING' },
                permissions: ['/sales'],
                activeModules: ['SALES'] as const,
            },
            'ROLE',
        ],
    ] as const)('returns denial reason %s', (context, reason) => {
        expect(getMobilePortalDecision(portal('sales-field'), context)).toEqual(
            { allowed: false, reason },
        );
    });

    it('enforces Marketing rollout, role, resource, and ADMIN semantics', () => {
        const base = {
            activeModules: ['SALES'] as const,
            permissions: ['/field/marketing'],
            rollout: { 'mobile.portal.marketing.enabled': true },
        };
        expect(
            getMobilePortalDecision(portal('marketing-supervisor'), {
                ...base,
                user: { role: 'MARKETING' },
            }).allowed,
        ).toBe(true);
        expect(
            getMobilePortalDecision(portal('marketing-supervisor'), {
                ...base,
                user: { role: 'MARKETING' },
                rollout: { 'mobile.portal.marketing.enabled': false },
            }),
        ).toEqual({ allowed: false, reason: 'ROLLOUT' });
        expect(
            getMobilePortalDecision(portal('marketing-supervisor'), {
                ...base,
                user: { role: 'SALES' },
            }),
        ).toEqual({ allowed: false, reason: 'ROLE' });
        expect(
            getMobilePortalDecision(portal('marketing-supervisor'), {
                ...base,
                user: { role: 'ADMIN' },
                permissions: 'ALL',
            }).allowed,
        ).toBe(true);
    });

    it('fails closed when fresh resources are absent', () => {
        expect(
            getMobilePortalDecision(portal('finance'), {
                user: { role: 'FINANCE' },
                activeModules: ['FINANCE'],
            }),
        ).toEqual({ allowed: false, reason: 'RESOURCE' });
    });

    it('requires every factory-manager executive resource', () => {
        const context = {
            user: { role: 'FACTORY_MANAGER' },
            activeModules: ['PRODUCTION'] as const,
            permissions: [
                '/production/daily',
                '/warehouse/inventory',
                '/purchasing/requests',
            ],
        };
        expect(
            getMobilePortalDecision(portal('production-supervisor'), context),
        ).toEqual({ allowed: false, reason: 'RESOURCE' });
        expect(
            getMobilePortalDecision(portal('production-supervisor'), {
                ...context,
                permissions: [
                    ...context.permissions,
                    '/purchasing/orders',
                ],
            }).allowed,
        ).toBe(true);
    });

    it('does not let a secondary operational role weaken Factory Manager resources', () => {
        expect(
            getMobilePortalDecision(portal('production-supervisor'), {
                user: {
                    role: 'FACTORY_MANAGER',
                    roles: ['FACTORY_MANAGER', 'PRODUCTION'],
                },
                activeModules: ['PRODUCTION'],
                permissions: ['/production'],
            }),
        ).toEqual({ allowed: false, reason: 'RESOURCE' });
    });

    it('keeps planned portals non-navigable before rollout checks', () => {
        expect(
            getMobilePortalDecision(portal('maklon'), {
                user: { role: 'WAREHOUSE' },
                activeModules: ['MAKLON'],
                permissions: ['/maklon'],
                rollout: { 'mobile.portal.maklon.enabled': true },
            }),
        ).toEqual({ allowed: false, reason: 'PLANNED' });
    });

    it('allows only ADMIN with the tenant rollout into Admin Mobile', () => {
        const allowed = getMobilePortalDecision(portal('admin'), {
            user: { role: 'ADMIN' },
            activeModules: ['CORE'],
            permissions: 'ALL',
            rollout: { 'mobile.portal.admin.enabled': true },
        });
        expect(allowed.allowed).toBe(true);
        expect(
            getMobilePortalDecision(portal('admin'), {
                user: { role: 'ADMIN' },
                activeModules: ['CORE'],
                permissions: 'ALL',
                rollout: { 'mobile.portal.admin.enabled': false },
            }),
        ).toEqual({ allowed: false, reason: 'ROLLOUT' });
        expect(
            getMobilePortalDecision(portal('admin'), {
                user: { role: 'FINANCE' },
                activeModules: ['CORE'],
                permissions: ['/dashboard'],
                rollout: { 'mobile.portal.admin.enabled': true },
            }),
        ).toEqual({ allowed: false, reason: 'ROLE' });
        expect(
            getMobilePortalDecision(portal('admin'), {
                user: { role: 'ADMIN', isSuperAdmin: true },
                activeModules: ['CORE'],
                permissions: 'ALL',
                rollout: { 'mobile.portal.admin.enabled': true },
            }),
        ).toEqual({ allowed: false, reason: 'DESKTOP_ONLY' });
    });

    it('allows ADMIN preview only when the portal declares admin access and fresh context exists', () => {
        expect(
            getMobilePortalDecision(portal('production-supervisor'), {
                user: { role: 'ADMIN' },
                activeModules: ['PRODUCTION'],
                permissions: 'ALL',
                featurePermissions: [],
            }).allowed,
        ).toBe(true);
    });

    it('does not grant risky capability from ADMIN or ALL permissions', () => {
        expect(
            getMobilePortalDecision(
                portal('production-supervisor'),
                {
                    user: { role: 'ADMIN' },
                    activeModules: ['PRODUCTION'],
                    permissions: 'ALL',
                    featurePermissions: [],
                },
                'feature:mobile-maintenance-approval',
            ),
        ).toEqual({ allowed: false, reason: 'FEATURE' });
    });

    it('does not expose operational portals to ADMIN when adminAccess is NONE', () => {
        expect(
            getMobilePortalDecision(portal('warehouse'), {
                user: { roles: ['ADMIN', 'WAREHOUSE'] },
                activeModules: ['INVENTORY'],
                permissions: 'ALL',
            }),
        ).toEqual({ allowed: false, reason: 'ROLE' });
    });

    it('separates read access from explicit action capability', () => {
        const context = {
            user: { role: 'FACTORY_MANAGER' },
            activeModules: ['PRODUCTION'] as const,
            permissions: [
                '/production/daily',
                '/warehouse/inventory',
                '/purchasing/requests',
                '/purchasing/orders',
            ],
            featurePermissions: [] as string[],
        };
        expect(
            getMobilePortalDecision(portal('production-supervisor'), context)
                .allowed,
        ).toBe(true);
        expect(
            getMobilePortalDecision(
                portal('production-supervisor'),
                context,
                'feature:mobile-maintenance-approval',
            ),
        ).toEqual({ allowed: false, reason: 'FEATURE' });
        expect(
            getMobilePortalDecision(
                portal('production-supervisor'),
                {
                    ...context,
                    featurePermissions: [
                        'feature:mobile-maintenance-approval',
                    ],
                },
                'feature:mobile-maintenance-approval',
            ).allowed,
        ).toBe(true);
    });

    it('deduplicates multi-role portals in registry order', () => {
        const result = getAvailableMobilePortals({
            user: { roles: ['PRODUCTION', 'WAREHOUSE', 'PLANNING'] },
            activeModules: ['PRODUCTION', 'INVENTORY', 'PURCHASING'],
            permissions: ['/production', '/warehouse', '/purchasing'],
        });
        expect(result.map((item) => item.id)).toEqual([
            'warehouse',
            'production-kiosk',
            'production-supervisor',
            'purchasing',
        ]);
        expect(new Set(result.map((item) => item.id)).size).toBe(result.length);
    });
});
