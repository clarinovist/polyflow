// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FinanceHome from '../page';
import FinanceTasks from '../tasks/page';
import FinanceInsights from '../insights/page';
import FinanceInvoiceDetail from '../invoices/[type]/[id]/page';

const m = vi.hoisted(() => ({
    overview: vi.fn(),
    detail: vi.fn(),
    notFound: vi.fn(),
    refresh: vi.fn(),
}));

vi.mock('@/actions/finance/mobile-dashboard', () => ({
    getFinanceMobileOverview: m.overview,
    getFinanceMobileInvoiceDetail: m.detail,
}));
vi.mock('next/navigation', () => ({
    notFound: m.notFound,
    useRouter: () => ({ refresh: m.refresh }),
}));
vi.mock('next/link', () => ({
    default: ({
        children,
        ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props}>{children}</a>
    ),
}));

const overview = {
    generatedAt: '2026-10-07T03:00:00.000Z',
    query: { type: 'ALL', due: 'ALL', bucket: 'ALL', page: 1 },
    sections: {
        ar: 'AVAILABLE',
        ap: 'AVAILABLE',
        journals: 'AVAILABLE',
        recon: 'AVAILABLE',
        fiscal: 'AVAILABLE',
        payroll: 'AVAILABLE',
        arNominal: 'HIDDEN',
        apNominal: 'HIDDEN',
    },
    counts: {
        total: 2,
        returned: 1,
        ar: 1,
        ap: 1,
        hasNext: false,
        pageSizePerType: 10,
    },
    highlights: {
        arCount: 1,
        apCount: 2,
        draftJournalCount: 3,
        openReconCount: 1,
    },
    invoices: [
        {
            id: 'ap-1',
            type: 'AP',
            invoiceNumber: 'AP-SYNTH',
            partnerName: 'Supplier Synthetic',
            status: 'PARTIAL',
            invoiceDate: '2026-01-01T00:00:00.000Z',
            dueDate: '2026-01-15T00:00:00.000Z',
            bucket: '1_30',
        },
    ],
    readiness: {
        fiscalPeriod: {
            status: 'AVAILABLE',
            data: { period: '2026-10', status: 'OPEN' },
        },
        payroll: {
            status: 'AVAILABLE',
            data: {
                year: 2026,
                month: 9,
                status: 'OPEN',
                counts: { draft: 1, finalized: 1, paid: 1 },
                total: 3,
            },
        },
    },
};

beforeEach(() => {
    vi.resetAllMocks();
    m.overview.mockResolvedValue({ success: true, data: overview });
});
afterEach(cleanup);

