// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantProposalCards } from '../assistant-proposal-cards';

const proposal = {
    id: 'p1',
    summary: 'Catat janji bayar pada invoice INV-0001',
    details: [{ label: 'Catatan', value: 'janji transfer Senin' }],
    expiresAt: '2026-11-05T10:15:00.000Z',
};

function listResponse(proposals: unknown[]) {
    return new Response(JSON.stringify({ data: { proposals } }), {
        status: 200,
    });
}

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('AssistantProposalCards', () => {
    it('renders nothing when there are no pending proposals', async () => {
        fetchMock.mockResolvedValue(listResponse([]));
        const { container } = render(<AssistantProposalCards refreshKey={1} />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(container.firstChild).toBeNull();
    });

    it('states that nothing changed until the user confirms', async () => {
        fetchMock.mockResolvedValue(listResponse([proposal]));
        render(<AssistantProposalCards refreshKey={1} />);
        expect(await screen.findByText(proposal.summary)).toBeTruthy();
        expect(screen.getByText(/Belum ada data yang diubah/)).toBeTruthy();
        expect(screen.getByText('janji transfer Senin')).toBeTruthy();
    });

    it('posts the decision and refreshes the list after confirming', async () => {
        fetchMock
            .mockResolvedValueOnce(listResponse([proposal]))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ success: true }), { status: 200 }),
            )
            .mockResolvedValueOnce(listResponse([]));
        render(<AssistantProposalCards refreshKey={1} />);
        fireEvent.click(await screen.findByText('Simpan catatan'));

        await waitFor(() =>
            expect(screen.getByText('Catatan follow-up tersimpan.')).toBeTruthy(),
        );
        const post = fetchMock.mock.calls[1];
        expect(post[0]).toBe('/api/chat/proposals');
        expect(post[1].method).toBe('POST');
        expect(JSON.parse(post[1].body)).toEqual({
            proposalId: 'p1',
            action: 'confirm',
        });
        expect(screen.queryByText(proposal.summary)).toBeNull();
    });

    it('shows the server error and keeps the card when confirm fails', async () => {
        fetchMock
            .mockResolvedValueOnce(listResponse([proposal]))
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({ error: 'Usulan sudah diproses atau kedaluwarsa.' }),
                    { status: 409 },
                ),
            )
            .mockResolvedValueOnce(listResponse([proposal]));
        render(<AssistantProposalCards refreshKey={1} />);
        fireEvent.click(await screen.findByText('Simpan catatan'));
        expect(
            await screen.findByText('Usulan sudah diproses atau kedaluwarsa.'),
        ).toBeTruthy();
        expect(screen.getByText(proposal.summary)).toBeTruthy();
    });
});
