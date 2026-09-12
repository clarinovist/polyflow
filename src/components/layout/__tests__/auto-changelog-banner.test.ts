import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parseLatestRelease } from '../auto-changelog-banner';

const FALLBACK = ['Pembaruan pengalaman Polyflow tersedia.'];

describe('parseLatestRelease', () => {
    it('translates representative entries deterministically and keeps at most three', () => {
        const release = parseLatestRelease(`
# Changelog

## [2.0.0](https://private.example/compare) (2026-09-13)

### Features
* feat(sales): improve customer order search ([abc1234](https://private.example/commit))
* **dashboard:** add clearer daily performance cards ([def5678](https://private.example/commit))
* fix(nav): enable faster access to frequent work
* **products:** add simpler product filters

## [1.9.0] (2026-07-31)
* **customer:** default vehicle dropdown in customer form
`);

        expect(release).toEqual({
            version: '2.0.0',
            summaries: [
                'Pencarian pesanan pelanggan kini lebih mudah.',
                'Kartu kinerja harian kini lebih jelas.',
                'Akses ke pekerjaan yang sering digunakan kini lebih cepat.',
            ],
        });
        expect(JSON.stringify(release)).not.toMatch(
            /private\.example|abc1234|feat|sales:|dashboard:|customer form/i,
        );
    });

    it('localizes representative entries from the actual latest changelog', () => {
        const changelog = fs.readFileSync(
            path.join(process.cwd(), 'CHANGELOG.md'),
            'utf8',
        );
        const release = parseLatestRelease(changelog);

        expect(release).toEqual({
            version: '1.9.0',
            summaries: [
                'Profil menyeluruh pelanggan, pemasok, dan produk gudang kini tersedia.',
                'Pencatatan jurnal tenaga kerja langsung kini lebih sederhana.',
                'Pilihan kendaraan bawaan kini tersedia di formulir pelanggan.',
            ],
        });
    });

    it.each([
        '**access-control:** granular per-sub-fitur permission catalog',
        '**access-control:** granular permissions all portals',
        'fix(settings): plural permissions are now cached',
        '**finance-internal:** tenant migration and deployment topology',
        'fix(api): rotate credential token in server endpoint',
        'chore(db): update Prisma schema',
        '**admin:** global user search across all tenants',
        '**auth:** private login improvements',
    ])('omits unsafe line %s', (line) => {
        const release = parseLatestRelease(`
## [2.1.0] (2026-09-14)
* ${line} ([abcdef1](https://github.example/private/commit))
`);

        expect(release?.summaries).toEqual(FALLBACK);
        expect(JSON.stringify(release)).not.toMatch(
            /permissions?|tenant|migration|deploy|credential|prisma|schema|api|private|admin|auth/i,
        );
    });

    it('omits unknown or partially localizable entries instead of exposing raw text', () => {
        const release = parseLatestRelease(`
## [2.2.0] (2026-09-15)
* **sales:** add enigmatic customer vortex
* improve customer order search
* **dashboard:** add clearer daily performance cards with API telemetry
`);

        expect(release?.summaries).toEqual(FALLBACK);
        expect(JSON.stringify(release)).not.toMatch(
            /enigmatic|customer order search|telemetry|api/i,
        );
    });

    it('does not read safe-looking entries from an older version', () => {
        const release = parseLatestRelease(`
## [2.2.0] (2026-09-15)
* **internal:** private database migration

## [2.1.0] (2026-09-14)
* **products:** add simpler product filters
`);

        expect(release?.summaries).toEqual(FALLBACK);
    });

    it('returns null when no release heading exists', () => {
        expect(parseLatestRelease('# Changelog\n\nBelum ada rilis.')).toBeNull();
    });
});
