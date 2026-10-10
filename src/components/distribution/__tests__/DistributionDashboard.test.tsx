// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DistributionDashboardData } from '@/actions/distribution/dashboard';
import { DistributionDashboard } from '../DistributionDashboard';

function fixture(): DistributionDashboardData {
    return {
        generatedAt: '2026-10-10T00:00:00.000Z',
        snapshotAt: '2026-10-10T00:00:00.000Z',
        businessDate: '2026-10-10',
        health: {
            salesOrders: {
                state: 'AVAILABLE',
                data: { active: 123456789, readyToShip: 3 },
                href: '/sales/orders',
            },
            purchaseOrders: {
                state: 'AVAILABLE',
                data: { waitingReceipt: 5, sent: 4, partialReceived: 1 },
                href: '/purchasing/orders',
            },
            inventory: {
                state: 'AVAILABLE',
                data: { lowStock: 6, reorder: 7 },
                href: '/warehouse/inventory',
            },
            accountsReceivable: {
                state: 'AVAILABLE',
                data: { overdue: 8 },
                href: '/sales/invoices',
            },
            accountsPayable: {
                state: 'AVAILABLE',
                data: { overdue: 9 },
                href: '/purchasing/invoices',
            },
        },
        attention: {
            readyWithoutDo: {
                state: 'AVAILABLE',
                data: { count: 2 },
                href: '/sales/deliveries',
            },
        },
        drivers: { state: 'NOT_CONFIGURED', data: null },
        withheld: {
            operations: { state: 'NOT_CONFIGURED', data: null },
            financials: { state: 'NOT_CONFIGURED', data: null },
        },
        quickActionHrefs: [
            '/sales/orders',
            '/purchasing/orders',
            '/sales/deliveries',
            '/warehouse/inventory',
            '/sales/invoices',
        ],
    };
}

