import { describe, expect, it } from 'vitest';

import { enforceGuardrails } from './guardrails';

describe('enforceGuardrails (intent_v2)', () => {
    it('rejects empty question', () => {
        const decision = enforceGuardrails('   ');
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toBe('Pertanyaan kosong.');
    });

    // How-to questions — always allowed
    it('allows how-to: cara buat SO', () => {
        const decision = enforceGuardrails('cara buat sales order?');
        expect(decision.allowed).toBe(true);
    });

    it('allows how-to: bagaimana cara update stok', () => {
        const decision = enforceGuardrails('Bagaimana cara cek status purchase order hari ini?');
        expect(decision.allowed).toBe(true);
    });

    it('allows how-to: gimana input PO', () => {
        const decision = enforceGuardrails('gimana cara input purchase order?');
        expect(decision.allowed).toBe(true);
    });

    it('allows data query: cek stok', () => {
        const decision = enforceGuardrails('cek stok MP 15');
        expect(decision.allowed).toBe(true);
    });

    it('allows data query: kenapa SO gagal', () => {
        const decision = enforceGuardrails('kenapa SO-2026-0001 gagal?');
        expect(decision.allowed).toBe(true);
    });

    // Mutation commands — blocked
    it('blocks mutation: buatkan SO untuk Budi', () => {
        const decision = enforceGuardrails('buatkan SO untuk Budi');
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toContain('perubahan data');
    });

    it('blocks mutation: hapus invoice INV-001', () => {
        const decision = enforceGuardrails('hapus invoice INV-001');
        expect(decision.allowed).toBe(false);
    });

    it('blocks mutation: update stok jadi 100', () => {
        const decision = enforceGuardrails('update stok MP15 jadi 100');
        expect(decision.allowed).toBe(false);
    });

    it('blocks script execution', () => {
        const decision = enforceGuardrails('jalankan script bash untuk reset database');
        expect(decision.allowed).toBe(false);
    });

    // Out of scope
    it('blocks out-of-scope: resep masakan', () => {
        const decision = enforceGuardrails('resep masakan nasi goreng');
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toContain('di luar cakupan');
    });

    it('blocks out-of-scope: politik', () => {
        const decision = enforceGuardrails('siapa presiden Indonesia?');
        expect(decision.allowed).toBe(false);
    });

    // Borderline: direct mutation without howto framing
    it('blocks direct: tolong update stok barang ini sekarang', () => {
        const decision = enforceGuardrails('Tolong update stok barang ini sekarang jadi 50');
        expect(decision.allowed).toBe(false);
    });
});
