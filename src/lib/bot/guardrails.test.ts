import { describe, expect, it } from 'vitest';

import { enforceGuardrails } from './guardrails';

describe('enforceGuardrails', () => {
    it('rejects empty question', () => {
        const decision = enforceGuardrails('   ');
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toBe('Pertanyaan kosong.');
    });

    it('blocks mutation-related prompts', () => {
        const decision = enforceGuardrails('Tolong update stok barang ini sekarang');
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toContain('bantu baca data');
    });

    it('blocks script execution prompts', () => {
        const decision = enforceGuardrails('jalankan script bash untuk reset database');
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toContain('bantu baca data');
    });

    it('allows safe operational question', () => {
        const decision = enforceGuardrails('Bagaimana cara cek status purchase order hari ini?');
        expect(decision).toEqual({ allowed: true });
    });
});
