import { describe, it, expect } from 'vitest';
import { EntitlementError } from '../tenant-entitlements';

describe('EntitlementError', () => {
    it('is an instance of Error', () => {
        const err = new EntitlementError('test message');
        expect(err).toBeInstanceOf(Error);
    });

    it('has correct name', () => {
        const err = new EntitlementError('test');
        expect(err.name).toBe('EntitlementError');
    });

    it('has correct message', () => {
        const err = new EntitlementError('Module HRD not available');
        expect(err.message).toBe('Module HRD not available');
    });
});

describe('hasTenantModule', () => {
    it('returns true for CORE', async () => {
        const { hasTenantModule } = await import('../tenant-entitlements');
        const result = await hasTenantModule('CORE');
        expect(result).toBe(true);
    });
});

describe('getActiveModuleKeys', () => {
    it('returns only CORE when no context', async () => {
        const { getActiveModuleKeys } = await import('../tenant-entitlements');
        const result = await getActiveModuleKeys();
        // Without tenant context, should return only CORE
        expect(result).toContain('CORE');
    });
});
