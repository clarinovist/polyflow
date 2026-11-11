// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Employee360ProductionTab labels', () => {
    it('has no raw English "Rate Missing" label', () => {
        const src = readFileSync(
            join(__dirname, '../Employee360ProductionTab.tsx'),
            'utf8',
        );
        expect(src).not.toContain('Rate Missing');
        expect(src).toContain('Tarif belum diatur');
    });
});
