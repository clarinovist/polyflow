import { describe, it, expect } from 'vitest';
import {
    assertNotReadOnlyFactoryManager,
    isReadOnlyFactoryManager,
} from '../read-only-role';
import { AuthorizationError } from '@/lib/errors/errors';

describe('isReadOnlyFactoryManager', () => {
    it('is true for FACTORY_MANAGER as primary role', () => {
        expect(isReadOnlyFactoryManager({ role: 'FACTORY_MANAGER' })).toBe(
            true,
        );
    });

    it('is true when FACTORY_MANAGER is only an assigned role', () => {
        expect(
            isReadOnlyFactoryManager({
                role: 'PRODUCTION',
                roles: ['PRODUCTION', 'FACTORY_MANAGER'],
            }),
        ).toBe(true);
    });

    it('is false when the user also has ADMIN', () => {
        expect(
            isReadOnlyFactoryManager({
                role: 'FACTORY_MANAGER',
                roles: ['FACTORY_MANAGER', 'ADMIN'],
            }),
        ).toBe(false);
    });

    it.each(['ADMIN', 'PRODUCTION', 'WAREHOUSE', 'HRD', 'PLANNING'])(
        'is false for %s',
        (role) => {
            expect(isReadOnlyFactoryManager({ role, roles: [role] })).toBe(
                false,
            );
        },
    );

    it('is false for a missing user', () => {
        expect(isReadOnlyFactoryManager(null)).toBe(false);
        expect(isReadOnlyFactoryManager(undefined)).toBe(false);
    });
});

describe('assertNotReadOnlyFactoryManager', () => {
    it('throws AuthorizationError for FACTORY_MANAGER without ADMIN', () => {
        expect(() =>
            assertNotReadOnlyFactoryManager({ role: 'FACTORY_MANAGER' }),
        ).toThrow(AuthorizationError);
    });

    it('uses an Indonesian message', () => {
        expect(() =>
            assertNotReadOnlyFactoryManager({ role: 'FACTORY_MANAGER' }),
        ).toThrow(/Kepala pabrik/);
    });

    it('does not throw for FACTORY_MANAGER with ADMIN', () => {
        expect(() =>
            assertNotReadOnlyFactoryManager({
                role: 'FACTORY_MANAGER',
                roles: ['ADMIN'],
            }),
        ).not.toThrow();
    });

    it.each(['PRODUCTION', 'WAREHOUSE', 'HRD', 'ADMIN'])(
        'does not throw for %s',
        (role) => {
            expect(() =>
                assertNotReadOnlyFactoryManager({ role, roles: [role] }),
            ).not.toThrow();
        },
    );
});
