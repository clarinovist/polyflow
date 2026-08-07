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

describe('requireAnyModuleOrNextResponse', () => {
    it('returns null when CORE is among the accepted modules', async () => {
        // Arrange
        const { requireAnyModuleOrNextResponse } = await import('../guard');

        // Act
        const result = await requireAnyModuleOrNextResponse([
            'CORE',
            'FINANCE',
        ]);

        // Assert
        expect(result).toBeNull();
    });

    it('returns null when no module is required', async () => {
        // Arrange
        const { requireAnyModuleOrNextResponse } = await import('../guard');

        // Act
        const result = await requireAnyModuleOrNextResponse([]);

        // Assert
        expect(result).toBeNull();
    });

    it('denies with 403 when there is no tenant context', async () => {
        // Arrange
        const { requireAnyModuleOrNextResponse } = await import('../guard');

        // Act — outside withTenantRoute there is no tenant in the ALS store
        const result = await requireAnyModuleOrNextResponse([
            'SALES',
            'INVENTORY',
        ]);

        // Assert — vitest.setup mocks NextResponse.json to { data, init }
        expect(result).not.toBeNull();
        const denied = result as unknown as {
            data: { error: string; moduleKey: string };
            init: { status: number };
        };
        expect(denied.init.status).toBe(403);
        expect(denied.data.error).toBe('MODULE_NOT_ENTITLED');
        // Both candidates named, so the log says what was actually tried
        expect(denied.data.moduleKey).toBe('SALES|INVENTORY');
    });
});
