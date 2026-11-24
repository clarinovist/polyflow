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
    submit: vi.fn(),
    upload: vi.fn(),
    refresh: vi.fn(),
    connectivity: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: m.refresh, push: vi.fn() }),
}));
vi.mock('@/actions/sales/expense-claims', () => ({
    submitExpenseClaim: m.submit,
}));
vi.mock('@/hooks/use-mobile-connectivity', () => ({
    useMobileConnectivity: m.connectivity,
}));
vi.mock('@/lib/sales/expense-receipt-upload', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('@/lib/sales/expense-receipt-upload')
    >()),
    uploadExpenseReceipt: m.upload,
}));

import { ReceiptUploadError } from '@/lib/sales/expense-receipt-upload';
import { NewClaimForm } from '../NewClaimForm';

const RECEIPT_URL = '/api/images/tenant/expense-receipt/user/1700000000000.jpg';

function online(isOnline: boolean) {
    m.connectivity.mockReturnValue({ isOnline, isSlowConnection: false });
}

async function attachPhoto() {
    const file = new File(['x'], 'nota.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Berkas foto nota'), {
        target: { files: [file] },
    });
    await screen.findByText('Foto nota terunggah');
}

function fillFields() {
    fireEvent.change(screen.getByLabelText('Kategori'), {
        target: { value: 'BBM' },
    });
    fireEvent.change(screen.getByLabelText('Nominal (Rp)'), {
        target: { value: '125000' },
    });
    fireEvent.change(screen.getByLabelText('Keterangan'), {
        target: { value: 'Bensin kunjungan' },
    });
}

function submit() {
    fireEvent.click(screen.getByRole('button', { name: 'Ajukan klaim' }));
}

