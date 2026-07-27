import { describe, it, expect } from 'vitest';
import { ModuleNotEntitledError } from '../guard';

describe('ModuleNotEntitledError', () => {
    it('is an instance of Error', () => {
        const err = new ModuleNotEntitledError('HRD', 'tenant-1');
        expect(err).toBeInstanceOf(Error);
    });

    it('has correct name', () => {
        const err = new ModuleNotEntitledError('HRD', 'tenant-1');
        expect(err.name).toBe('ModuleNotEntitledError');
    });

    it('has correct moduleKey and tenantId', () => {
        const err = new ModuleNotEntitledError('FINANCE', 'tenant-2');
        expect(err.moduleKey).toBe('FINANCE');
        expect(err.tenantId).toBe('tenant-2');
    });

    it('has correct message containing module key', () => {
        const err = new ModuleNotEntitledError('HRD', 'tenant-1');
        expect(err.message).toContain('HRD');
        expect(err.message).toContain('tidak tersedia');
    });
});

describe('requireModuleOrNextResponse', () => {
    it('returns null for CORE module', async () => {
        const { requireModuleOrNextResponse } = await import('../guard');
        const result = await requireModuleOrNextResponse('CORE');
        expect(result).toBeNull();
    });
});
