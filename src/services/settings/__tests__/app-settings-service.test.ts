import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    parsePaymentBanksJson,
    getPaymentBanksSetting,
    savePaymentBanksSetting,
    PAYMENT_BANKS_SETTING_KEY,
} from '../app-settings-service';
import { prisma } from '@/lib/core/prisma';
import { ValidationError } from '@/lib/errors/errors';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        appSetting: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
        account: {
            findUnique: vi.fn(),
        },
    },
}));

describe('app-settings-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('parsePaymentBanksJson', () => {
        it('returns empty array when input is null, undefined, or empty', () => {
            expect(parsePaymentBanksJson(null)).toEqual([]);
            expect(parsePaymentBanksJson(undefined)).toEqual([]);
            expect(parsePaymentBanksJson('')).toEqual([]);
        });

        it('returns empty array for invalid JSON or non-object JSON', () => {
            expect(parsePaymentBanksJson('invalid json')).toEqual([]);
            expect(parsePaymentBanksJson('123')).toEqual([]);
        });

        it('parses the legacy object shape (BCA/MANDIRI keys)', () => {
            const raw = JSON.stringify({
                BCA: { holder: 'PT Polyflow', account: '1234567890' },
                MANDIRI: { holder: 'PT Polyflow', account: '0987654321' },
            });
            const parsed = parsePaymentBanksJson(raw);
            expect(parsed.find((b) => b.key === 'BCA')?.account).toBe(
                '1234567890',
            );
            expect(parsed.find((b) => b.key === 'MANDIRI')?.account).toBe(
                '0987654321',
            );
        });

        it('parses the current array shape, including a third bank with glAccountId', () => {
            const raw = JSON.stringify([
                { key: 'BCA', name: 'BCA', holder: 'PT Polyflow', account: '111' },
                {
                    key: 'BRI',
                    name: 'BRI',
                    holder: 'PT Polyflow',
                    account: '222',
                    glAccountId: 'acc-bri-1',
                },
            ]);
            const parsed = parsePaymentBanksJson(raw);
            expect(parsed).toHaveLength(2);
            const bri = parsed.find((b) => b.key === 'BRI');
            expect(bri?.account).toBe('222');
            expect(bri?.glAccountId).toBe('acc-bri-1');
        });

        it('uses fallback default name/holder for legacy keys when missing', () => {
            const raw = JSON.stringify({
                BCA: { holder: '', account: '1234' },
                MANDIRI: { holder: '', account: '5678' },
            });
            const parsed = parsePaymentBanksJson(raw);
            expect(parsed.find((b) => b.key === 'BCA')?.holder).toBe('BCA');
            expect(parsed.find((b) => b.key === 'MANDIRI')?.holder).toBe(
                'Mandiri',
            );
        });

        it('drops rows with an invalid key or missing account', () => {
            const raw = JSON.stringify([
                { key: 'bad key!', name: 'x', holder: 'x', account: '111' },
                { key: 'NOACC', name: 'x', holder: 'x', account: '' },
            ]);
            expect(parsePaymentBanksJson(raw)).toEqual([]);
        });
    });

    describe('getPaymentBanksSetting', () => {
        it('fetches setting from DB and parses it', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({
                id: 's1',
                key: PAYMENT_BANKS_SETTING_KEY,
                value: JSON.stringify({
                    BCA: { holder: 'BCA Test', account: '9999' },
                }),
                updatedBy: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as any);

            const result = await getPaymentBanksSetting();
            expect(result.find((b) => b.key === 'BCA')?.account).toBe('9999');
        });

        it('returns empty array when setting does not exist in DB', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null);
            const result = await getPaymentBanksSetting();
            expect(result).toEqual([]);
        });
    });

    describe('savePaymentBanksSetting', () => {
        it('saves valid legacy bank setting to DB', async () => {
            vi.mocked(prisma.appSetting.upsert).mockResolvedValue({} as any);

            const banks = [
                {
                    key: 'BCA',
                    name: 'BCA',
                    holder: 'PT Polyflow',
                    account: '123-456-789',
                },
            ];
            const saved = await savePaymentBanksSetting(banks);
            expect(saved.find((b) => b.key === 'BCA')?.account).toBe(
                '123-456-789',
            );
            expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { key: PAYMENT_BANKS_SETTING_KEY },
                }),
            );
        });

        it('throws ValidationError when account number is invalid format', async () => {
            const banks = [
                {
                    key: 'BCA',
                    name: 'BCA',
                    holder: 'PT Polyflow',
                    account: 'ABC-INVALID',
                },
            ];
            await expect(savePaymentBanksSetting(banks)).rejects.toThrow(
                ValidationError,
            );
        });

        it('throws ValidationError when a non-legacy bank has no glAccountId', async () => {
            const banks = [
                {
                    key: 'BRI',
                    name: 'BRI',
                    holder: 'PT Polyflow',
                    account: '5555',
                },
            ];
            await expect(savePaymentBanksSetting(banks)).rejects.toThrow(
                ValidationError,
            );
        });

        it('throws ValidationError when glAccountId does not resolve to an active account', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue(null);
            const banks = [
                {
                    key: 'BRI',
                    name: 'BRI',
                    holder: 'PT Polyflow',
                    account: '5555',
                    glAccountId: 'missing-acc',
                },
            ];
            await expect(savePaymentBanksSetting(banks)).rejects.toThrow(
                ValidationError,
            );
        });

        it('saves a non-legacy bank when glAccountId resolves to an active account', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-bri-1',
                isActive: true,
            } as any);
            vi.mocked(prisma.appSetting.upsert).mockResolvedValue({} as any);

            const banks = [
                {
                    key: 'BRI',
                    name: 'BRI',
                    holder: 'PT Polyflow',
                    account: '5555',
                    glAccountId: 'acc-bri-1',
                },
            ];
            const saved = await savePaymentBanksSetting(banks);
            expect(saved.find((b) => b.key === 'BRI')?.glAccountId).toBe(
                'acc-bri-1',
            );
        });

        it('throws ValidationError when more than the max bank count is submitted', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc',
                isActive: true,
            } as any);
            const banks = Array.from({ length: 9 }, (_, i) => ({
                key: `BANK${i}`,
                name: `Bank ${i}`,
                holder: 'PT Polyflow',
                account: `${1000 + i}`,
                glAccountId: 'acc',
            }));
            await expect(savePaymentBanksSetting(banks)).rejects.toThrow(
                ValidationError,
            );
        });
    });
});
