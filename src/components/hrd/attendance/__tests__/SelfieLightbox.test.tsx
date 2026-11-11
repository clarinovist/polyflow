// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { SelfieLightbox } from '../SelfieLightbox';

describe('SelfieLightbox', () => {
    it('renders nothing while there is no preview', () => {
        render(<SelfieLightbox preview={null} onClose={vi.fn()} />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('shows the title and image of the preview', () => {
        render(
            <SelfieLightbox
                preview={{ url: '/api/images/acme/a.jpg', title: 'Budi Contoh — Masuk' }}
                onClose={vi.fn()}
            />,
        );
        expect(screen.getByText('Budi Contoh — Masuk')).toBeTruthy();
        const img = screen.getByRole('img') as HTMLImageElement;
        expect(img.getAttribute('src')).toBe('/api/images/acme/a.jpg');
        expect(img.getAttribute('alt')).toBe('Budi Contoh — Masuk');
    });

    it('calls onClose when dismissed', async () => {
        const onClose = vi.fn();
        render(<SelfieLightbox preview={{ url: '/a.jpg', title: 'T' }} onClose={onClose} />);
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });
});