beforeEach(() => {
    vi.clearAllMocks();
    online(true);
    m.upload.mockResolvedValue(RECEIPT_URL);
    m.submit.mockResolvedValue({
        success: true,
        data: { claimNumber: 'RMB-202611-001' },
    });
    let counter = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(
        () => `claim-${++counter}` as `${string}-${string}-${string}-${string}-${string}`,
    );
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('NewClaimForm', () => {
    it('uploads the photo then submits with the receipt url and client claim id', async () => {
        render(<NewClaimForm visit={null} />);
        await attachPhoto();
        fillFields();

        submit();

        await waitFor(() => expect(m.submit).toHaveBeenCalledOnce());
        expect(m.upload).toHaveBeenCalledOnce();
        expect(m.submit.mock.calls[0][0]).toMatchObject({
            category: 'BBM',
            amount: 125000,
            description: 'Bensin kunjungan',
            receiptUrl: RECEIPT_URL,
            clientClaimId: 'claim-1',
        });
        expect(m.submit.mock.calls[0][0]).not.toHaveProperty('salesVisitId');
    });

    it('formats the amount with thousand separators while typing', () => {
        render(<NewClaimForm visit={null} />);
        fireEvent.change(screen.getByLabelText('Nominal (Rp)'), {
            target: { value: '1250000' },
        });
        expect(
            (screen.getByLabelText('Nominal (Rp)') as HTMLInputElement).value,
        ).toBe('1.250.000');
    });

    it('shows the description counter', () => {
        render(<NewClaimForm visit={null} />);
        fireEvent.change(screen.getByLabelText('Keterangan'), {
            target: { value: 'abc' },
        });
        expect(screen.getByText('3/500')).toBeTruthy();
    });

    it('confirms success, resets the form, refreshes, and uses a new claim id next time', async () => {
        render(<NewClaimForm visit={null} />);
        await attachPhoto();
        fillFields();
        submit();

        await screen.findByText(
            'Klaim RMB-202611-001 diajukan, menunggu persetujuan.',
        );
        expect(m.refresh).toHaveBeenCalledOnce();
        expect(
            (screen.getByLabelText('Keterangan') as HTMLTextAreaElement).value,
        ).toBe('');

        await attachPhoto();
        fillFields();
        submit();
        await waitFor(() => expect(m.submit).toHaveBeenCalledTimes(2));
        expect(m.submit.mock.calls[1][0].clientClaimId).toBe('claim-2');
    });

    it('keeps the same client claim id when the server rejects, so a retry cannot duplicate', async () => {
        m.submit.mockResolvedValueOnce({
            success: false,
            error: 'Periode sedang ditutup',
            code: 'BUSINESS_RULE',
        });
        render(<NewClaimForm visit={null} />);
        await attachPhoto();
        fillFields();

        submit();
        expect((await screen.findByRole('alert')).textContent).toBe(
            'Periode sedang ditutup',
        );
        submit();

        await waitFor(() => expect(m.submit).toHaveBeenCalledTimes(2));
        expect(m.submit.mock.calls[0][0].clientClaimId).toBe('claim-1');
        expect(m.submit.mock.calls[1][0].clientClaimId).toBe('claim-1');
        expect(m.refresh).toHaveBeenCalledOnce();
    });

    it('shows a friendly message when the submit call throws', async () => {
        m.submit.mockRejectedValueOnce(new Error('boom'));
        render(<NewClaimForm visit={null} />);
        await attachPhoto();
        fillFields();
        submit();

        expect((await screen.findByRole('alert')).textContent).toBe(
            'Gagal mengajukan klaim. Periksa koneksi lalu coba lagi.',
        );
    });

    it('does not call the action when the upload fails', async () => {
        m.upload.mockRejectedValueOnce(
            new ReceiptUploadError('File terlalu besar. Maksimal 10MB.'),
        );
        render(<NewClaimForm visit={null} />);
        fireEvent.change(screen.getByLabelText('Berkas foto nota'), {
            target: {
                files: [new File(['x'], 'nota.jpg', { type: 'image/jpeg' })],
            },
        });

        expect((await screen.findByRole('alert')).textContent).toBe(
            'File terlalu besar. Maksimal 10MB.',
        );
        fillFields();
        submit();

        expect((await screen.findByRole('alert')).textContent).toBe(
            'Foto nota wajib diunggah',
        );
        expect(m.submit).not.toHaveBeenCalled();
    });

    it('falls back to a generic message on an unexpected upload failure', async () => {
        m.upload.mockRejectedValueOnce(new Error('canvas exploded'));
        render(<NewClaimForm visit={null} />);
        fireEvent.change(screen.getByLabelText('Berkas foto nota'), {
            target: {
                files: [new File(['x'], 'nota.jpg', { type: 'image/jpeg' })],
            },
        });

        expect((await screen.findByRole('alert')).textContent).toBe(
            'Gagal mengunggah nota. Cek koneksi.',
        );
    });

    it('lets the user remove an uploaded photo', async () => {
        render(<NewClaimForm visit={null} />);
        await attachPhoto();

        fireEvent.click(screen.getByRole('button', { name: 'Hapus foto nota' }));

        expect(
            screen.getByRole('button', { name: /Ambil foto nota/ }),
        ).toBeTruthy();
    });

    it('blocks an invalid draft locally without calling the action', async () => {
        render(<NewClaimForm visit={null} />);
        await attachPhoto();
        fillFields();
        fireEvent.change(screen.getByLabelText('Tanggal pengeluaran'), {
            target: { value: '2000-01-01' },
        });

        submit();

        expect((await screen.findByRole('alert')).textContent).toContain(
            'lebih lama dari 90 hari',
        );
        expect(m.submit).not.toHaveBeenCalled();
    });

    it('disables sending and explains why while offline', () => {
        online(false);
        render(<NewClaimForm visit={null} />);

        expect(screen.getByText(/sedang offline/i)).toBeTruthy();
        expect(
            (
                screen.getByRole('button', {
                    name: 'Ajukan klaim',
                }) as HTMLButtonElement
            ).disabled,
        ).toBe(true);
        expect(
            (
                screen.getByRole('button', {
                    name: /Ambil foto nota/,
                }) as HTMLButtonElement
            ).disabled,
        ).toBe(true);
        expect(m.submit).not.toHaveBeenCalled();
    });

    it('prevents a double submit while the request is in flight', async () => {
        let finish: (value: unknown) => void = () => {};
        m.submit.mockReturnValueOnce(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        render(<NewClaimForm visit={null} />);
        await attachPhoto();
        fillFields();

        submit();
        await waitFor(() =>
            expect(
                (
                    screen.getByRole('button', {
                        name: 'Ajukan klaim',
                    }) as HTMLButtonElement
                ).disabled,
            ).toBe(true),
        );
        submit();
        expect(m.submit).toHaveBeenCalledOnce();

        finish({ success: true, data: { claimNumber: 'RMB-202611-002' } });
        await screen.findByText(/RMB-202611-002/);
    });

    it('attaches the visit and shows its label when opened from a visit', async () => {
        render(
            <NewClaimForm
                visit={{ id: 'visit-7', label: 'Toko Contoh, 24 Nov 2026' }}
            />,
        );
        expect(
            screen.getByText('Terkait kunjungan: Toko Contoh, 24 Nov 2026'),
        ).toBeTruthy();
        await attachPhoto();
        fillFields();

        submit();

        await waitFor(() => expect(m.submit).toHaveBeenCalledOnce());
        expect(m.submit.mock.calls[0][0].salesVisitId).toBe('visit-7');
    });

    it('still marks the claim as visit-related when the visit label is unknown', () => {
        render(<NewClaimForm visit={{ id: 'visit-7', label: null }} />);
        expect(screen.getByText('Terkait kunjungan')).toBeTruthy();
    });

    it('ignores a cancelled file picker', () => {
        render(<NewClaimForm visit={null} />);
        fireEvent.change(screen.getByLabelText('Berkas foto nota'), {
            target: { files: [] },
        });
        expect(m.upload).not.toHaveBeenCalled();
    });
});
