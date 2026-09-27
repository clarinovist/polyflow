import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { workflowGuides } from '../knowledge/workflow-guides';
import { guideFingerprint, previewGuides, publishGuides } from '../../../../scripts/publish-assistant-guides.mjs';

describe('reviewed public workflow guide manifest', () => {
    it('has unique slugs, bounded complete content and verified source paths', () => {
        expect(new Set(workflowGuides.map(g => g.slug)).size).toBe(4);
        for (const guide of workflowGuides) {
            expect(guide.bodyMd.length).toBeLessThanOrEqual(6000);
            expect(guide.bodyMd.length).toBeGreaterThan(500);
            for (const path of guide.sourcePaths) expect(existsSync(path)).toBe(true);
        }
    });
    it('documents exact UI controls and does not imply credit posting receives stock', () => {
        expect(workflowGuides[0].bodyMd).toContain('Ya, Tutup PO');
        expect(workflowGuides[1].bodyMd).toContain('DRAFT');
        expect(workflowGuides[2].bodyMd).toContain('langkah kredit ini tidak menambah stok');
        expect(workflowGuides[3].bodyMd).toContain('Periksa potongan');
        expect(workflowGuides[3].bodyMd).toContain('Simpan retur & potong tagihan');
    });
    it('validates publication manifest and backup before touching the database', async () => {
        await expect(previewGuides({}, [])).rejects.toThrow('reviewed guide set');
        await expect(previewGuides({}, workflowGuides.map(g => ({ ...g, bodyMd: '' })))).rejects.toThrow('Invalid guide');
        await expect(publishGuides({}, workflowGuides, { manifest: 'wrong' }, 'actor')).rejects.toThrow('mismatch');
        expect(guideFingerprint(workflowGuides)).toMatch(/^[a-f0-9]{64}$/);
    });
});
