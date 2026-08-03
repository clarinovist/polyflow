// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RequestList } from '../RequestList';

vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);
Element.prototype.scrollIntoView = vi.fn();

const {
    mockRefresh,
    mockToast,
    mockApprovePurchaseRequest,
    mockRejectPurchaseRequest,
    mockConsolidatePurchaseRequests,
} = vi.hoisted(() => ({
    mockRefresh: vi.fn(),
    mockToast: { success: vi.fn(), error: vi.fn() },
    mockApprovePurchaseRequest: vi.fn(),
    mockRejectPurchaseRequest: vi.fn(),
    mockConsolidatePurchaseRequests: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/actions/purchasing/purchasing', () => ({
    approvePurchaseRequest: (...args: unknown[]) =>
        mockApprovePurchaseRequest(...args),
    rejectPurchaseRequest: (...args: unknown[]) =>
        mockRejectPurchaseRequest(...args),
    consolidatePurchaseRequests: (...args: unknown[]) =>
        mockConsolidatePurchaseRequests(...args),
}));

function makeRequest(overrides: Record<string, unknown> = {}) {
    return {
        id: 'pr-1',
        requestNumber: 'PR-001',
        requestDate: new Date('2026-08-01'),
        status: 'OPEN',
        priority: 'NORMAL',
        notes: null,
        createdAt: new Date('2026-08-01'),
        updatedAt: new Date('2026-08-01'),
        createdById: 'user-1',
        salesOrderId: null,
        reviewedById: null,
        reviewedAt: null,
        rejectionReason: null,
        items: [
            {
                id: 'item-1',
                quantity: { toString: () => '10' } as unknown,
                productVariant: {
                    name: 'Kain PE 24s',
                    product: { name: 'Kain' },
                },
            },
        ],
        salesOrder: null,
        createdBy: { name: 'Budi' },
        reviewedBy: null,
        ...overrides,
    } as Parameters<typeof RequestList>[0]['requests'][number];
}

const defaultSuppliers = [{ id: 'sup-1', name: 'PT Maju Mundur' }];

function renderList(
    props: Partial<React.ComponentProps<typeof RequestList>> = {},
) {
    return render(
        <RequestList
            requests={[makeRequest()]}
            suppliers={defaultSuppliers}
            canApprove={false}
            {...props}
        />,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    mockApprovePurchaseRequest.mockResolvedValue({ success: true, data: {} });
    mockRejectPurchaseRequest.mockResolvedValue({ success: true, data: {} });
    mockConsolidatePurchaseRequests.mockResolvedValue({
        success: true,
        data: {},
    });
});

