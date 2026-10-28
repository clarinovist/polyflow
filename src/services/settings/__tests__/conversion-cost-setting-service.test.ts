import { describe, expect, it, vi } from 'vitest';
import {
    CONVERSION_COST_SETTING_KEY,
    parseConversionCostSetting,
    readConversionCostSetting,
    saveConversionCostSetting,
} from '../conversion-cost-setting-service';

vi.mock('@/lib/core/prisma', () => ({ prisma: {} }));

const disabled = { enabled: false, accountIds: [] };

describe('parseConversionCostSetting', () => {
    it('keeps the session-based default for missing or malformed values', () => {
        expect(parseConversionCostSetting(undefined)).toEqual(disabled);
        expect(parseConversionCostSetting('not json')).toEqual(disabled);
        expect(parseConversionCostSetting('null')).toEqual(disabled);
        expect(parseConversionCostSetting('{"enabled":"yes","accountIds":[]}')).toEqual(disabled);
        expect(parseConversionCostSetting('{"enabled":true,"accountIds":"a"}')).toEqual(disabled);
        expect(parseConversionCostSetting('{"enabled":true,"accountIds":["a",3]}')).toEqual(disabled);
        expect(
            parseConversionCostSetting(JSON.stringify({ enabled: true, accountIds: Array.from({ length: 51 }, (_, i) => `a${i}`) })),
        ).toEqual(disabled);
    });

    it('reads enabled with accounts, enabled without accounts, and drops duplicates', () => {
        expect(parseConversionCostSetting('{"enabled":true,"accountIds":["a","b","a"]}')).toEqual({ enabled: true, accountIds: ['a', 'b'] });
        expect(parseConversionCostSetting('{"enabled":true,"accountIds":[]}')).toEqual({ enabled: true, accountIds: [] });
        expect(parseConversionCostSetting('{"enabled":false,"accountIds":["a"]}')).toEqual(disabled);
    });
});

describe('conversion cost setting storage', () => {
    it('reads the tenant row through the parser', async () => {
        const db = { appSetting: { findUnique: vi.fn(async () => ({ value: '{"enabled":true,"accountIds":["acc"]}' })) } };

        const setting = await readConversionCostSetting(db as never);

        expect(setting).toEqual({ enabled: true, accountIds: ['acc'] });
        expect(db.appSetting.findUnique).toHaveBeenCalledWith({ where: { key: CONVERSION_COST_SETTING_KEY }, select: { value: true } });
    });

    it('saves a normalized value and clears accounts when disabled', async () => {
        const db = { appSetting: { upsert: vi.fn(async () => ({})) } };

        const enabled = await saveConversionCostSetting({ enabled: true, accountIds: ['a', 'a', 'b'] }, 'admin', db as never);
        const off = await saveConversionCostSetting({ enabled: false, accountIds: ['a'] }, 'admin', db as never);

        expect(enabled).toEqual({ enabled: true, accountIds: ['a', 'b'] });
        expect(off).toEqual(disabled);
        expect(db.appSetting.upsert).toHaveBeenNthCalledWith(1, {
            where: { key: CONVERSION_COST_SETTING_KEY },
            create: { key: CONVERSION_COST_SETTING_KEY, value: '{"enabled":true,"accountIds":["a","b"]}', updatedBy: 'admin' },
            update: { value: '{"enabled":true,"accountIds":["a","b"]}', updatedBy: 'admin' },
        });
    });
});