describe('Finance Mobile pages', () => {
    it.each([
        ['home', () => FinanceHome()],
        ['tasks', () => FinanceTasks({ searchParams: Promise.resolve({}) })],
        ['insights', () => FinanceInsights()],
    ])('%s renders one H1 and no mutation controls', async (_name, load) => {
        render(await load());
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(
            screen.queryByRole('button', {
                name: /bayar|posting|setujui|ubah|tutup/i,
            }),
        ).toBeNull();
    });

    it('renders a failed section as a placeholder without collapsing unrelated sections', async () => {
        m.overview.mockResolvedValue({
            success: true,
            data: {
                ...overview,
                sections: {
                    ...overview.sections,
                    ar: 'UNAVAILABLE',
                    payroll: 'UNAVAILABLE',
                },
                highlights: { ...overview.highlights, arCount: null },
                readiness: {
                    ...overview.readiness,
                    payroll: { status: 'UNAVAILABLE', data: null },
                },
            },
        });
        render(await FinanceHome());
        expect(screen.getByText(/Piutang \(AR\)/)).toBeTruthy();
        expect(screen.getByText(/Kesiapan payroll/)).toBeTruthy();
        expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
        // Unrelated count sections keep their real values.
        expect(screen.getByText('3')).toBeTruthy();
        expect(screen.getByText('2')).toBeTruthy();
    });

    it('renders not-configured readiness factually instead of as zero', async () => {
        m.overview.mockResolvedValue({
            success: true,
            data: {
                ...overview,
                sections: {
                    ...overview.sections,
                    fiscal: 'NOT_CONFIGURED',
                    payroll: 'NOT_CONFIGURED',
                },
                readiness: {
                    fiscalPeriod: { status: 'NOT_CONFIGURED', data: null },
                    payroll: { status: 'NOT_CONFIGURED', data: null },
                },
            },
        });
        render(await FinanceHome());
        expect(screen.getByText('Belum dibuat')).toBeTruthy();
        expect(screen.getByText('Belum ada periode OPEN')).toBeTruthy();
        expect(screen.queryByText('0')).toBeNull();
    });

    it('shows a valid available zero as zero, not as a placeholder', async () => {
        m.overview.mockResolvedValue({
            success: true,
            data: {
                ...overview,
                highlights: {
                    ...overview.highlights,
                    arCount: 0,
                    apCount: 0,
                    draftJournalCount: 0,
                    openReconCount: 0,
                },
            },
        });
        render(await FinanceHome());
        expect(screen.queryByText('—')).toBeNull();
        expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(4);
    });

    it('marks hidden nominal sections without rendering any nominal', async () => {
        render(await FinanceInsights());
        expect(screen.getByText(/Tidak dikirim karena izin: Nominal AR/)).toBeTruthy();
        expect(screen.queryByText(/^Rp/)).toBeNull();
        expect(screen.getByText(/Nominal tidak dikirim/)).toBeTruthy();
    });

    it('renders nominal when the server sends it under permission', async () => {
        m.overview.mockResolvedValue({
            success: true,
            data: {
                ...overview,
                sections: {
                    ...overview.sections,
                    arNominal: 'AVAILABLE',
                    apNominal: 'AVAILABLE',
                },
                highlights: { ...overview.highlights, arAmount: 1200, apAmount: 800 },
            },
        });
        render(await FinanceInsights());
        expect(screen.queryByText(/Nominal tidak dikirim/)).toBeNull();
        expect(
            screen.getByText((content) =>
                content.replace(/\s/g, '') === '1.200',
            ),
        ).toBeTruthy();
    });

    it('renders the AR/AP queue with total versus returned and a section notice', async () => {
        m.overview.mockResolvedValue({
            success: true,
            data: {
                ...overview,
                sections: { ...overview.sections, ap: 'UNAVAILABLE' },
            },
        });
        render(await FinanceTasks({ searchParams: Promise.resolve({}) }));
        expect(screen.getByText(/Hutang \(AP\)/)).toBeTruthy();
        expect(screen.getByText(/Menampilkan 1 dari 2 faktur/)).toBeTruthy();
        expect(screen.getByText('[AP] AP-SYNTH')).toBeTruthy();
    });

    it('renders invoice detail read-only without amounts when the DTO omits them', async () => {
        m.detail.mockResolvedValue({
            success: true,
            data: {
                id: 'ap-1',
                type: 'AP',
                invoiceNumber: 'AP-SYNTH',
                partnerName: 'Supplier Synthetic',
                invoiceDate: '2026-01-01T00:00:00.000Z',
                dueDate: null,
                status: 'PARTIAL',
            },
        });
        render(
            await FinanceInvoiceDetail({
                params: Promise.resolve({ type: 'ap', id: 'ap-1' }),
            }),
        );
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.queryByText(/^Rp/)).toBeNull();
    });

    it('renders invoice detail amounts only when present in the server DTO', async () => {
        m.detail.mockResolvedValue({
            success: true,
            data: {
                id: 'ap-1',
                type: 'AP',
                invoiceNumber: 'AP-SYNTH',
                partnerName: 'Supplier Synthetic',
                invoiceDate: '2026-01-01T00:00:00.000Z',
                dueDate: null,
                status: 'PARTIAL',
                remainingAmount: 600,
            },
        });
        render(
            await FinanceInvoiceDetail({
                params: Promise.resolve({ type: 'ap', id: 'ap-1' }),
            }),
        );
        expect(
            screen.getByText((content) => content.replace(/\s/g, '') === 'Rp600'),
        ).toBeTruthy();
    });

    it('maps an out-of-scope detail to notFound without inventing a desktop link', async () => {
        m.detail.mockResolvedValue({ success: false, code: 'NOT_FOUND' });
        await FinanceInvoiceDetail({
            params: Promise.resolve({ type: 'ar', id: 'missing' }),
        });
        expect(m.notFound).toHaveBeenCalledOnce();
    });
});
