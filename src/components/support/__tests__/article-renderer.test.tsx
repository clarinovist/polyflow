// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ArticleBodyRenderer } from '../article-renderer';

describe('ArticleBodyRenderer — tabel GFM', () => {
    it('merender tabel 3 kolom dengan header dan baris body yang benar', () => {
        // Arrange
        const md = [
            '| Field | Wajib | Catatan |',
            '| --- | --- | --- |',
            '| Kode Tahap | Ya | Unik dalam routing |',
            '| Ambil bahan dari | Tidak | Ikut tahap sebelumnya |',
        ].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        expect(container.querySelectorAll('table')).toHaveLength(1);
        expect(container.querySelectorAll('thead th')).toHaveLength(3);
        expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
        expect(screen.getByText('Kode Tahap')).toBeDefined();
        expect(screen.getByText('Ikut tahap sebelumnya')).toBeDefined();
    });

    it('menerima pemisah dengan alignment colon', () => {
        // Arrange
        const md = [
            '| Kode | Arti |',
            '| :--- | ---: |',
            '| A | Satu |',
        ].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        expect(container.querySelectorAll('table')).toHaveLength(1);
        expect(container.querySelectorAll('tbody td')).toHaveLength(2);
    });

    it('baris tanpa pipe pembuka tidak dianggap tabel', () => {
        // Arrange — sengaja konservatif: prosa yang memuat "|" tidak boleh
        // berubah jadi tabel hanya karena baris di bawahnya mirip pemisah
        const md = ['Kode | Arti', ':--- | ---:', 'A | Satu'].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        expect(container.querySelectorAll('table')).toHaveLength(0);
    });

    it('memformat bold dan inline code di dalam sel', () => {
        // Arrange
        const md = [
            '| Field | Nilai |',
            '| --- | --- |',
            '| **Wajib** | `ROUTE_WIP_NOT_READY` |',
        ].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        expect(container.querySelector('tbody strong')?.textContent).toBe(
            'Wajib',
        );
        expect(container.querySelector('tbody code')?.textContent).toBe(
            'ROUTE_WIP_NOT_READY',
        );
    });

    it('paragraf yang memuat pipe tanpa baris pemisah tetap paragraf', () => {
        // Arrange — prosa yang kebetulan punya "|" tidak boleh jadi tabel
        const md = '| ini bukan tabel | cuma teks berpipa |';

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        expect(container.querySelectorAll('table')).toHaveLength(0);
        expect(container.querySelectorAll('p')).toHaveLength(1);
    });

    it('baris dengan sel lebih sedikit dari header tidak bikin crash', () => {
        // Arrange
        const md = [
            '| A | B | C |',
            '| --- | --- | --- |',
            '| cuma satu |',
        ].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert — kolom tetap 3, sel kurang diisi kosong
        expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
        expect(container.querySelectorAll('tbody td')).toHaveLength(3);
        expect(screen.getByText('cuma satu')).toBeDefined();
    });

    it('sel berlebih dibuang supaya grid kolom tidak rusak', () => {
        // Arrange
        const md = [
            '| A | B |',
            '| --- | --- |',
            '| satu | dua | tiga |',
        ].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        expect(container.querySelectorAll('tbody td')).toHaveLength(2);
        expect(screen.queryByText('tiga')).toBeNull();
    });

    it('membungkus tabel dalam wadah yang bisa di-scroll horizontal', () => {
        // Arrange
        const md = ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert — tabel lebar tidak boleh mendorong seluruh halaman
        const wrapper = container.querySelector('table')?.parentElement;
        expect(wrapper?.className).toContain('overflow-x-auto');
    });
});

