// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    claim: vi.fn(),
    snooze: vi.fn(),
    refresh: vi.fn(),
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
    },
}));

vi.mock('@/actions/findings/finding-actions', () => ({
    claimFinding: mocks.claim,
    snoozeFinding: mocks.snooze,
}));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('next/link', () => ({
    default: ({
        href,
        children,
        ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import { groupFindings } from '@/lib/findings/finding-groups';
import type { FindingView } from '@/lib/findings/finding-view';
import { snoozeDateBounds } from '@/lib/findings/snooze-days';
import { FindingsInbox } from '../FindingsInbox';

const ME = 'user-me';
const NOW_ISO = new Date().toISOString();

let seq = 0;
function finding(overrides: Partial<FindingView> = {}): FindingView {
    seq += 1;
    return {
        id: `f-${seq}`,
        fingerprint: `overdue_ar:inv-${seq}`,
        detector: 'overdue_ar',
        severity: 'WARNING',
        status: 'UNCLAIMED',
        headline: `Invoice INV-${seq} — Customer A (SO: SO-${seq})`,
        detail: 'Lewat jatuh tempo 5 hari, sisa Rp 1.000.000',
        entityType: 'Invoice',
        entityId: `inv-${seq}`,
        slaDueAt: new Date(Date.now() + 5 * 3_600_000).toISOString(),
        snoozedUntil: null,
        firstSeenAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        claimedById: null,
        claimedByName: null,
        ...overrides,
    };
}

function renderInbox(findings: FindingView[]) {
    return render(
        <FindingsInbox
            sections={groupFindings(findings, ME)}
            myUserId={ME}
            nowIso={NOW_ISO}
        />,
    );
}

describe('FindingsInbox', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.claim.mockResolvedValue({ success: true, data: {} });
        mocks.snooze.mockResolvedValue({ success: true, data: {} });
    });

    it('shows each section with its title and count', () => {
        renderInbox([
            finding(),
            finding({ slaDueAt: null }),
            finding({ status: 'CLAIMED', claimedById: ME }),
        ]);

        expect(screen.getByRole('heading', { name: /^Baru/ })).toBeTruthy();
        expect(screen.getByRole('heading', { name: /^Tunggakan lama/ })).toBeTruthy();
        expect(screen.getByRole('heading', { name: /^Saya tangani/ })).toBeTruthy();
    });

    it('never offers a "Selesai" action for condition findings', () => {
        renderInbox([finding(), finding({ status: 'CLAIMED', claimedById: ME })]);

        expect(screen.queryByRole('button', { name: /selesai/i })).toBeNull();
    });

    it('shows severity badges and SLA text', () => {
        renderInbox([
            finding({ severity: 'CRITICAL' }),
            finding({ slaDueAt: null, severity: 'WARNING' }),
        ]);

        expect(screen.getByText('Kritis')).toBeTruthy();
        expect(screen.getByText('Perhatian')).toBeTruthy();
        expect(screen.getByText(/SLA sisa 5 jam/)).toBeTruthy();
        expect(screen.getByText(/Tanpa SLA/)).toBeTruthy();
    });

    it('links each finding to its entity page', () => {
        renderInbox([finding({ entityId: 'abc' })]);

        const link = screen.getByRole('link', { name: /Buka/ });
        expect(link.getAttribute('href')).toBe('/finance/invoices/sales/abc');
    });

    it('claims a single finding and refreshes the list', async () => {
        const single = finding({ id: 'solo' });
        renderInbox([single]);

        fireEvent.click(screen.getByRole('button', { name: 'Klaim' }));

        await waitFor(() => expect(mocks.claim).toHaveBeenCalledWith('solo'));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
        expect(mocks.toast.success).toHaveBeenCalledWith('1 temuan diklaim.');
    });

    it('hides Klaim on findings someone else already took and names the owner', () => {
        renderInbox([
            finding({
                status: 'CLAIMED',
                claimedById: 'other',
                claimedByName: 'Rina',
            }),
        ]);

        expect(screen.queryByRole('button', { name: 'Klaim' })).toBeNull();
        expect(screen.getByText('Diklaim oleh Rina')).toBeTruthy();
    });

    it('offers neither claim nor snooze on already snoozed findings', () => {
        renderInbox([
            finding({
                status: 'SNOOZED',
                snoozedUntil: new Date(Date.now() + 3 * 86_400_000).toISOString(),
            }),
        ]);

        expect(screen.queryByRole('button', { name: 'Klaim' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Tunda' })).toBeNull();
        expect(screen.getByText(/Ditunda sampai/)).toBeTruthy();
    });

    it('group claim only targets unclaimed members and reports partial failures', async () => {
        const open1 = finding({ id: 'open-1' });
        const open2 = finding({ id: 'open-2' });
        const taken = finding({
            id: 'taken',
            status: 'CLAIMED',
            claimedById: 'other',
        });
        mocks.claim.mockImplementation(async (id: string) =>
            id === 'open-2'
                ? { success: false, error: 'Sudah diklaim orang lain.' }
                : { success: true, data: {} },
        );
        renderInbox([open1, open2, taken]);

        fireEvent.click(screen.getByRole('button', { name: 'Klaim semua (2)' }));

        await waitFor(() => expect(mocks.claim).toHaveBeenCalledTimes(2));
        expect(mocks.claim).toHaveBeenCalledWith('open-1');
        expect(mocks.claim).toHaveBeenCalledWith('open-2');
        expect(mocks.claim).not.toHaveBeenCalledWith('taken');
        await waitFor(() =>
            expect(mocks.toast.warning).toHaveBeenCalledWith(
                '1 temuan diklaim, 1 gagal. Sudah diklaim orang lain.',
            ),
        );
    });

    it('requires a date and a note before a snooze can be confirmed', () => {
        renderInbox([finding()]);
        fireEvent.click(screen.getByRole('button', { name: 'Tunda' }));

        const dialog = screen.getByRole('dialog');
        const confirm = within(dialog).getByRole('button', { name: 'Tunda' });
        expect((confirm as HTMLButtonElement).disabled).toBe(true);

        const { min } = snoozeDateBounds(new Date());
        fireEvent.change(within(dialog).getByLabelText('Tunda sampai'), {
            target: { value: min },
        });
        expect((confirm as HTMLButtonElement).disabled).toBe(true);

        fireEvent.change(within(dialog).getByLabelText(/Catatan/), {
            target: { value: 'ab' },
        });
        expect((confirm as HTMLButtonElement).disabled).toBe(true);

        fireEvent.change(within(dialog).getByLabelText(/Catatan/), {
            target: { value: 'janji bayar' },
        });
        expect((confirm as HTMLButtonElement).disabled).toBe(false);
    });

    it('snoozes a single finding with days derived from the picked date', async () => {
        renderInbox([finding({ id: 'solo' })]);
        fireEvent.click(screen.getByRole('button', { name: 'Tunda' }));
        const dialog = screen.getByRole('dialog');

        fireEvent.change(within(dialog).getByLabelText('Tunda sampai'), {
            target: { value: snoozeDateBounds(new Date()).max },
        });
        fireEvent.change(within(dialog).getByLabelText(/Catatan/), {
            target: { value: '  janji bayar tgl 15  ' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Tunda' }));

        await waitFor(() =>
            expect(mocks.snooze).toHaveBeenCalledWith('solo', 14, 'janji bayar tgl 15'),
        );
        expect(mocks.toast.success).toHaveBeenCalledWith('1 temuan ditunda.');
    });

    it('snoozes every member of a group with the same note', async () => {
        renderInbox([finding({ id: 'a' }), finding({ id: 'b' })]);
        fireEvent.click(screen.getByRole('button', { name: 'Tunda semua (2)' }));
        const dialog = screen.getByRole('dialog');

        fireEvent.change(within(dialog).getByLabelText('Tunda sampai'), {
            target: { value: snoozeDateBounds(new Date()).min },
        });
        fireEvent.change(within(dialog).getByLabelText(/Catatan/), {
            target: { value: 'supplier janji bayar' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Tunda' }));

        await waitFor(() => expect(mocks.snooze).toHaveBeenCalledTimes(2));
        expect(mocks.snooze).toHaveBeenCalledWith('a', 1, 'supplier janji bayar');
        expect(mocks.snooze).toHaveBeenCalledWith('b', 1, 'supplier janji bayar');
    });

    it('collapses a large group behind a summary with total and age', () => {
        const many = Array.from({ length: 5 }, () => finding());

        renderInbox(many);

        expect(screen.getByText(/5 temuan · sisa Rp\s?5\.000\.000/)).toBeTruthy();
        expect(screen.getByText('Lihat 5 temuan')).toBeTruthy();
    });
});
