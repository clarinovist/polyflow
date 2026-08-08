// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DocsToc } from '../docs-toc';

describe('DocsToc', () => {
    it('tidak merender apa pun kalau heading <= 1', () => {
        // Arrange / Act
        const { container: empty } = render(<DocsToc headings={[]} />);
        const { container: single } = render(
            <DocsToc headings={[{ id: 'satu', text: 'Satu' }]} />,
        );

        // Assert
        expect(empty.textContent).toBe('');
        expect(single.textContent).toBe('');
    });

    it('merender daftar anchor link ke tiap heading saat >= 2 heading', () => {
        // Arrange
        const headings = [
            { id: 'ringkasan', text: 'Ringkasan' },
            { id: 'langkah-langkah', text: 'Langkah-langkah' },
        ];

        // Act
        render(<DocsToc headings={headings} />);

        // Assert
        const linkRingkasan = screen.getByRole('link', { name: 'Ringkasan' });
        const linkLangkah = screen.getByRole('link', {
            name: 'Langkah-langkah',
        });
        expect(linkRingkasan.getAttribute('href')).toBe('#ringkasan');
        expect(linkLangkah.getAttribute('href')).toBe('#langkah-langkah');
    });
});
