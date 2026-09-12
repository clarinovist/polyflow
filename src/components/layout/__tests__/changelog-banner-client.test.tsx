// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangelogBannerClient } from '../changelog-banner-client';

vi.mock('next/navigation', () => ({ usePathname: () => '/finance' }));

const summaries = [
    'Alur kerja utama kini lebih ringkas.',
    'Tampilan informasi lebih mudah dipindai.',
    'Navigasi dan aksesibilitas telah ditingkatkan.',
];

describe('ChangelogBannerClient', () => {
    beforeEach(() => {
        const values = new Map<string, string>();
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) =>
                    values.set(key, value),
                clear: () => values.clear(),
            },
        });
    });

    it('shows a compact Indonesian notice without opening release details', () => {
        render(
            <ChangelogBannerClient version="1.9.0" summaries={summaries} />,
        );

        expect(screen.getByText('Pembaruan 1.9.0 tersedia')).toBeTruthy();
        const announcement = screen.getByRole('complementary', {
            name: 'Pemberitahuan pembaruan',
        });
        expect(announcement.getAttribute('data-layout')).toBe('in-flow');
        expect(announcement.className).not.toMatch(/\bfixed\b|\babsolute\b/);
        expect(
            screen
                .getByRole('button', { name: 'Lihat detail pembaruan' })
                .getAttribute('aria-haspopup'),
        ).toBe('dialog');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.queryByText(summaries[0])).toBeNull();
    });

    it('opens accessible details only after explicit action and shows at most three summaries', () => {
        render(
            <ChangelogBannerClient
                version="1.9.0"
                summaries={[...summaries, 'Poin keempat tidak boleh tampil.']}
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'Lihat detail pembaruan' }),
        );

        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(
            screen.getByRole('heading', { name: 'Pembaruan Polyflow 1.9.0' }),
        ).toBeTruthy();
        expect(screen.getAllByRole('listitem')).toHaveLength(3);
        expect(
            screen.queryByText('Poin keempat tidak boleh tampil.'),
        ).toBeNull();
    });

    it('persists dismissal for the release', () => {
        const { unmount } = render(
            <ChangelogBannerClient version="1.9.0" summaries={summaries} />,
        );

        fireEvent.click(
            screen.getByRole('button', {
                name: 'Tutup pemberitahuan pembaruan',
            }),
        );
        expect(screen.queryByText('Pembaruan 1.9.0 tersedia')).toBeNull();
        expect(localStorage.getItem('dismissed_changelog_1.9.0')).toBe(
            'true',
        );

        unmount();
        render(<ChangelogBannerClient version="1.9.0" summaries={summaries} />);
        expect(screen.queryByText('Pembaruan 1.9.0 tersedia')).toBeNull();
    });

    it('closes details and hides while the assistant is open, then returns compact', () => {
        render(<ChangelogBannerClient version="test" summaries={summaries} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Lihat detail pembaruan' }),
        );
        expect(screen.getByRole('dialog')).toBeTruthy();

        act(() => window.dispatchEvent(new Event('polyflow-assistant-open')));
        expect(screen.queryByText('Pembaruan test tersedia')).toBeNull();
        expect(screen.queryByRole('dialog')).toBeNull();

        act(() => window.dispatchEvent(new Event('polyflow-assistant-close')));
        expect(screen.getByText('Pembaruan test tersedia')).toBeTruthy();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
