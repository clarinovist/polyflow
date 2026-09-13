// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MobileSectionHeader } from '../MobileSectionHeader';

describe('MobileSectionHeader', () => {
    it('uses H2 for subsections by default', () => {
        render(<MobileSectionHeader title="Bagian" />);
        expect(screen.getByRole('heading', { level: 2, name: 'Bagian' })).toBeTruthy();
    });

    it('can own the route H1 without changing its visible title', () => {
        render(<MobileSectionHeader title="Halaman Mobile" level={1} />);
        expect(
            screen.getByRole('heading', { level: 1, name: 'Halaman Mobile' }),
        ).toBeTruthy();
    });
});
