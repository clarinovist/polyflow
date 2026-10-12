// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramAssistantIntegration } from '../TelegramAssistantIntegration';

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

describe('TelegramAssistantIntegration', () => {
    it('shows only an unsupported state for LOCAL accounts', () => {
        render(<TelegramAssistantIntegration authMode="LOCAL" />);
        expect(screen.getByText(/Akun LOCAL belum didukung/)).toBeTruthy();
        expect(
            screen.queryByRole('button', { name: 'Tautkan Telegram' }),
        ).toBeNull();
    });

    it('shows CENTRAL loading then an HTTPS open link with expiry context', async () => {
        let resolveFetch!: (response: Response) => void;
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            () =>
                new Promise<Response>((resolve) => {
                    resolveFetch = resolve;
                }),
        );
        render(<TelegramAssistantIntegration authMode="CENTRAL" />);
        fireEvent.click(screen.getByRole('button', { name: 'Tautkan Telegram' }));
        expect(
            screen
                .getByRole('button', { name: 'Menyiapkan tautan…' })
                .hasAttribute('disabled'),
        ).toBe(true);

        resolveFetch(
            new Response(
                JSON.stringify({
                    token: 'must-not-render',
                    startUrl: 'https://t.me/synthetic_bot?start=opaque',
                    expiresAt: '2026-10-12T00:10:00.000Z',
                }),
                { status: 200, headers: { 'content-type': 'application/json' } },
            ),
        );
        const link = await screen.findByRole('link', {
            name: 'Buka Asisten Telegram',
        });
        expect(link.getAttribute('href')).toBe(
            'https://t.me/synthetic_bot?start=opaque',
        );
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
        expect(screen.getByText(/Tautan sekali pakai aktif hingga/)).toBeTruthy();
        expect(screen.queryByText('must-not-render')).toBeNull();
        expect(globalThis.fetch).toHaveBeenCalledWith(
            '/api/integrations/telegram/link-token',
            expect.objectContaining({ method: 'POST', cache: 'no-store' }),
        );
    });

    it('announces API errors accessibly', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ error: 'Akses ditolak.' }), {
                status: 403,
                headers: { 'content-type': 'application/json' },
            }),
        );
        render(<TelegramAssistantIntegration authMode="CENTRAL" />);
        fireEvent.click(screen.getByRole('button', { name: 'Tautkan Telegram' }));
        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toContain(
                'Akses ditolak.',
            ),
        );
        expect(
            screen.queryByRole('link', { name: 'Buka Asisten Telegram' }),
        ).toBeNull();
    });
});
