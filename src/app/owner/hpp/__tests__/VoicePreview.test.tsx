// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoicePreview } from '../VoicePreview';

afterEach(cleanup);

describe('VoicePreview', () => {
    it('lists each change with what was heard and applies on request', () => {
        const onApply = vi.fn();
        render(
            <VoicePreview
                lines={[{ text: '+ Bahan Benang 120 KG', heard: 'benang seratus dua puluh' }]}
                warnings={[]}
                onApply={onApply}
                onDiscard={vi.fn()}
            />,
        );

        expect(screen.getByText('+ Bahan Benang 120 KG')).toBeTruthy();
        expect(screen.getByText(/benang seratus dua puluh/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Terapkan/ }));
        expect(onApply).toHaveBeenCalledTimes(1);
    });

    it('shows warnings and omits the heard line when there is none', () => {
        render(
            <VoicePreview
                lines={[{ text: 'Harga jual Rp 1', heard: '' }]}
                warnings={['Bahan "X" tidak ditemukan, perintah dilewati.']}
                onApply={vi.fn()}
                onDiscard={vi.fn()}
            />,
        );

        expect(screen.getByRole('list', { name: 'Peringatan' }).textContent).toContain('tidak ditemukan');
        expect(screen.queryByText(/Terdengar/)).toBeNull();
    });

    it('disables Terapkan when nothing can change and still allows discarding', () => {
        const onDiscard = vi.fn();
        render(<VoicePreview lines={[]} warnings={['x']} onApply={vi.fn()} onDiscard={onDiscard} />);

        expect((screen.getByRole('button', { name: /Terapkan/ }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText('Tidak ada perubahan yang bisa diterapkan.')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
        expect(onDiscard).toHaveBeenCalledTimes(1);
    });
});
