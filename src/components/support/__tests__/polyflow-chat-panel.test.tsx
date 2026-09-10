// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PolyflowChatPanel } from '../polyflow-chat-panel';

vi.mock('next/link', () => ({
    default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props}>{children}</a>
    ),
}));

vi.mock('@/components/ui/button', () => ({
    Button: ({
        children,
        asChild,
        ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
        asChild ? children : <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/textarea', () => ({
    Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
        <textarea {...props} />
    ),
}));

function emptyStreamResponse() {
    return {
        ok: false,
        status: 500,
        body: null,
        json: async () => ({ error: 'stream unavailable' }),
    } as unknown as Response;
}

describe('PolyflowChatPanel contextual profiles', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        Element.prototype.scrollIntoView = vi.fn();
    });

    it('shows Finance identity and sends the same context to SSE and JSON fallback', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(emptyStreamResponse())
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    data: {
                        answer: 'Invoice sudah diperiksa.',
                        safety: { allowed: true },
                    },
                }),
            } as Response);

        render(
            <PolyflowChatPanel
                currentPath="/finance/invoices/sales/inv-1"
                contextualProfilesEnabled
            />,
        );

        expect(screen.getAllByText(/Asisten accountant read-only/i).length).toBeGreaterThan(0);
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Periksa invoice yang sedang saya buka',
            }),
        );

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        for (const call of fetchMock.mock.calls) {
            const body = JSON.parse(String(call[1]?.body));
            expect(body.workContext).toEqual({
                pathname: '/finance/invoices/sales/inv-1',
            });
        }
        expect(await screen.findByText('Invoice sudah diperiksa.')).toBeTruthy();
    });

    it('switches thread and context when navigation changes', async () => {
        const { rerender } = render(
            <PolyflowChatPanel
                currentPath="/finance/invoices/sales/inv-1"
                contextualProfilesEnabled
            />,
        );

        rerender(
            <PolyflowChatPanel
                currentPath="/production/orders/order-1"
                contextualProfilesEnabled
            />,
        );

        expect(
            await screen.findByText(/Konteks berpindah ke/i),
        ).toBeTruthy();
        expect(
            screen.getAllByText(/manajer produksi read-only/i).length,
        ).toBeGreaterThan(0);
    });

    it('keeps the generic UI when server-side rollout is disabled', () => {
        render(
            <PolyflowChatPanel currentPath="/finance/invoices/sales/inv-1" />,
        );
        expect(
            screen.getAllByText(/Panduan dan analisis operasional/i).length,
        ).toBeGreaterThan(0);
        expect(
            screen.queryByRole('button', {
                name: 'Periksa invoice yang sedang saya buka',
            }),
        ).toBeNull();
    });

    it('ignores a late JSON response after the work context changes', async () => {
        let resolveJson: ((value: Response) => void) | undefined;
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(emptyStreamResponse())
            .mockImplementationOnce(
                () =>
                    new Promise<Response>((resolve) => {
                        resolveJson = resolve;
                    }),
            );

        const { rerender } = render(
            <PolyflowChatPanel
                currentPath="/finance/invoices/sales/inv-1"
                contextualProfilesEnabled
            />,
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Periksa invoice yang sedang saya buka',
            }),
        );
        await waitFor(() => expect(resolveJson).toBeDefined());

        rerender(
            <PolyflowChatPanel
                currentPath="/production/orders/order-1"
                contextualProfilesEnabled
            />,
        );
        resolveJson?.({
            ok: true,
            json: async () => ({
                success: true,
                data: {
                    answer: 'Jawaban finance terlambat',
                    safety: { allowed: true },
                },
            }),
        } as Response);

        await waitFor(() =>
            expect(screen.queryByText('Jawaban finance terlambat')).toBeNull(),
        );
        expect(screen.getByText(/Konteks berpindah ke/)).toBeTruthy();
    });
});