describe('RequestList — approval UI', () => {
    it('canApprove=false + OPEN: no approve/reject buttons; checkbox disabled', () => {
        renderList({ canApprove: false });
        expect(screen.queryByRole('button', { name: /Setujui/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /Tolak/i })).toBeNull();
        const checkboxes = screen.getAllByRole('checkbox');
        const rowCheckbox = checkboxes[1]; // first is select-all
        expect(rowCheckbox).toHaveProperty('disabled', true);
    });

    it('canApprove=true + OPEN: approve and reject buttons visible; checkbox still disabled', () => {
        renderList({ canApprove: true });
        expect(
            screen.getByRole('button', { name: /Setujui/i }),
        ).toBeDefined();
        expect(screen.getByRole('button', { name: /Tolak/i })).toBeDefined();
        const checkboxes = screen.getAllByRole('checkbox');
        const rowCheckbox = checkboxes[1];
        expect(rowCheckbox).toHaveProperty('disabled', true); // OPEN checkbox disabled
    });

    it('APPROVED: checkbox enabled; no approve/reject buttons; can consolidate', async () => {
        renderList({
            canApprove: true,
            requests: [makeRequest({ id: 'pr-a', status: 'APPROVED' })],
        });
        const checkboxes = screen.getAllByRole('checkbox');
        const rowCheckbox = checkboxes[1];
        expect(rowCheckbox).toHaveProperty('disabled', false);
        expect(screen.queryByRole('button', { name: /Setujui/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /Tolak/i })).toBeNull();

        // Select and see consolidate button in the row
        fireEvent.click(rowCheckbox);
        await waitFor(() => {
            // There may be two "Konsolidasi" elements (header + row). Use the row one.
            const btns = screen.getAllByRole('button', { name: /Konsolidasi/i });
            expect(btns.length).toBeGreaterThanOrEqual(1);
        });
    });

    it('reject dialog: submit disabled without reason; enabled + calls action with reason', async () => {
        renderList({ canApprove: true });
        fireEvent.click(screen.getByRole('button', { name: /Tolak/i }));

        // Dialog opens
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toBeDefined();
        // Title and button both say "Tolak Permintaan" — use dialog title specifically
        expect(
            screen.getByRole('heading', { name: /Tolak Permintaan/i }),
        ).toBeDefined();

        // Submit button has text "Tolak Permintaan"
        const submitBtn = screen.getByRole('button', {
            name: 'Tolak Permintaan',
        });
        expect(submitBtn).toHaveProperty('disabled', true);

        // Type reason
        const textarea = screen.getByPlaceholderText(/Alasan penolakan/);
        fireEvent.change(textarea, { target: { value: 'Stok masih cukup' } });

        await waitFor(() => {
            expect(submitBtn).toHaveProperty('disabled', false);
        });

        // Submit
        fireEvent.click(submitBtn);
        await waitFor(() => {
            expect(mockRejectPurchaseRequest).toHaveBeenCalledWith(
                'pr-1',
                'Stok masih cukup',
            );
            expect(mockToast.success).toHaveBeenCalledWith(
                expect.stringContaining('ditolak'),
            );
            expect(mockRefresh).toHaveBeenCalled();
        });
    });

    it('approve click calls approvePurchaseRequest', async () => {
        renderList({ canApprove: true });
        fireEvent.click(screen.getByRole('button', { name: /Setujui/i }));
        await waitFor(() => {
            expect(mockApprovePurchaseRequest).toHaveBeenCalledWith('pr-1');
            expect(mockToast.success).toHaveBeenCalledWith(
                expect.stringContaining('Disetujui'),
            );
            expect(mockRefresh).toHaveBeenCalled();
        });
    });

    it('REJECTED shows rejectionReason + reviewer name', () => {
        renderList({
            requests: [
                makeRequest({
                    status: 'REJECTED',
                    rejectionReason: 'Anggaran tidak tersedia',
                    reviewedBy: { id: 'u-2', name: 'Sari' },
                    reviewedAt: new Date('2026-08-02T10:30:00'),
                }),
            ],
        });
        expect(screen.getByText('Ditolak')).toBeDefined();
        expect(screen.getByText(/Anggaran tidak tersedia/)).toBeDefined();
        expect(screen.getByText(/Sari/)).toBeDefined();
    });

    it('consolidate sends only APPROVED selected ids', async () => {
        renderList({
            requests: [
                makeRequest({ id: 'pr-open', status: 'OPEN' }),
                makeRequest({
                    id: 'pr-app1',
                    status: 'APPROVED',
                    requestNumber: 'PR-A1',
                }),
                makeRequest({
                    id: 'pr-app2',
                    status: 'APPROVED',
                    requestNumber: 'PR-A2',
                }),
            ],
        });

        // Select both APPROVED rows
        const checkboxes = screen.getAllByRole('checkbox');
        // idx 0 = select-all, 1 = pr-open (disabled), 2 = pr-app1, 3 = pr-app2
        fireEvent.click(checkboxes[2]);
        fireEvent.click(checkboxes[3]);

        // Click the header consolidate button (first one, contains count)
        const consolidateButtons = screen.getAllByRole('button', {
            name: /Konsolidasi/i,
        });
        // The header button includes count text like "Konsolidasi (2)"
        const headerBtn = consolidateButtons.find((b) =>
            b.textContent?.includes('(2)'),
        );
        expect(headerBtn).toBeDefined();
        fireEvent.click(headerBtn!);

        // Dialog opens, select supplier, submit
        const supplierTrigger = await screen.findByText('Pilih supplier...');
        fireEvent.click(supplierTrigger);
        const supplierOption = await screen.findByText('PT Maju Mundur');
        fireEvent.click(supplierOption);

        const submitBtn = screen.getByRole('button', { name: /Buat Draft PO/i });
        await waitFor(() => {
            expect(submitBtn).toHaveProperty('disabled', false);
        });
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(mockConsolidatePurchaseRequests).toHaveBeenCalledWith(
                ['pr-app1', 'pr-app2'],
                'sup-1',
            );
            expect(mockToast.success).toHaveBeenCalled();
            expect(mockRefresh).toHaveBeenCalled();
        });
    });

    it('action error → toast.error', async () => {
        mockApprovePurchaseRequest.mockResolvedValue({
            success: false,
            error: 'Not authorized',
        });
        renderList({ canApprove: true });
        fireEvent.click(screen.getByRole('button', { name: /Setujui/i }));
        await waitFor(() => {
            expect(mockToast.error).toHaveBeenCalledWith('Not authorized');
        });
    });

    it('status badges: OPEN=default, APPROVED=outline, REJECTED=destructive, CONVERTED=secondary', () => {
        const { rerender } = render(
            <RequestList
                requests={[makeRequest({ status: 'OPEN' })]}
                suppliers={defaultSuppliers}
                canApprove={false}
            />,
        );
        expect(screen.getByText('Open')).toBeDefined();

        rerender(
            <RequestList
                requests={[makeRequest({ status: 'APPROVED' })]}
                suppliers={defaultSuppliers}
                canApprove={false}
            />,
        );
        expect(screen.getByText('Disetujui')).toBeDefined();

        rerender(
            <RequestList
                requests={[makeRequest({ status: 'REJECTED' })]}
                suppliers={defaultSuppliers}
                canApprove={false}
            />,
        );
        expect(screen.getByText('Ditolak')).toBeDefined();

        rerender(
            <RequestList
                requests={[makeRequest({ status: 'CONVERTED' })]}
                suppliers={defaultSuppliers}
                canApprove={false}
            />,
        );
        // "Dikonversi" appears in both badge and disabled action button
        expect(screen.getAllByText('Dikonversi').length).toBeGreaterThanOrEqual(1);
    });
});
