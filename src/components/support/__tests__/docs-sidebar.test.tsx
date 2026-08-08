// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocsSidebar } from '../docs-sidebar';
import type { NavArticleItem } from '@/lib/bot/help-articles';

const { mockUsePathname } = vi.hoisted(() => ({
    mockUsePathname: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    usePathname: () => mockUsePathname(),
}));

const items: NavArticleItem[] = [
    {
        slug: 'artikel-sales',
        title: 'Artikel Sales',
        modules: ['sales'],
        tags: [],
        errorCodes: [],
    },
    {
        slug: 'artikel-global',
        title: 'Artikel Global',
        modules: [],
        tags: [],
        errorCodes: [],
    },
    {
        slug: 'artikel-trouble-tag',
        title: 'Artikel Trouble Tag',
        modules: ['warehouse'],
        tags: ['troubleshoot'],
        errorCodes: [],
    },
    {
        slug: 'artikel-trouble-errcode',
        title: 'Artikel Trouble ErrCode',
        modules: ['finance'],
        tags: [],
        errorCodes: ['ERR_STOK_KURANG'],
    },
];

describe('DocsSidebar', () => {
    beforeEach(() => {
        mockUsePathname.mockReset();
    });

    it('menampilkan semua artikel dan grup sesuai MODULE_FILTERS di tab Panduan', () => {
        // Arrange
        mockUsePathname.mockReturnValue('/support');

        // Act
        render(<DocsSidebar items={items} />);

        // Assert — semua artikel muncul (termasuk yang bukan troubleshoot)
        expect(screen.getByText('Artikel Sales')).toBeDefined();
        expect(screen.getByText('Artikel Global')).toBeDefined();
        expect(screen.getByText('Artikel Trouble Tag')).toBeDefined();
        expect(screen.getByText('Artikel Trouble ErrCode')).toBeDefined();

        // Grup header urut: Umum (global) sebelum Penjualan (sales)
        const headers = screen
            .getAllByRole('heading', { level: 3 })
            .map((h) => h.textContent);
        expect(headers.indexOf('Umum')).toBeLessThan(headers.indexOf('Penjualan'));
    });

    it('tab Panduan aktif ditandai aria-current saat pathname /support', () => {
        // Arrange
        mockUsePathname.mockReturnValue('/support');

        // Act
        render(<DocsSidebar items={items} />);

        // Assert
        expect(
            screen.getByRole('link', { name: /Panduan/ }).getAttribute(
                'aria-current',
            ),
        ).toBe('page');
        expect(
            screen
                .getByRole('link', { name: /Troubleshooting/ })
                .getAttribute('aria-current'),
        ).toBeNull();
    });

    it('tab Troubleshooting hanya menampilkan artikel bertag troubleshoot atau punya errorCodes', () => {
        // Arrange
        mockUsePathname.mockReturnValue('/support/troubleshooting');

        // Act
        render(<DocsSidebar items={items} />);

        // Assert
        expect(screen.getByText('Artikel Trouble Tag')).toBeDefined();
        expect(screen.getByText('Artikel Trouble ErrCode')).toBeDefined();
        expect(screen.queryByText('Artikel Sales')).toBeNull();
        expect(screen.queryByText('Artikel Global')).toBeNull();
    });

    it('leaf link aktif dapat aria-current=page saat pathname cocok dengan slug', () => {
        // Arrange
        mockUsePathname.mockReturnValue('/support/artikel-sales');

        // Act
        render(<DocsSidebar items={items} />);

        // Assert
        expect(
            screen
                .getByRole('link', { name: 'Artikel Sales' })
                .getAttribute('aria-current'),
        ).toBe('page');
        expect(
            screen
                .getByRole('link', { name: 'Artikel Global' })
                .getAttribute('aria-current'),
        ).toBeNull();
    });

    it('toggle mobile membuka overlay dan tombol close menutupnya', () => {
        // Arrange
        mockUsePathname.mockReturnValue('/support');
        render(<DocsSidebar items={items} />);
        expect(screen.queryByText('Navigasi Dokumentasi')).toBeNull();

        // Act — buka
        fireEvent.click(
            screen.getByRole('button', { name: 'Buka navigasi dokumentasi' }),
        );

        // Assert — overlay terbuka
        expect(screen.getByText('Navigasi Dokumentasi')).toBeDefined();

        // Act — tutup
        fireEvent.click(
            screen.getByRole('button', { name: 'Tutup navigasi' }),
        );

        // Assert — overlay tertutup lagi
        expect(screen.queryByText('Navigasi Dokumentasi')).toBeNull();
    });
});
