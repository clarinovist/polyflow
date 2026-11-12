import { describe, expect, it } from 'vitest';
import {
    commandNumbers,
    voiceCommandSchema,
    voiceCommandsResponseSchema,
    VOICE_LIMITS,
} from '../voice-commands';

function parse(input: unknown) {
    return voiceCommandSchema.safeParse(input);
}

describe('voiceCommandSchema', () => {
    it('accepts add_material and treats null optionals as absent', () => {
        const result = parse({
            op: 'add_material',
            name: 'Benang',
            unit: 'kg',
            qty: 120,
            price: 14500,
            scrapPercent: null,
            stage: null,
            heard: 'benang 120 kilo',
        });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ scrapPercent: undefined, stage: undefined });
    });

    it('defaults heard to an empty string and truncates a long one', () => {
        const long = 'x'.repeat(VOICE_LIMITS.maxHeardLength + 50);

        const missing = parse({ op: 'remove_material', name: 'Benang' });
        const truncated = parse({ op: 'remove_material', name: 'Benang', heard: long });

        expect(missing.data).toMatchObject({ heard: '' });
        expect(truncated.data).toMatchObject({ heard: 'x'.repeat(VOICE_LIMITS.maxHeardLength) });
    });

    it.each([
        ['an unknown op', { op: 'drop_table' }],
        ['a negative quantity', { op: 'add_material', name: 'A', unit: 'KG', qty: -1, price: 1 }],
        ['a price above the limit', { op: 'add_material', name: 'A', unit: 'KG', qty: 1, price: 1e15 }],
        ['scrap above the limit', { op: 'add_material', name: 'A', unit: 'KG', qty: 1, price: 1, scrapPercent: 501 }],
        ['a zero output quantity', { op: 'set_output', qty: 0 }],
        ['a zero sell price', { op: 'set_sell_price', price: 0 }],
        ['an update with nothing to change', { op: 'update_material', name: 'A' }],
        ['an update_cost with nothing to change', { op: 'update_cost', label: 'Listrik' }],
        ['select_stage without a stage', { op: 'select_stage' }],
        ['a too long name', { op: 'remove_cost', label: 'x'.repeat(200) }],
    ])('rejects %s', (_name, input) => {
        expect(parse(input).success).toBe(false);
    });

    it('requires the fields of the chosen cost formula', () => {
        const missing = parse({ op: 'add_cost', label: 'Listrik', formula: 'quantity-times-unit-cost', quantity: 10 });
        const complete = parse({
            op: 'add_cost',
            label: 'Listrik',
            formula: 'quantity-times-unit-cost',
            quantity: 10,
            unitCost: 1500,
        });

        expect(missing.success).toBe(false);
        expect(complete.success).toBe(true);
        expect(complete.data).toMatchObject({ category: 'conversion' });
    });

    it('rejects more than the command cap in one reply', () => {
        const command = { op: 'remove_material', name: 'A' };
        const tooMany = Array.from({ length: VOICE_LIMITS.maxCommands + 1 }, () => command);

        expect(voiceCommandsResponseSchema.safeParse({ commands: tooMany }).success).toBe(false);
        expect(voiceCommandsResponseSchema.safeParse({ commands: [command] }).success).toBe(true);
    });
});

describe('commandNumbers', () => {
    it('lists every numeric field but not a defaulted zero scrap', () => {
        const command = voiceCommandSchema.parse({
            op: 'add_material',
            name: 'Benang',
            unit: 'KG',
            qty: 120,
            price: 14500,
            scrapPercent: 0,
        });

        expect(commandNumbers(command)).toEqual([
            { field: 'qty', value: 120 },
            { field: 'price', value: 14500 },
        ]);
    });

    it('keeps a spoken scrap percentage', () => {
        const command = voiceCommandSchema.parse({ op: 'update_material', name: 'A', scrapPercent: 3 });

        expect(commandNumbers(command)).toEqual([{ field: 'scrapPercent', value: 3 }]);
    });
});
