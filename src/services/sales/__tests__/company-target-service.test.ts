import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        appSetting: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

import { prisma } from '@/lib/core/prisma';
import { getCompanyTarget, setCompanyTarget } from '../company-target-service';
import { ValidationError } from '@/lib/errors/errors';

describe('company-target-service', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('getCompanyTarget', () => {
        it('mengembalikan null kalau belum pernah diset', async () => {
            // Arrange
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null);
            // Act
            const result = await getCompanyTarget(2026, 8);
            // Assert
            expect(result).toBeNull();
        });

        it('mem-parse value string tersimpan jadi number', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({
                key: 'sales:companyTarget:2026-08',
                value: '500000000',
                updatedAt: new Date(),
                updatedBy: null,
            } as never);

            const result = await getCompanyTarget(2026, 8);
            expect(result).toBe(500000000);
        });

        it('membaca dengan key yang di-pad 2 digit bulan', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null);
            await getCompanyTarget(2026, 3);
            expect(prisma.appSetting.findUnique).toHaveBeenCalledWith({
                where: { key: 'sales:companyTarget:2026-03' },
            });
        });

        it('menolak periodYear/periodMonth tidak valid', async () => {
            await expect(getCompanyTarget(2026, 13)).rejects.toThrow(
                ValidationError,
            );
            await expect(getCompanyTarget(1999, 1)).rejects.toThrow(
                ValidationError,
            );
        });

        it('mengembalikan null kalau value tersimpan bukan angka valid', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({
                key: 'sales:companyTarget:2026-08',
                value: 'not-a-number',
                updatedAt: new Date(),
                updatedBy: null,
            } as never);
            const result = await getCompanyTarget(2026, 8);
            expect(result).toBeNull();
        });
    });

    describe('setCompanyTarget', () => {
        it('upsert dengan key & value yang benar', async () => {
            vi.mocked(prisma.appSetting.upsert).mockResolvedValue(
                {} as never,
            );

            const result = await setCompanyTarget(2026, 8, 750000000, 'u1');

            expect(result).toBe(750000000);
            expect(prisma.appSetting.upsert).toHaveBeenCalledWith({
                where: { key: 'sales:companyTarget:2026-08' },
                create: {
                    key: 'sales:companyTarget:2026-08',
                    value: '750000000',
                    updatedBy: 'u1',
                },
                update: { value: '750000000', updatedBy: 'u1' },
            });
        });

        it('menolak nilai negatif', async () => {
            await expect(
                setCompanyTarget(2026, 8, -1, 'u1'),
            ).rejects.toThrow(ValidationError);
            expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
        });

        it('menolak NaN/Infinity', async () => {
            await expect(
                setCompanyTarget(2026, 8, NaN, 'u1'),
            ).rejects.toThrow(ValidationError);
            await expect(
                setCompanyTarget(2026, 8, Infinity, 'u1'),
            ).rejects.toThrow(ValidationError);
        });

        it('menolak nilai melebihi batas atas wajar', async () => {
            await expect(
                setCompanyTarget(2026, 8, 999_999_999_999_999, 'u1'),
            ).rejects.toThrow(ValidationError);
        });

        it('menerima updatedBy null (tidak wajib)', async () => {
            vi.mocked(prisma.appSetting.upsert).mockResolvedValue(
                {} as never,
            );
            const result = await setCompanyTarget(2026, 8, 100, null);
            expect(result).toBe(100);
            const call = vi.mocked(prisma.appSetting.upsert).mock
                .calls[0][0] as any;
            expect(call.create.updatedBy).toBeNull();
        });
    });
});
