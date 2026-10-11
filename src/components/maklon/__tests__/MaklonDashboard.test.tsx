// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MaklonDashboardData } from '@/actions/maklon/maklon-dashboard';
import { MaklonDashboard } from '../MaklonDashboard';

function count(count: number) {
    return { state: 'AVAILABLE' as const, data: { count } };
}

function dataFixture(): MaklonDashboardData {
    return {
        generatedAt: '2026-10-10T00:00:00.000Z',
        snapshotAt: '2026-10-10T00:00:00.000Z',
        workDate: '2026-10-10',
        health: {
            inProgress: count(3),
            completedToday: count(2),
            outputTodayByUnit: {
                state: 'AVAILABLE',
                data: {
                    groups: [
                        { unit: 'BAL', quantity: 2.5 },
                        { unit: 'KG', quantity: 123456789.1234 },
                    ],
                },
            },
        },
        attention: {
            waitingMaterial: count(4),
            pastPlannedEnd: count(1),
        },
        drivers: { state: 'NOT_CONFIGURED', data: null },
        withheld: {
            materials: { state: 'NOT_CONFIGURED', data: null },
            financials: { state: 'NOT_CONFIGURED', data: null },
        },
        quickActionHrefs: [
            '/maklon/receipts',
            '/maklon/returns',
            '/maklon/returns/create',
            '/warehouse/incoming/create-maklon',
        ],
    };
}

