// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SkipToMainContent } from '../skip-to-main-content';

describe('SkipToMainContent', () => {
    it('is the first focusable control and focuses its single main target', () => {
        render(
            <>
                <SkipToMainContent />
                <button type="button">Buka navigasi</button>
                <main id="main-content" tabIndex={-1}>
                    Konten utama
                </main>
            </>,
        );

        const link = screen.getByRole('link', {
            name: 'Lewati ke konten utama',
        });
        const focusableControls = document.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );

        expect(focusableControls[0]).toBe(link);
        expect(link.getAttribute('href')).toBe('#main-content');
        expect(document.querySelectorAll('#main-content')).toHaveLength(1);

        fireEvent.click(link);
        expect(document.activeElement).toBe(screen.getByRole('main'));
    });
});