describe('DistributionDashboard', () => {
    it('renders Health → Attention → Drivers with exact whole-tenant copy, definitions, freshness, and counts', () => {
        render(<DistributionDashboard data={fixture()} />);

        const health = screen.getByText('Health');
        const attention = screen.getByText('Attention');
        const drivers = screen.getByText('Drivers');
        expect(
            health.compareDocumentPosition(attention) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            attention.compareDocumentPosition(drivers) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            screen.getByText('Kondisi seluruh operasi distribusi tenant'),
        ).toBeTruthy();
        expect(screen.getByText(/Diperbarui/)).toBeTruthy();
        expect(screen.getByText('Pesanan aktif')).toBeTruthy();
        expect(screen.getByText('Siap dikirim')).toBeTruthy();
        expect(screen.getByText('PO menunggu penerimaan')).toBeTruthy();
        expect(
            screen.getAllByText(/SENT 4 · PARTIAL_RECEIVED 1/),
        ).toHaveLength(2);
        expect(screen.getByText('Stok rendah')).toBeTruthy();
        expect(screen.getByText('Perlu dipesan ulang')).toBeTruthy();
        expect(screen.getByText('Piutang jatuh tempo')).toBeTruthy();
        expect(screen.getByText('Hutang jatuh tempo')).toBeTruthy();
        expect(screen.getByText('Siap kirim tanpa DO terbuka')).toBeTruthy();
        expect(screen.getByText('Antrean penerimaan PO')).toBeTruthy();
        expect(
            screen.getByText('Tekanan threshold stok internal'),
        ).toBeTruthy();
        expect(
            screen.getByText(/masih menunggu penerimaan/),
        ).toBeTruthy();
        expect(
            screen.getByText(/di bawah minStockAlert atau reorderPoint/),
        ).toBeTruthy();
        expect(screen.getByText(/CONFIRMED, IN_PRODUCTION/)).toBeTruthy();
        expect(
            screen.getByText(/hanya lokasi INTERNAL RAW_MATERIAL/),
        ).toBeTruthy();
        expect(screen.getByText(/123\.456\.789/)).toBeTruthy();
    });

    it('renders valid zero as AVAILABLE, partial failure as UNAVAILABLE, and hidden domains absent', () => {
        const data = fixture();
        data.health.salesOrders = {
            state: 'AVAILABLE',
            data: { active: 0, readyToShip: 0 },
            href: '/sales/orders',
        };
        data.health.purchaseOrders = {
            state: 'UNAVAILABLE',
            data: null,
            href: '/purchasing/orders',
        };
        data.health.inventory = { state: 'HIDDEN', data: null, href: null };
        data.health.accountsReceivable = {
            state: 'HIDDEN',
            data: null,
            href: null,
        };
        data.health.accountsPayable = {
            state: 'HIDDEN',
            data: null,
            href: null,
        };
        data.attention.readyWithoutDo = {
            state: 'AVAILABLE',
            data: { count: 0 },
            href: '/sales/deliveries',
        };

        render(<DistributionDashboard data={data} />);

        expect(screen.getAllByText('0')).toHaveLength(3);
        expect(screen.getAllByText('UNAVAILABLE')).toHaveLength(2);
        expect(screen.queryByText('Stok rendah')).toBeNull();
        expect(
            screen.queryByText('Tekanan threshold stok internal'),
        ).toBeNull();
        expect(screen.getByText('Antrean penerimaan PO')).toBeTruthy();
        expect(screen.queryByText('Piutang jatuh tempo')).toBeNull();
        expect(screen.getByText('Pesanan aktif')).toBeTruthy();
        expect(screen.getByText('Siap kirim tanpa DO terbuka')).toBeTruthy();
    });

    it('renders whole-action failure explicitly without synthetic zero or legacy links', () => {
        render(<DistributionDashboard data={null} />);

        expect(
            screen.getByText('Dashboard Distribution tidak tersedia'),
        ).toBeTruthy();
        expect(
            screen.getByText(/Angka kosong tidak dianggap nol/),
        ).toBeTruthy();
        expect(screen.queryByText('0')).toBeNull();
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('keeps Drivers and unsupported operations/finance visibly NOT_CONFIGURED', () => {
        render(<DistributionDashboard data={fixture()} />);

        expect(
            screen.getByText(/Driver operasional belum dikonfigurasi/),
        ).toBeTruthy();
        expect(
            screen.getByText(/Fulfillment dan pengecualian lifecycle ditahan/),
        ).toBeTruthy();
        expect(
            screen.getByText(/pengiriman terlambat, PO terlambat/),
        ).toBeTruthy();
        expect(
            screen.getByText(/Metrik keuangan ditahan/),
        ).toBeTruthy();
        expect(
            screen.getByText(/tidak ada discriminator baris/),
        ).toBeTruthy();
    });

    it('renders only server-projected legacy destinations as 44px focusable secondary actions', () => {
        const data = fixture();
        data.quickActionHrefs = [
            '/sales/orders',
            '/sales/deliveries',
            '/sales/invoices',
        ];
        data.health.purchaseOrders = {
            state: 'HIDDEN',
            data: null,
            href: null,
        };
        data.health.inventory = { state: 'HIDDEN', data: null, href: null };
        data.health.accountsPayable = {
            state: 'HIDDEN',
            data: null,
            href: null,
        };

        render(<DistributionDashboard data={data} />);

        const quickActionNav = screen.getByRole('navigation', {
            name: 'Aksi cepat Distribution',
        });
        const links = Array.from(quickActionNav.querySelectorAll('a'));
        expect(links.map((link) => link.getAttribute('href'))).toEqual([
            '/sales/orders',
            '/sales/deliveries',
            '/sales/invoices',
        ]);
        for (const link of links) {
            expect(link.className).toContain('min-h-11');
            expect(link.className).toContain('focus-visible:ring-2');
        }
        expect(
            screen.queryByRole('link', { name: 'Order Pembelian (PO)' }),
        ).toBeNull();
        expect(screen.queryByRole('link', { name: 'Stok' })).toBeNull();
        const allHrefs = screen
            .queryAllByRole('link')
            .map((link) => link.getAttribute('href'));
        expect(allHrefs).not.toContain('/purchasing/orders');
        expect(allHrefs).not.toContain('/purchasing/invoices');
        expect(allHrefs).not.toContain('/warehouse/inventory');
    });

    it('does not render segment claims, nominal values, ratios, SLA, severity, or identities', () => {
        render(<DistributionDashboard data={fixture()} />);

        const visible = document.body.textContent?.toLowerCase() ?? '';
        for (const forbidden of [
            'segmen distribution',
            'profit',
            'nominal',
            'rp ',
            'harga',
            'biaya',
            'belanja',
            'kredit',
            'rasio ',
            'target',
            'sla',
            'severity',
            'customer',
            'supplier',
            'so-001',
            'po-001',
            'inv-001',
        ]) {
            expect(visible).not.toContain(forbidden);
        }
    });
});
