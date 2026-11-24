// @vitest-environment jsdom

import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ pay: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: m.refresh, push: vi.fn() }),
}));
vi.mock('@/actions/sales/expense-claims', () => ({
    payExpenseClaim: m.pay,
}));

import type { ClaimReviewItem } from '@/lib/sales/expense-claim-review';
import type { ClaimPaymentAccounts } from '@/lib/sales/expense-claim-payment-ui';
import { todayWib } from '@/lib/sales/expense-claim-ui';
import { ReimbursementQueue } from '../ReimbursementQueue';

const ACCOUNTS: ClaimPaymentAccounts = {
    expenseAccounts: [
        { id: 'exp-1', code: '61100', name: 'Biaya Perjalanan' },
        { id: 'exp-2', code: '62200', name: 'Biaya Lain' },
    ],
    paymentAccounts: [
        { id: 'cash-1', code: '11110', name: 'Kas Kecil' },
        { id: 'bank-1', code: '11120', name: 'Bank Operasional' },
    ],
};

function claim(overrides: Partial<ClaimReviewItem> = {}): ClaimReviewItem {
    return {
        id: 'claim-1',
        claimNumber: 'RMB-202611-002',
        expenseDate: '2026-11-23T17:00:00.000Z',
        category: 'TOL',
        amount: 45000,
        description: 'Tol ke pelanggan',
        receiptUrl: '/api/images/t/expense-receipt/u/2.jpg',
        status: 'APPROVED',
        rejectionReason: null,
        salesVisit: null,
        user: { name: 'Budi Sales' },
        ...overrides,
    };
}

function renderQueue(accounts: ClaimPaymentAccounts = ACCOUNTS) {
    return render(<ReimbursementQueue claims={[claim()]} accounts={accounts} />);
}

async function openDialog() {
    fireEvent.click(screen.getByRole('button', { name: 'Cairkan' }));
    await screen.findByRole('dialog');
}

