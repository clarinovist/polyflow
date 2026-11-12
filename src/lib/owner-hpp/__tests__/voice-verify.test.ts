import { describe, expect, it } from 'vitest';
import { voiceCommandSchema, type VoiceCommand } from '../voice-commands';
import { verifyCommandNumbers } from '../voice-verify';

function material(price: number, qty = 120): VoiceCommand {
    return voiceCommandSchema.parse({
        op: 'add_material',
        name: 'Benang',
        unit: 'KG',
        qty,
        price,
        heard: 'benang seratus dua puluh kilo',
    });
}

describe('verifyCommandNumbers', () => {
    const transcript = 'tambah benang seratus dua puluh kilo harga 14.500';

    it('accepts a command whose numbers were all spoken', () => {
        const result = verifyCommandNumbers([material(14500)], transcript);

        expect(result.commands).toHaveLength(1);
        expect(result.warnings).toEqual([]);
    });

    it('skips 14.500 turned into 14.500.000 with a warning that shows what was heard', () => {
        const result = verifyCommandNumbers([material(14_500_000)], transcript);

        expect(result.commands).toEqual([]);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('tidak ada di ucapan');
        expect(result.warnings[0]).toContain('benang seratus dua puluh kilo');
    });

    it('skips 14.500.000 turned into 14.500', () => {
        const result = verifyCommandNumbers([material(14500)], 'harga 14.500.000 dan 120 kilo');

        expect(result.commands).toEqual([]);
    });

    it('keeps the valid commands and skips only the bad one', () => {
        const result = verifyCommandNumbers([material(14500), material(40000)], transcript);

        expect(result.commands).toHaveLength(1);
        expect(result.warnings).toHaveLength(1);
    });

    it('does not require the owner to say a defaulted zero scrap', () => {
        const command = voiceCommandSchema.parse({
            op: 'add_material', name: 'A', unit: 'KG', qty: 5, price: 7, scrapPercent: 0,
        });

        expect(verifyCommandNumbers([command], 'lima kilo harga tujuh').commands).toHaveLength(1);
    });

    it('lets commands without numbers through', () => {
        const command = voiceCommandSchema.parse({ op: 'select_stage', stage: 'Packing' });

        expect(verifyCommandNumbers([command], 'pindah ke packing').commands).toHaveLength(1);
    });
});
