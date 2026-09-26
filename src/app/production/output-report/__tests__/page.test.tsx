// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Page from '../page';
import { ReportView } from '../ReportView';
import ErrorView from '../error';
import Loading from '../loading';
import { orderRowFixture, reportFixture } from './fixtures';
import { OutputReportFilterError } from '@/lib/production/output-report';

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../load-report', () => ({ loadOutputReport: load }));
vi.mock('../ReportFilters', () => ({ ReportFilters: () => <div>Filter</div> }));
vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }: React.ComponentProps<'a'> & { prefetch?: boolean }) => <a {...props}>{children}</a> }));
afterEach(cleanup);
beforeEach(() => {
    load.mockReset();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

describe('output report page and view', () => {
    it('renders WIP recap, full period count, operators and filtered drilldown', async () => {
        const report = reportFixture();
        report.filter.machineId = 'machine-test';
        load.mockResolvedValue({ report, canViewOrders: true });
        render(await Page({ searchParams: Promise.resolve({}) }));
        expect(screen.getByRole('heading', { name: 'Rekap Hasil Produksi' })).toBeTruthy();
        expect(screen.getByText('Setengah jadi (WIP)')).toBeTruthy();
        expect(screen.getByText(/501 entri sesuai filter/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Info cakupan laporan hasil' }));
        expect((await screen.findByRole('tooltip')).textContent).toContain('bukan hanya halaman tabel ini');
        const href = screen.getByRole('link', { name: 'Rincian Hitam' }).getAttribute('href')!;
        const params = new URL(href, 'http://localhost').searchParams;
        expect(params.get('productVariantId')).toBe('variant-test');
        expect(params.get('process')).toBe('EXTRUSION');
        expect(params.get('machineId')).toBe('machine-test');
        expect(params.get('mode')).toBe('entries');
        expect(screen.getByRole('link', { name: 'Operator Uji' }).getAttribute('href')).toContain('operatorId=operator-test');
    });
    it('renders operator recap, unknown scrap and page navigation', () => {
        const report = reportFixture();
        report.filter = { ...report.filter, mode: 'operator', page: 2 };
        report.rows[0] = { ...report.rows[0], scrapKg: null, operatorId: 'operator-test' };
        report.pageCount = 3;
        render(<ReportView report={report} canViewOrders={false} today="2026-09-16" />);
        expect(screen.getByLabelText('Satuan affal belum dapat dipastikan')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Sebelumnya' }).getAttribute('href')).toContain('page=1');
        expect(screen.getByRole('link', { name: 'Berikutnya' }).getAttribute('href')).toContain('page=3');
        expect(screen.getByRole('link', { name: 'Rincian Hitam' }).getAttribute('href')).toContain('operatorId=operator-test');
    });
    it('renders details with timestamps, input units and permission-aware order links', () => {
        const report = reportFixture();
        report.filter.mode = 'entries';
        report.rows = [];
        report.entries = [{
            ...reportFixture().rows[0], id: 'entry-test', orderId: 'order-test', orderNumber: 'SPK-TEST',
            startTime: '2026-09-02T16:00:00Z', endTime: null,
            operatorId: 'operator-test', operatorName: 'Operator Uji', operatorSource: 'shift',
            machineId: 'machine-test', machineName: 'EX-01', category: 'REWORK', process: 'OTHER',
            scrapKg: null, scrapRaw: '3', enteredQuantity: '2', enteredUnit: 'BAL',
        }];
        const view = render(<ReportView report={report} canViewOrders={false} today="2026-09-16" />);
        expect(screen.getByText('02/09/2026 23:00')).toBeTruthy();
        expect(screen.getByText('Dari shift')).toBeTruthy();
        expect(screen.getByText('Input: 2 BAL')).toBeTruthy();
        expect(screen.queryByRole('link', { name: 'SPK-TEST' })).toBeNull();
        report.entries[0].endTime = '2026-09-02T18:00:00Z';
        view.rerender(<ReportView report={report} canViewOrders today="2026-09-16" />);
        expect(screen.getByRole('link', { name: 'SPK-TEST' }).getAttribute('href')).toBe('/production/orders/order-test');
        expect(screen.getByText('Selesai: 03/09/2026 01:00')).toBeTruthy();
    });
    it('renders SPK target recap with cumulative progress and honest edge labels', () => {
        const report = reportFixture();
        report.filter.mode = 'order';
        report.rows = [];
        report.orders = [
            orderRowFixture(),
            orderRowFixture({ orderId: 'order-over', orderNumber: 'SPK-OVER', target: '500',
                producedInPeriod: '0', producedCumulative: '600', difference: '100', achievement: '120' }),
            orderRowFixture({ orderId: 'order-none', orderNumber: 'SPK-NONE', hasTarget: false, target: '0',
                producedInPeriod: '40', producedCumulative: '40', difference: null, achievement: null }),
        ];
        render(<ReportView report={report} canViewOrders today="2026-09-16" />);
        expect(screen.getByRole('link', { name: 'SPK-TEST' }).getAttribute('href')).toBe('/production/orders/order-test');
        expect(screen.getByText('1.000 KG')).toBeTruthy();
        expect(screen.getByText('800 KG')).toBeTruthy();
        expect(screen.getByText('600 KG')).toBeTruthy();
        expect(screen.getByText('80%')).toBeTruthy();
        expect(screen.getByText('120%')).toBeTruthy();
        expect(screen.getByText('Tanpa target')).toBeTruthy();
        expect(screen.getByText(/bukan target harian/)).toBeTruthy();
    });
    it('renders empty results without implying unsupported products', () => {
        const report = reportFixture();
        report.rows = []; report.totalRows = 0; report.summary.totals = [];
        render(<ReportView report={report} canViewOrders={false} today="2026-09-16" />);
        expect(screen.getByText('Tidak ada hasil produksi sesuai filter.')).toBeTruthy();
    });
    it('renders safe filter errors, propagates redirects and DB errors', async () => {
        load.mockRejectedValue(new OutputReportFilterError('Tanggal tidak valid'));
        render(await Page({ searchParams: Promise.resolve({}) }));
        expect(screen.getByRole('alert').textContent).toBe('Tanggal tidak valid');
        load.mockRejectedValue(new Error('redirect'));
        await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect');
    });
    it('provides loading and retry feedback without exposing errors as zero output', () => {
        const reset = vi.fn();
        render(<><Loading /><ErrorView reset={reset} /></>);
        expect(screen.getByRole('status').textContent).toContain('Memuat');
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(reset).toHaveBeenCalledOnce();
        expect(screen.getByRole('alert').textContent).toContain('bukan berarti');
    });
});
