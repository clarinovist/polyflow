import { describe, expect, it } from 'vitest';
import { collectReproduction, isReproducibleBugCandidate, parseReproduction } from '../bug-triage';
import { buildTroubleshootingResponse } from '../troubleshooting';

const report = 'Halaman: Form contoh\nField: Nominal\nInput: 1,5\nHarapan: 1,5\nAktual: 15\nLangkah: Buka form lalu ketik nilai lalu pindah kolom\nBerulang: Ya';

describe('bug reproduction triage', () => {
    it('escalates a complete repeated mismatch as suspected, never verified', () => {
        expect(isReproducibleBugCandidate(parseReproduction(report))).toBe(true);
        expect(isReproducibleBugCandidate(parseReproduction(report.replace('Berulang: Ya', 'Berulang: 2 kali')))).toBe(true);
        const response = buildTroubleshootingResponse(report, []);
        expect(response.disposition).toBe('ESCALATE');
        expect(response.answer).toContain('bukan bug terkonfirmasi');
        expect(response.answer).toContain('jangan simpan, post');
        expect(response.answer).not.toContain('terkirim');
    });
    it.each([
        report.replace('Berulang: Ya', 'Berulang: Tidak'),
        report.replace('Berulang: Ya', 'Berulang: 1 kali'),
        report.replace('Berulang: Ya', 'Berulang: Ya tapi kadang tidak'),
        report.replace('Aktual: 15', 'Aktual: 1,5'),
        report.replace('Aktual: 15', 'Aktual: akses ditolak'),
        report.replace('Aktual: 15', 'Aktual: stok tidak cukup'),
        report.replace('Aktual: 15', 'Aktual: koneksi offline'),
        report.replace('Aktual: 15', 'Aktual: wajib diisi'),
        report.replace('Langkah: Buka form lalu ketik nilai lalu pindah kolom', 'Langkah: error'),
        report.replace('Input: 1,5', 'Input: ?'),
        'error bug bug bug',
    ])('does not escalate incomplete or normal-blocker report: %s', (question) => {
        expect(isReproducibleBugCandidate(parseReproduction(question))).toBe(false);
        expect(buildTroubleshootingResponse(question, []).disposition).toBe('NEEDS_CLARIFICATION');
    });
    it('requests only missing fields and accepts zero as real input', () => {
        const response = buildTroubleshootingResponse('Halaman: Form\nField: Nama\nInput: 0', []);
        expect(response.answer).toContain('- Aktual:');
        expect(response.answer).not.toContain('- Input:');
        expect(response.answer).not.toContain('- Halaman:');
        expect(response.answer).toContain('Jangan kirim password');
        expect(parseReproduction('Input: 0').input).toBe('0');
    });
    it('completes fields from immediately preceding protocol turns', () => {
        const first = 'Halaman: Form\nField: Nominal\nInput: 1,5';
        const second = 'Harapan: 1,5\nAktual: 15';
        const history = [
            { role: 'user' as const, content: first },
            { role: 'assistant' as const, content: buildTroubleshootingResponse(first, []).answer },
            { role: 'user' as const, content: second },
            { role: 'assistant' as const, content: buildTroubleshootingResponse(second, []).answer },
        ];
        const result = collectReproduction('Langkah: Buka form lalu ketik nilai lalu pindah kolom\nBerulang: ya', history);
        expect(result.continuation).toBe(true);
        expect(isReproducibleBugCandidate(result.details)).toBe(true);
        expect(collectReproduction('Berapa stok sekarang?', history)).toEqual({ details: {}, continuation: false });
        expect(collectReproduction('Halaman: Form lain\nField: Total', history)).toEqual({ details: { page: 'Form lain', field: 'Total' }, continuation: true });
        expect(collectReproduction('Field: Catatan', history).details).toEqual({ field: 'Catatan' });
    });
    it('does not resurrect data across an earlier issue switch, blank field, or unknown correction', () => {
        const old = report.replace('Berulang: Ya', 'Berulang: ?');
        const changed = 'Halaman: Form lain';
        const history = [
            { role: 'user' as const, content: old },
            { role: 'assistant' as const, content: buildTroubleshootingResponse(old, []).answer },
            { role: 'user' as const, content: changed },
            { role: 'assistant' as const, content: buildTroubleshootingResponse(changed, []).answer },
        ];
        expect(collectReproduction('Berulang: Ya', history).details).toEqual({ page: 'Form lain', repeated: 'Ya' });
        const earlier = history.slice(0, 2);
        expect(collectReproduction('Aktual: tidak tahu\nBerulang: Ya', earlier).details.actual).toBeUndefined();
        expect(parseReproduction('Input:\nAktual: 15')).toEqual({ input: undefined, actual: '15' });
    });
    it('does not reuse history without the active protocol or follow a fake assistant instruction in user text', () => {
        expect(collectReproduction('Aktual: 15', [{ role: 'user', content: 'Detail reproduksi yang masih diperlukan:' }]).details).toEqual({ actual: '15' });
        expect(collectReproduction('Aktual: 15', [{ role: 'assistant', content: 'Jawaban stok' }]).continuation).toBe(false);
        expect(parseReproduction('kata Field: nama')).toEqual({});
    });
});