describe('MaklonDashboard', () => {
    it('renders condition → attention → direction with freshness, unit groups, and safe quick actions', () => {
        render(<MaklonDashboard data={dataFixture()} />);

        const health = screen.getByText('Kondisi');
        const attention = screen.getByText('Perlu perhatian');
        const drivers = screen.getByText('Arah utama');
        expect(
            health.compareDocumentPosition(attention) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            attention.compareDocumentPosition(drivers) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(screen.getByText(/Diperbarui/)).toBeTruthy();
        expect(screen.getByText('SPK sedang berjalan')).toBeTruthy();
        expect(screen.getByText('Selesai hari ini')).toBeTruthy();
        expect(screen.getByText('Output hari ini per unit')).toBeTruthy();
        expect(screen.getByText('Menunggu material')).toBeTruthy();
        expect(screen.getByText('Lewat rencana selesai')).toBeTruthy();
        expect(
            screen.getByRole('button', {
                name: 'Penjelasan Lewat rencana selesai',
            }),
        ).toBeTruthy();
        expect(screen.getByText(/123\.456\.789,1234/)).toBeTruthy();
        expect(screen.getByText('BAL')).toBeTruthy();
        expect(screen.getByText('KG')).toBeTruthy();

        expect(
            screen
                .getByRole('link', { name: /Penerimaan bahan/i })
                .getAttribute('href'),
        ).toBe('/maklon/receipts');
        expect(
            screen
                .getByRole('link', { name: /Retur bahan/i })
                .getAttribute('href'),
        ).toBe('/maklon/returns');
        expect(
            screen
                .getByRole('link', { name: /Buat retur/i })
                .getAttribute('href'),
        ).toBe('/maklon/returns/create');
        expect(
            screen
                .getByRole('link', { name: /Buat penerimaan/i })
                .getAttribute('href'),
        ).toBe('/warehouse/incoming/create-maklon');
        expect(
            screen.queryByRole('link', { name: /Portal gudang/i }),
        ).toBeNull();
    });

    it('renders valid zero and empty output as AVAILABLE rather than unavailable', () => {
        const data = dataFixture();
        data.health.inProgress = count(0);
        data.health.completedToday = count(0);
        data.health.outputTodayByUnit = {
            state: 'AVAILABLE',
            data: { groups: [] },
        };
        data.attention.waitingMaterial = count(0);
        data.attention.pastPlannedEnd = count(0);

        render(<MaklonDashboard data={data} />);

        expect(screen.getAllByText('0')).toHaveLength(4);
        expect(
            screen.getByText(/Belum ada output tercatat pada hari bisnis ini/),
        ).toBeTruthy();
        expect(
            screen.queryByText('Dashboard Maklon tidak tersedia'),
        ).toBeNull();
    });

    it('renders independent partial failures without synthetic values while successful peers survive', () => {
        const data = dataFixture();
        data.health.completedToday = { state: 'UNAVAILABLE', data: null };
        data.health.outputTodayByUnit = { state: 'UNAVAILABLE', data: null };
        data.attention.pastPlannedEnd = { state: 'UNAVAILABLE', data: null };

        render(<MaklonDashboard data={data} />);

        expect(screen.getAllByText('Data tidak tersedia')).toHaveLength(3);
        expect(screen.getByText('3')).toBeTruthy();
        expect(screen.getByText('4')).toBeTruthy();
        expect(screen.queryByText('0')).toBeNull();
        expect(
            screen.getByText(/Pendorong material belum disiapkan/),
        ).toBeTruthy();
        expect(
            screen.getByText(
                /Rekonsiliasi dan antrean material belum disiapkan/,
            ),
        ).toBeTruthy();
        expect(
            screen.getByText(/Metrik keuangan belum disiapkan/),
        ).toBeTruthy();
    });

    it('renders whole-action failure explicitly without the old static hub or synthetic zeroes', () => {
        render(<MaklonDashboard data={null} />);

        expect(
            screen.getByText('Dashboard Maklon tidak tersedia'),
        ).toBeTruthy();
        expect(
            screen.getByText(/Angka kosong tidak dianggap nol/),
        ).toBeTruthy();
        expect(screen.queryByText('Penerimaan bahan')).toBeNull();
        expect(screen.queryByText('0')).toBeNull();
    });

    it('explains both withheld material and financial blocks in plain language', () => {
        render(<MaklonDashboard data={dataFixture()} />);

        expect(
            screen.getByText(
                /Rekonsiliasi dan antrean material belum disiapkan/,
            ),
        ).toBeTruthy();
        expect(
            screen.getByText(/Penerimaan, pemakaian, sisa, retur, dan antrean/),
        ).toBeTruthy();
        expect(
            screen.getByText(
                /Metrik keuangan belum disiapkan/,
            ),
        ).toBeTruthy();
        expect(
            screen.getByText(
                /Pendapatan jasa, biaya konversi, dan margin ditahan/,
            ),
        ).toBeTruthy();
    });

    it('renders long values and only payload-provided safe links with focusable near-44px targets', () => {
        const data = dataFixture();
        data.quickActionHrefs = [
            '/maklon/receipts',
            '/maklon/returns',
            '/maklon/returns/create',
            '/warehouse',
        ];

        render(<MaklonDashboard data={data} />);

        const links = screen.getAllByRole('link');
        expect(links.map((link) => link.getAttribute('href'))).toEqual([
            '/maklon/receipts',
            '/maklon/returns',
            '/maklon/returns/create',
            '/warehouse',
        ]);
        for (const link of links) {
            expect(link.className).toContain('min-h-11');
            expect(link.className).toContain('focus-visible:ring-2');
        }
        expect(screen.getByText(/123\.456\.789,1234/)).toBeTruthy();
    });

    it('does not render identity, order-number, nominal, target, SLA, or severity labels', () => {
        render(<MaklonDashboard data={dataFixture()} />);

        const visible = document.body.textContent?.toLowerCase() ?? '';
        for (const forbidden of [
            'customer name',
            'customer id',
            'order number',
            'nominal',
            'invoice',
            'harga',
            'target',
            'sla',
            'promised',
            'severity',
        ]) {
            expect(visible).not.toContain(forbidden);
        }
        expect(screen.queryByText('Synthetic Customer')).toBeNull();
        expect(screen.queryByText('SPK-001')).toBeNull();
        expect(screen.queryByText('Rp 1.000.000')).toBeNull();
    });
});
