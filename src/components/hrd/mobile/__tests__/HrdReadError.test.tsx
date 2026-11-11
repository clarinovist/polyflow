// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HrdReadError } from '../HrdReadError';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe('HrdReadError', () => {
    it('forwards the specific message and offers retry', () => {
        render(<HrdReadError title="Rekap belum tersedia" message="Filter status absensi tidak valid." />);
        expect(screen.getByText('Filter status absensi tidak valid.')).toBeTruthy();
        expect(screen.getByRole('button', { name: /coba lagi/i })).toBeTruthy();
    });
});
