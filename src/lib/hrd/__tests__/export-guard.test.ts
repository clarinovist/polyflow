import { describe, expect, it } from 'vitest';
import {
    denyUnlessRoles,
    HRD_APPROVER_ROLES,
    HRD_FINANCE_ROLES,
} from '../export-guard';

describe('denyUnlessRoles', () => {
    it('returns null when the user has an allowed role', () => {
        expect(denyUnlessRoles({ role: 'HRD' }, HRD_FINANCE_ROLES)).toBeNull();
        expect(
            denyUnlessRoles({ role: 'FINANCE' }, HRD_FINANCE_ROLES),
        ).toBeNull();
    });

    it('returns null when an assigned role matches', () => {
        expect(
            denyUnlessRoles(
                { role: 'SALES', roles: ['HRD'] },
                HRD_APPROVER_ROLES,
            ),
        ).toBeNull();
    });

    it('returns a 403 response for roles outside the list', async () => {
        const res = denyUnlessRoles({ role: 'SALES' }, HRD_FINANCE_ROLES);
        expect(res).not.toBeNull();
        expect(res?.status).toBe(403);
    });

    it('denies FINANCE on the approver-only list', () => {
        expect(
            denyUnlessRoles({ role: 'FINANCE' }, HRD_APPROVER_ROLES)?.status,
        ).toBe(403);
    });

    it('denies a missing user', () => {
        expect(denyUnlessRoles(null, HRD_FINANCE_ROLES)?.status).toBe(403);
        expect(denyUnlessRoles(undefined, HRD_FINANCE_ROLES)?.status).toBe(403);
    });
});