function choose(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function submit() {
    fireEvent.click(
        screen.getAllByRole('button', { name: 'Cairkan' }).at(-1) as HTMLElement,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    m.pay.mockResolvedValue({ success: true, data: {} });
});
afterEach(cleanup);

describe('ReimbursementQueue', () => {
    it('shows an empty message when nothing waits for payment', () => {
        render(<ReimbursementQueue claims={[]} accounts={ACCOUNTS} />);

        expect(
            screen.getByText('Tidak ada klaim yang menunggu pencairan.'),
        ).toBeTruthy();
    });

    it('lists the claim with submitter, category, amount and receipt link', () => {
        renderQueue();

        expect(screen.getByText('RMB-202611-002')).toBeTruthy();
        expect(screen.getByText('Budi Sales')).toBeTruthy();
        expect(screen.getByText('Tol')).toBeTruthy();
        expect(screen.getByText(/45\.000/)).toBeTruthy();
        expect(
            screen.getByRole('link', { name: /Lihat nota/ }).getAttribute('href'),
        ).toBe('/api/images/t/expense-receipt/u/2.jpg');
    });
});

describe('PayClaimDialog', () => {
    it('offers only the provided expense and cash/bank accounts', async () => {
        renderQueue();
        await openDialog();

        const expenseOptions = Array.from(
            (screen.getByLabelText('Akun biaya') as HTMLSelectElement).options,
        ).map((option) => option.textContent);
        const sourceOptions = Array.from(
            (screen.getByLabelText('Akun sumber dana (kas/bank)') as HTMLSelectElement)
                .options,
        ).map((option) => option.textContent);

        expect(expenseOptions).toEqual([
            'Pilih akun',
            '61100 · Biaya Perjalanan',
            '62200 · Biaya Lain',
        ]);
        expect(sourceOptions).toEqual([
            'Pilih akun',
            '11110 · Kas Kecil',
            '11120 · Bank Operasional',
        ]);
    });

    it('defaults the payment date to today in WIB and caps it at today', async () => {
        renderQueue();
        await openDialog();

        const dateInput = screen.getByLabelText('Tanggal pembayaran') as HTMLInputElement;
        const today = todayWib(new Date());
        expect(dateInput.value).toBe(today);
        expect(dateInput.max).toBe(today);
    });

    it('validates before sending: no accounts chosen means no server call', async () => {
        renderQueue();
        await openDialog();

        submit();

        expect((await screen.findByRole('alert')).textContent).toBe('Pilih akun biaya');
        expect(m.pay).not.toHaveBeenCalled();
    });

    it('requires a source account once the expense account is chosen', async () => {
        renderQueue();
        await openDialog();

        choose('Akun biaya', 'exp-1');
        submit();

        expect((await screen.findByRole('alert')).textContent).toBe(
            'Pilih akun sumber dana',
        );
        expect(m.pay).not.toHaveBeenCalled();
    });

    it('rejects a payment date in the future without calling the server', async () => {
        renderQueue();
        await openDialog();

        choose('Akun biaya', 'exp-1');
        choose('Akun sumber dana (kas/bank)', 'cash-1');
        choose('Tanggal pembayaran', '2999-01-01');
        submit();

        expect((await screen.findByRole('alert')).textContent).toBe(
            'Tanggal pembayaran tidak boleh di masa depan',
        );
        expect(m.pay).not.toHaveBeenCalled();
    });

    it('sends only the claim id, the chosen accounts and the date, then shows a confirmation and refreshes', async () => {
        renderQueue();
        await openDialog();

        choose('Akun biaya', 'exp-2');
        choose('Akun sumber dana (kas/bank)', 'bank-1');
        choose('Tanggal pembayaran', '2026-11-20');
        submit();

        await waitFor(() =>
            expect(m.pay).toHaveBeenCalledWith({
                claimId: 'claim-1',
                expenseAccountId: 'exp-2',
                paymentAccountId: 'bank-1',
                paymentDate: '2026-11-20',
            }),
        );
        expect((await screen.findByRole('status')).textContent).toContain(
            'Klaim RMB-202611-002 berhasil dicairkan',
        );
        expect(m.refresh).toHaveBeenCalledOnce();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('keeps the dialog open and shows the server error as-is on failure', async () => {
        m.pay.mockResolvedValue({
            success: false,
            error: 'Tidak dapat membayar klaim di periode fiskal yang sudah ditutup.',
            code: 'FISCAL_PERIOD_CLOSED',
        });
        renderQueue();
        await openDialog();

        choose('Akun biaya', 'exp-1');
        choose('Akun sumber dana (kas/bank)', 'cash-1');
        submit();

        expect((await screen.findByRole('alert')).textContent).toBe(
            'Tidak dapat membayar klaim di periode fiskal yang sudah ditutup.',
        );
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(m.refresh).not.toHaveBeenCalled();
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('explains a stale status, closes the dialog and refreshes without a success notice', async () => {
        m.pay.mockResolvedValue({
            success: false,
            error: 'Klaim claim-1 sudah berubah status, silakan refresh',
            code: 'STALE_STATUS',
        });
        renderQueue();
        await openDialog();

        choose('Akun biaya', 'exp-1');
        choose('Akun sumber dana (kas/bank)', 'cash-1');
        submit();

        await waitFor(() => expect(m.refresh).toHaveBeenCalledOnce());
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('disables the form while the request runs and sends one call', async () => {
        let resolve!: (value: unknown) => void;
        m.pay.mockReturnValue(
            new Promise((res) => {
                resolve = res;
            }),
        );
        renderQueue();
        await openDialog();

        choose('Akun biaya', 'exp-1');
        choose('Akun sumber dana (kas/bank)', 'cash-1');
        submit();
        submit();

        await waitFor(() =>
            expect(
                (screen.getByLabelText('Akun biaya') as HTMLSelectElement).disabled,
            ).toBe(true),
        );
        expect(
            (screen.getByRole('button', { name: 'Batal' }) as HTMLButtonElement).disabled,
        ).toBe(true);
        expect(m.pay).toHaveBeenCalledTimes(1);

        resolve({ success: true, data: {} });
        await waitFor(() => expect(m.refresh).toHaveBeenCalled());
    });

    it('blocks paying when the chart of accounts has no usable accounts', async () => {
        renderQueue({ expenseAccounts: [], paymentAccounts: [] });
        await openDialog();

        expect((await screen.findByRole('alert')).textContent).toContain(
            'belum tersedia',
        );
        expect(
            (screen.getAllByRole('button', { name: 'Cairkan' }).at(-1) as HTMLButtonElement)
                .disabled,
        ).toBe(true);
    });

    it('closes without calling the server when cancelled', async () => {
        renderQueue();
        await openDialog();

        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(m.pay).not.toHaveBeenCalled();
    });
});
