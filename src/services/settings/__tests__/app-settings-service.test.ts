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
    },
}));

describe('app-settings-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('parsePaymentBanksJson', () => {
        it('returns empty object when input is null, undefined, or empty', () => {
            expect(parsePaymentBanksJson(null)).toEqual({});
            expect(parsePaymentBanksJson(undefined)).toEqual({});
            expect(parsePaymentBanksJson('')).toEqual({});
        });

        it('returns empty object for invalid JSON or non-object JSON', () => {
            expect(parsePaymentBanksJson('invalid json')).toEqual({});
            expect(parsePaymentBanksJson('123')).toEqual({});
            expect(parsePaymentBanksJson('["a"]')).toEqual({});
        });

        it('parses valid BCA and MANDIRI bank settings', () => {
            const raw = JSON.stringify({
                BCA: { holder: 'PT Polyflow', account: '1234567890' },
                MANDIRI: { holder: 'PT Polyflow', account: '0987654321' },
                INVALID: { holder: 'Foo', account: '111' },
            });
            const parsed = parsePaymentBanksJson(raw);
            expect(parsed.BCA?.account).toBe('1234567890');
            expect(parsed.MANDIRI?.account).toBe('0987654321');
            expect((parsed as any).INVALID).toBeUndefined();
        });

        it('uses fallback default holder when holder is empty', () => {
            const raw = JSON.stringify({
                BCA: { holder: '', account: '1234' },
                MANDIRI: { holder: '', account: '5678' },
            });
            const parsed = parsePaymentBanksJson(raw);
            expect(parsed.BCA?.holder).toBe('BCA');
            expect(parsed.MANDIRI?.holder).toBe('Mandiri');
        });
        it('handles non-object bank value or missing account in parsePaymentBanksJson', () => {
            const raw = JSON.stringify({
                BCA: 'not an object',
                MANDIRI: { holder: 'Mandiri', account: '' },
            });
            const parsed = parsePaymentBanksJson(raw);
            expect(parsed).toEqual({});
        });
    });

    describe('getPaymentBanksSetting', () => {
        it('fetches setting from DB and parses it', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({
                id: 's1',
                key: PAYMENT_BANKS_SETTING_KEY,
                value: JSON.stringify({ BCA: { holder: 'BCA Test', account: '9999' } }),
                updatedBy: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as any);

            const result = await getPaymentBanksSetting();
            expect(result.BCA?.account).toBe('9999');
        });

        it('returns empty object when setting does not exist in DB', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null);
            const result = await getPaymentBanksSetting();
            expect(result).toEqual({});
        });
    });

    describe('savePaymentBanksSetting', () => {
        it('saves valid payment bank setting to DB with default updatedBy', async () => {
            vi.mocked(prisma.appSetting.upsert).mockResolvedValue({} as any);

            const banks = {
                BCA: { holder: 'PT Polyflow', account: '123-456-789' },
            };
            const saved = await savePaymentBanksSetting(banks);
            expect(saved.BCA?.account).toBe('123-456-789');
            expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { key: PAYMENT_BANKS_SETTING_KEY },
                }),
            );
        });

        it('throws ValidationError when account number is invalid format', async () => {
            const banks = {
                BCA: { holder: 'PT Polyflow', account: 'ABC-INVALID' },
            };
            await expect(savePaymentBanksSetting(banks)).rejects.toThrow(ValidationError);
        });
    });
});
