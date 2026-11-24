// @vitest-environment jsdom

import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    approve: vi.fn(),
    reject: vi.fn(),
    refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: m.refresh, push: vi.fn() }),
}));
vi.mock('@/actions/sales/expense-claims', () => ({
    approveExpenseClaim: m.approve,
    rejectExpenseClaim: m.reject,
}));

import { ClaimReviewActions } from '../ClaimReviewActions';

function renderActions() {
    return render(
        <ClaimReviewActions claimId="claim-1" claimNumber="RMB-202611-001" />,
    );
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

beforeEach(() => {
    vi.clearAllMocks();
    m.approve.mockResolvedValue({ success: true, data: {} });
    m.reject.mockResolvedValue({ success: true, data: {} });
});
afterEach(cleanup);

describe('ClaimReviewActions approve', () => {
    it('asks for confirmation before calling the approve action', () => {
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Setujui' }));

        expect(screen.getByText('Setujui klaim ini?')).toBeTruthy();
        expect(m.approve).not.toHaveBeenCalled();
    });

    it('approves the claim and refreshes the list after confirmation', async () => {
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Setujui' }));
        fireEvent.click(screen.getByRole('button', { name: 'Ya, setujui' }));

        await waitFor(() => expect(m.approve).toHaveBeenCalledWith('claim-1'));
        await waitFor(() => expect(m.refresh).toHaveBeenCalledOnce());
    });

    it('can back out of the confirmation without calling the server', () => {
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Setujui' }));
        fireEvent.click(screen.getByRole('button', { name: 'Tidak' }));

        expect(screen.getByRole('button', { name: 'Setujui' })).toBeTruthy();
        expect(m.approve).not.toHaveBeenCalled();
    });

    it('disables the buttons while the request runs and sends only one call', async () => {
        const pending = deferred<{ success: boolean; data: object }>();
        m.approve.mockReturnValue(pending.promise);
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Setujui' }));
        const confirm = screen.getByRole('button', { name: 'Ya, setujui' });
        fireEvent.click(confirm);
        fireEvent.click(confirm);

        await waitFor(() =>
            expect(
                (screen.getByRole('button', { name: 'Ya, setujui' }) as HTMLButtonElement)
                    .disabled,
            ).toBe(true),
        );
        expect(
            (screen.getByRole('button', { name: 'Tidak' }) as HTMLButtonElement).disabled,
        ).toBe(true);
        expect(m.approve).toHaveBeenCalledTimes(1);

        pending.resolve({ success: true, data: {} });
        await waitFor(() => expect(m.refresh).toHaveBeenCalled());
    });

    it('shows the server error as-is and does not refresh', async () => {
        m.approve.mockResolvedValue({
            success: false,
            error: 'Anda tidak boleh meninjau klaim yang diajukan sendiri',
            code: 'SELF_APPROVAL_NOT_ALLOWED',
        });
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Setujui' }));
        fireEvent.click(screen.getByRole('button', { name: 'Ya, setujui' }));

        expect((await screen.findByRole('alert')).textContent).toBe(
            'Anda tidak boleh meninjau klaim yang diajukan sendiri',
        );
        expect(m.refresh).not.toHaveBeenCalled();
    });

    it('explains a stale status and refreshes the list', async () => {
        m.approve.mockResolvedValue({
            success: false,
            error: 'Klaim claim-1 sudah berubah status, silakan refresh',
            code: 'STALE_STATUS',
        });
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Setujui' }));
        fireEvent.click(screen.getByRole('button', { name: 'Ya, setujui' }));

        expect((await screen.findByRole('alert')).textContent).toBe(
            'Klaim sudah berubah, muat ulang halaman.',
        );
        expect(m.refresh).toHaveBeenCalledOnce();
    });

    it('shows a generic message when the request itself fails', async () => {
        m.approve.mockRejectedValue(new Error('network'));
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Setujui' }));
        fireEvent.click(screen.getByRole('button', { name: 'Ya, setujui' }));

        expect((await screen.findByRole('alert')).textContent).toContain(
            'Gagal memproses klaim',
        );
    });
});

describe('ClaimReviewActions reject', () => {
    function openDialog() {
        renderActions();
        fireEvent.click(screen.getByRole('button', { name: 'Tolak' }));
    }

    it('requires a reason of at least 3 characters before calling the server', async () => {
        openDialog();

        fireEvent.change(await screen.findByLabelText('Alasan penolakan'), {
            target: { value: ' ab ' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Tolak klaim' }));

        expect((await screen.findByRole('alert')).textContent).toBe(
            'Alasan penolakan minimal 3 karakter',
        );
        expect(m.reject).not.toHaveBeenCalled();
    });

    it('sends the trimmed reason, closes the dialog and refreshes', async () => {
        openDialog();

        fireEvent.change(await screen.findByLabelText('Alasan penolakan'), {
            target: { value: '  Nota tidak terbaca  ' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Tolak klaim' }));

        await waitFor(() =>
            expect(m.reject).toHaveBeenCalledWith('claim-1', 'Nota tidak terbaca'),
        );
        await waitFor(() => expect(m.refresh).toHaveBeenCalledOnce());
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('keeps the dialog open and shows the server error on failure', async () => {
        m.reject.mockResolvedValue({
            success: false,
            error: 'Anda tidak boleh meninjau klaim yang diajukan sendiri',
            code: 'SELF_APPROVAL_NOT_ALLOWED',
        });
        openDialog();

        fireEvent.change(await screen.findByLabelText('Alasan penolakan'), {
            target: { value: 'Tidak sesuai' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Tolak klaim' }));

        expect((await screen.findByRole('alert')).textContent).toBe(
            'Anda tidak boleh meninjau klaim yang diajukan sendiri',
        );
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(m.refresh).not.toHaveBeenCalled();
    });

    it('disables the submit button while the request runs', async () => {
        const pending = deferred<{ success: boolean; data: object }>();
        m.reject.mockReturnValue(pending.promise);
        openDialog();

        fireEvent.change(await screen.findByLabelText('Alasan penolakan'), {
            target: { value: 'Tidak sesuai' },
        });
        const submit = screen.getByRole('button', { name: 'Tolak klaim' });
        fireEvent.click(submit);

        await waitFor(() =>
            expect((submit as HTMLButtonElement).disabled).toBe(true),
        );

        pending.resolve({ success: true, data: {} });
        await waitFor(() => expect(m.refresh).toHaveBeenCalled());
    });

    it('closes without calling the server when cancelled', async () => {
        openDialog();

        fireEvent.click(await screen.findByRole('button', { name: 'Batal' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(m.reject).not.toHaveBeenCalled();
    });
});
