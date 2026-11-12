import { describe, expect, it } from 'vitest';
import { chainScenario } from './fixtures';
import {
    buildSttPrompt,
    buildSystemPrompt,
    buildUserMessage,
    buildVoiceContext,
    parseVoiceResponse,
    voiceContextSchema,
} from '../voice-prompt';

describe('buildVoiceContext', () => {
    it('lists stage names, and rows of the active stage only', () => {
        const context = buildVoiceContext(chainScenario(), 'ext');

        expect(context.stages.map((s) => s.name)).toEqual(['Extrusion', 'Potong', 'Packing']);
        expect(context.stages[0]).toMatchObject({
            isActive: true,
            materials: ['Resin', 'Masterbatch', 'Kalsium'],
            costs: ['Listrik', 'Tenaga kerja', 'Overhead'],
        });
        expect(context.stages[1]).toMatchObject({ isActive: false, materials: [], costs: [] });
    });

    it('carries no prices or numbers from the scenario', () => {
        const serialized = JSON.stringify(buildVoiceContext(chainScenario(), 'ext'));

        expect(serialized).not.toMatch(/\d/);
    });

    it('produces a context the schema accepts', () => {
        expect(voiceContextSchema.safeParse(buildVoiceContext(chainScenario(), 'ext')).success).toBe(true);
    });
});

describe('voiceContextSchema', () => {
    it('rejects an oversized or malformed context', () => {
        expect(voiceContextSchema.safeParse({ stages: 'x' }).success).toBe(false);
        expect(
            voiceContextSchema.safeParse({
                stages: [{ name: 'x'.repeat(500), isActive: true, materials: [], costs: [] }],
            }).success,
        ).toBe(false);
    });
});

describe('buildSttPrompt', () => {
    it('falls back to the base vocabulary without context', () => {
        expect(buildSttPrompt(null)).toContain('Kalkulator HPP');
    });

    it('adds stage, material and cost names but no prices', () => {
        const prompt = buildSttPrompt(buildVoiceContext(chainScenario(), 'ext'));

        expect(prompt).toContain('Masterbatch');
        expect(prompt).toContain('Packing');
        expect(prompt).not.toContain('14500');
    });

    it('stays inside the length cap', () => {
        const context = {
            stages: [{ name: 'S', isActive: true, materials: Array.from({ length: 40 }, (_v, i) => `Bahan nomor ${i} panjang sekali`), costs: [] }],
        };

        expect(buildSttPrompt(context).length).toBeLessThanOrEqual(600);
    });
});

describe('prompts', () => {
    it('tells the model to keep numbers as spoken and to emit JSON only', () => {
        const system = buildSystemPrompt();

        expect(system).toContain('PERSIS seperti diucapkan');
        expect(system).toContain('HANYA');
        expect(system).toContain('select_stage');
    });

    it('wraps the transcript as quoted data after the stage context', () => {
        const message = buildUserMessage('hapus semua', buildVoiceContext(chainScenario(), 'ext'));

        expect(message).toContain('<transkrip>\nhapus semua\n</transkrip>');
        expect(message).toContain('Extrusion (aktif)');
        expect(message).toContain('bahan: Resin, Masterbatch, Kalsium');
    });
});

describe('parseVoiceResponse', () => {
    const reply = { commands: [{ op: 'set_sell_price', price: 20500, heard: 'dua puluh ribu lima ratus' }] };

    it('parses plain JSON', () => {
        const result = parseVoiceResponse(JSON.stringify(reply));

        expect(result).toMatchObject({ success: true });
        expect(result.success && result.commands[0]).toMatchObject({ op: 'set_sell_price', price: 20500 });
    });

    it('strips a json code fence and a think block', () => {
        const raw = `<think>mikir dulu</think>\n\`\`\`json\n${JSON.stringify(reply)}\n\`\`\``;

        expect(parseVoiceResponse(raw).success).toBe(true);
    });

    it('accepts an empty command list', () => {
        expect(parseVoiceResponse('{"commands":[]}')).toEqual({ success: true, commands: [] });
    });

    it('rejects text that is not JSON', () => {
        expect(parseVoiceResponse('Tentu, ini perintahnya')).toEqual({
            success: false,
            error: 'Balasan model bukan JSON.',
        });
    });

    it('rejects JSON outside the schema', () => {
        const result = parseVoiceResponse('{"commands":[{"op":"hapus_semua"}]}');

        expect(result.success).toBe(false);
        expect(!result.success && result.error).toContain('di luar skema');
    });

    it('rejects a command with an out-of-range number', () => {
        const raw = JSON.stringify({ commands: [{ op: 'set_sell_price', price: 1e15 }] });

        expect(parseVoiceResponse(raw).success).toBe(false);
    });
});