describe('ArticleBodyRenderer — seksi ### menampung isinya', () => {
    it('paragraf dan list setelah ### berada DI DALAM details', () => {
        // Arrange
        const md = [
            '### Catatan penting',
            '',
            'Paragraf di dalam seksi.',
            '',
            '- butir satu',
            '- butir dua',
        ].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        const details = container.querySelector('details');
        expect(details).not.toBeNull();
        expect(details?.querySelector('p')?.textContent).toBe(
            'Paragraf di dalam seksi.',
        );
        expect(details?.querySelectorAll('ul li')).toHaveLength(2);
        // Tidak ada konten yang bocor keluar sebagai saudara details
        expect(container.querySelectorAll(':scope > p')).toHaveLength(0);
    });

    it('details terbuka secara default supaya panduan tetap terbaca', () => {
        // Arrange
        const md = ['### Judul', '', 'Isi.'].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        expect(container.querySelector('details')?.hasAttribute('open')).toBe(
            true,
        );
    });

    it('## mengakhiri seksi ### sebelumnya', () => {
        // Arrange
        const md = [
            '### Seksi A',
            '',
            'Isi A.',
            '',
            '## Bab Baru',
            '',
            'Isi bab.',
        ].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        const details = container.querySelector('details');
        expect(details?.textContent).toContain('Isi A.');
        expect(details?.textContent).not.toContain('Isi bab.');
        expect(container.querySelector('h2')?.textContent).toBe('Bab Baru');
    });

    it('### berikutnya mengakhiri seksi sebelumnya', () => {
        // Arrange
        const md = ['### A', '', 'Isi A.', '', '### B', '', 'Isi B.'].join(
            '\n',
        );

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        const all = container.querySelectorAll('details');
        expect(all).toHaveLength(2);
        expect(all[0].textContent).toContain('Isi A.');
        expect(all[0].textContent).not.toContain('Isi B.');
        expect(all[1].textContent).toContain('Isi B.');
    });

    it('tabel di dalam seksi ### ikut masuk ke dalam details', () => {
        // Arrange
        const md = [
            '### Tabel dalam seksi',
            '',
            '| A | B |',
            '| --- | --- |',
            '| 1 | 2 |',
        ].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        expect(container.querySelector('details table')).not.toBeNull();
    });
});

describe('ArticleBodyRenderer — regresi format lama', () => {
    it('code block, blockquote, dan list terurut masih jalan', () => {
        // Arrange
        const md = [
            '```',
            'npm run build',
            '```',
            '',
            '> Perhatian penting.',
            '',
            '1. langkah satu',
            '2. langkah dua',
        ].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        expect(container.querySelector('pre code')?.textContent).toBe(
            'npm run build',
        );
        expect(container.querySelector('blockquote')?.textContent).toBe(
            'Perhatian penting.',
        );
        expect(container.querySelectorAll('ol li')).toHaveLength(2);
    });

    it('heading ## dan tautan internal /support tetap dirender', () => {
        // Arrange
        const md = ['## Bab', '', 'Lihat /support/panduan-lain ya.'].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        expect(container.querySelector('h2')?.textContent).toBe('Bab');
        expect(container.querySelector('a')?.getAttribute('href')).toBe(
            '/support/panduan-lain',
        );
    });

    it('<h2> dapat id hasil slugify supaya anchor TOC bisa scroll ke situ', () => {
        // Arrange
        const md = ['## Cara Konfirmasi SO', '', 'Isi bab.'].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        expect(container.querySelector('h2')?.id).toBe(
            'cara-konfirmasi-so',
        );
    });

    it('dua heading ## dengan teks sama dapat id unik (suffix -2)', () => {
        // Arrange
        const md = [
            '## Catatan',
            '',
            'Isi pertama.',
            '',
            '## Catatan',
            '',
            'Isi kedua.',
        ].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        const headings = container.querySelectorAll('h2');
        expect(headings[0].id).toBe('catatan');
        expect(headings[1].id).toBe('catatan-2');
    });

    it('--- jadi garis horizontal, bukan paragraf berisi "---"', () => {
        // Arrange
        const md = ['Bab satu.', '', '---', '', 'Bab dua.'].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        expect(container.querySelectorAll('hr')).toHaveLength(1);
        expect(container.textContent).not.toContain('---');
    });

    it('pemisah tabel tidak ikut tertangkap sebagai garis horizontal', () => {
        // Arrange
        const md = ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n');

        // Act
        const { container } = render(<ArticleBodyRenderer bodyMd={md} />);

        // Assert
        expect(container.querySelectorAll('hr')).toHaveLength(0);
        expect(container.querySelectorAll('table')).toHaveLength(1);
    });

    it('body kosong tidak bikin crash', () => {
        // Arrange / Act
        const { container } = render(<ArticleBodyRenderer bodyMd="" />);

        // Assert
        expect(container.textContent).toBe('');
    });
});
