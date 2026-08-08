import { describe, it, expect } from 'vitest';
import {
    slugifyHeading,
    createHeadingIdSequencer,
    extractHeadings,
} from '../toc';

describe('slugifyHeading', () => {
    it('mengubah teks jadi lowercase dash-joined', () => {
        // Arrange
        const text = 'Cara Konfirmasi Sales Order';

        // Act
        const slug = slugifyHeading(text);

        // Assert
        expect(slug).toBe('cara-konfirmasi-sales-order');
    });

    it('menghapus aksen/diakritik', () => {
        // Arrange
        const text = 'Café Menu Édition';

        // Act
        const slug = slugifyHeading(text);

        // Assert
        expect(slug).toBe('cafe-menu-edition');
    });

    it('mengganti karakter non-alfanumerik jadi satu dash dan trim ujung', () => {
        // Arrange
        const text = '  Error: "Stok Kurang" (SO#123)!!  ';

        // Act
        const slug = slugifyHeading(text);

        // Assert
        expect(slug).toBe('error-stok-kurang-so-123');
    });

    it('mengumpulkan beberapa non-alnum berurutan jadi satu dash', () => {
        // Arrange
        const text = 'Stok   &&&   Gudang';

        // Act
        const slug = slugifyHeading(text);

        // Assert
        expect(slug).toBe('stok-gudang');
    });
});

describe('createHeadingIdSequencer', () => {
    it('memberi id sama untuk teks berbeda', () => {
        // Arrange
        const nextId = createHeadingIdSequencer();

        // Act
        const first = nextId('Ringkasan');
        const second = nextId('Langkah-Langkah');

        // Assert
        expect(first).toBe('ringkasan');
        expect(second).toBe('langkah-langkah');
    });

    it('menambahkan suffix -2, -3 untuk heading duplikat berurutan', () => {
        // Arrange
        const nextId = createHeadingIdSequencer();

        // Act
        const a = nextId('Catatan');
        const b = nextId('Catatan');
        const c = nextId('Catatan');

        // Assert
        expect([a, b, c]).toEqual(['catatan', 'catatan-2', 'catatan-3']);
    });
});

describe('extractHeadings', () => {
    it('mengambil semua heading ## sesuai urutan dokumen', () => {
        // Arrange
        const bodyMd = [
            '## Ringkasan',
            '',
            'Isi ringkasan.',
            '',
            '## Langkah-langkah',
            '',
            '1. Buka menu',
        ].join('\n');

        // Act
        const headings = extractHeadings(bodyMd);

        // Assert
        expect(headings).toEqual([
            { id: 'ringkasan', text: 'Ringkasan' },
            { id: 'langkah-langkah', text: 'Langkah-langkah' },
        ]);
    });

    it('heading duplikat dalam satu dokumen dapat id unik dengan suffix', () => {
        // Arrange
        const bodyMd = [
            '## Catatan',
            '',
            'Isi pertama.',
            '',
            '## Catatan',
            '',
            'Isi kedua.',
        ].join('\n');

        // Act
        const headings = extractHeadings(bodyMd);

        // Assert
        expect(headings).toEqual([
            { id: 'catatan', text: 'Catatan' },
            { id: 'catatan-2', text: 'Catatan' },
        ]);
    });

    it('mengabaikan baris non-heading termasuk ### dan teks biasa', () => {
        // Arrange
        const bodyMd = [
            '### Bukan H2',
            'Paragraf biasa.',
            '- list item',
            '## Heading Asli',
            'teks lain',
        ].join('\n');

        // Act
        const headings = extractHeadings(bodyMd);

        // Assert
        expect(headings).toEqual([{ id: 'heading-asli', text: 'Heading Asli' }]);
    });

    it('body kosong menghasilkan array kosong', () => {
        // Arrange / Act
        const headings = extractHeadings('');

        // Assert
        expect(headings).toEqual([]);
    });

    it('body tanpa heading ## menghasilkan array kosong', () => {
        // Arrange
        const bodyMd = ['Paragraf satu.', '', 'Paragraf dua.'].join('\n');

        // Act
        const headings = extractHeadings(bodyMd);

        // Assert
        expect(headings).toEqual([]);
    });

    it('mengabaikan baris ## di dalam code block, sama seperti ArticleBodyRenderer', () => {
        // Arrange — renderer tidak pernah merender "## " di dalam ``` sebagai
        // <h2>, jadi extractHeadings juga tidak boleh, atau TOC akan berisi
        // anchor mati yang tidak ada elemen-nya di halaman.
        const bodyMd = [
            '## Heading Asli',
            '```',
            '## Bukan heading, ini di dalam code block',
            '```',
            '## Heading Kedua',
        ].join('\n');

        // Act
        const headings = extractHeadings(bodyMd);

        // Assert
        expect(headings).toEqual([
            { id: 'heading-asli', text: 'Heading Asli' },
            { id: 'heading-kedua', text: 'Heading Kedua' },
        ]);
    });
});
