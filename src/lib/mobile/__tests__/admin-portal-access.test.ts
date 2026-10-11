import { describe, expect, it } from 'vitest';
import { getAvailableMobilePortals, getMobilePortalDecision } from '../mobile-portal-decision';
import { getAvailableMobilePortals as getCandidates, getMobileHomeForUser } from '../mobile-access-policy';
import { getMobilePortalById, MOBILE_PORTAL_REGISTRY } from '../mobile-portal-registry';
import type { MobilePortalDecisionContext } from '../mobile-portal-decision';

const context: MobilePortalDecisionContext = {
    user: { role: 'ADMIN' },
    permissions: 'ALL',
    activeModules: ['CORE', 'SALES', 'INVENTORY', 'PRODUCTION', 'PURCHASING', 'FINANCE', 'HRD', 'MAKLON'],
    rollout: { 'mobile.portal.admin.enabled': true },
    featurePermissions: [],
};
const activeIds = [
    'sales-field', 'warehouse', 'production-kiosk', 'production-supervisor',
    'purchasing', 'finance', 'hrd-supervisor',
];

describe('tenant ADMIN portal contract', () => {
    it.each([
        { role: 'ADMIN' },
        { role: 'MARKETING', roles: ['MARKETING', 'ADMIN'] },
        { roles: ['ADMIN', 'WAREHOUSE'] },
    ])('discovers every active portal without assigning operational roles: %j', (user) => {
        expect(getAvailableMobilePortals({ ...context, user }).map(p => p.id))
            .toEqual([...activeIds, 'admin']);
        expect(getMobileHomeForUser(user)).toBe('/mobile');
    });

    it('keeps role-only candidates optimistic and aligns admin metadata', () => {
        const candidates = getCandidates(context.user);
        expect(candidates.map(p => p.id)).toEqual([
            'sales-field', 'marketing-supervisor', ...activeIds.slice(1), 'admin',
        ]);
        expect(candidates.every(p => p.capabilities.length === 0)).toBe(true);
    });

    it.each(MOBILE_PORTAL_REGISTRY.filter(p => p.status !== 'PLANNED'))(
        '$id allows ADMIN reads but still denies a revoked module', (portal) => {
            const enabled = {
                ...context,
                rollout: { ...context.rollout, 'mobile.portal.marketing.enabled': true },
            };
            expect(getMobilePortalDecision(portal, enabled)).toMatchObject({ allowed: true });
            expect(getMobilePortalDecision(portal, {
                ...enabled,
                activeModules: context.activeModules!.filter(m => m !== portal.moduleKey),
            })).toEqual({ allowed: false, reason: 'MODULE' });
        },
    );

    it('never uses ADMIN as a substitute for rollout or implementation', () => {
        const ids = getAvailableMobilePortals({ ...context, rollout: {} }).map(p => p.id);
        expect(ids).toEqual(activeIds);
        expect(getMobilePortalDecision(getMobilePortalById('maklon')!, context))
            .toEqual({ allowed: false, reason: 'PLANNED' });
    });

    it.each(MOBILE_PORTAL_REGISTRY.flatMap(portal =>
        portal.capabilities.map(capability => ({ portal, capability })),
    ))('does not grant $capability from ADMIN or ALL', ({ portal, capability }) => {
        expect(getMobilePortalDecision(portal, {
            ...context,
            rollout: { ...context.rollout, 'mobile.portal.marketing.enabled': true },
        }, capability)).toEqual({ allowed: false, reason: 'FEATURE' });
    });

    it.each([
        null,
        { role: 'ADMIN', isSuperAdmin: true },
        { role: 'ADMIN', impersonatedBy: 'platform-user' },
    ])('does not open portals for invalid or desktop-only sessions: %j', (user) => {
        expect(getAvailableMobilePortals({ ...context, user })).toEqual([]);
    });

    it('requires fresh tenant module state even for ADMIN', () => {
        expect(getAvailableMobilePortals({ ...context, activeModules: undefined })).toEqual([]);
    });

    it('preserves the non-admin Marketing restriction on Sales Field', () => {
        expect(getMobilePortalDecision(getMobilePortalById('sales-field')!, {
            ...context, user: { roles: ['MARKETING', 'SALES'] },
        })).toEqual({ allowed: false, reason: 'ROLE' });
    });
});
