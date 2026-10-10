// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WarehouseMobileDashboard } from '@/actions/dashboard/warehouse-mobile-dashboard';
import { WarehouseMobileHomeClient } from '../WarehouseMobileHomeClient';
vi.mock('@/components/mobile', () => ({ MobileDataFreshness: ({ generatedAt }: { generatedAt: string }) => <p>fresh:{generatedAt}</p> }));
afterEach(cleanup);
const a = <T,>(data: T) => ({ status: 'AVAILABLE' as const, data });
const data: WarehouseMobileDashboard = {
    generatedAt: '2026-10-10T03:00:00Z',
    loads: a({ loading: 2, pending: 3 }), receiving: a({ receivable: 4 }), materialQueue: a({ count: 6 }),
    todayShipped: a({ count: 5 }), todayReceived: a({ count: 7 }), todayMaterialIssues: a({ count: 11 }),
    loadingAttention: a({ total: 8, returned: 1, items: [{ id: 'do-1', number: 'DO-001', customerName: 'Customer A', deliveryDate: '2026-10-10T05:00:00Z', href: '/warehouse/mobile/outgoing/do-1' }] }),
    openOpname: a({ count: 9 }),
    links: { outgoing: '/warehouse/mobile/outgoing', incoming: '/warehouse/mobile/incoming', opname: '/warehouse/mobile/opname' },
};
describe('WarehouseMobileHomeClient', () => {
    it('renders freshness, every canonical fact, total/sample and server hrefs', () => {
        render(<WarehouseMobileHomeClient data={data} />);
        expect(screen.getByText('fresh:2026-10-10T03:00:00Z')).toBeTruthy();
        for (const label of ['DO Dikirim Hari Ini','Penerimaan Selesai','Material Produksi Keluar','Antrean Material Produksi','Menampilkan 1 dari 8 DO loading.']) expect(screen.getByText(label)).toBeTruthy();
        expect(screen.getByRole('link',{name:/DO-001/}).getAttribute('href')).toBe('/warehouse/mobile/outgoing/do-1');
        for (const link of screen.getAllByRole('link')) { expect(link.getAttribute('href')).toMatch(/^\/warehouse\/mobile/); expect(link.className).toContain('min-h-11'); }
        expect(screen.queryByText(/Rp|valuasi|akurasi|SLA/i)).toBeNull();
    });
    it('renders independent unavailable facts without zero', () => {
        render(<WarehouseMobileHomeClient data={{...data,loads:{status:'UNAVAILABLE',data:null},receiving:{status:'UNAVAILABLE',data:null},materialQueue:{status:'UNAVAILABLE',data:null},todayShipped:{status:'UNAVAILABLE',data:null},todayReceived:{status:'UNAVAILABLE',data:null},todayMaterialIssues:{status:'UNAVAILABLE',data:null},loadingAttention:{status:'UNAVAILABLE',data:null},openOpname:{status:'UNAVAILABLE',data:null}}} />);
        for (const label of ['Antrean muat tidak tersedia','Antrean penerimaan tidak tersedia','Antrean material produksi tidak tersedia','Pengiriman hari ini tidak tersedia','Penerimaan hari ini tidak tersedia','Material produksi keluar tidak tersedia','Verifikasi muat tidak tersedia','Opname aktif tidak tersedia']) expect(screen.getByText(label)).toBeTruthy();
    });
    it('renders material issues when shipped and received are hidden for nested access', () => {
        render(
            <WarehouseMobileHomeClient
                data={{
                    ...data,
                    todayShipped: { status: 'HIDDEN', data: null },
                    todayReceived: { status: 'HIDDEN', data: null },
                    todayMaterialIssues: a({ count: 11 }),
                }}
            />,
        );

        expect(screen.getByText('Material Produksi Keluar')).toBeTruthy();
        expect(screen.getByText('11')).toBeTruthy();
        expect(screen.queryByText(/Aktivitas hari ini tidak tersedia/)).toBeNull();
    });

    it('renders zero/empty as available and hides uncovered domains', () => {
        render(<WarehouseMobileHomeClient data={{...data,loads:a({loading:0,pending:0}),receiving:{status:'HIDDEN',data:null},materialQueue:a({count:0}),todayShipped:a({count:0}),todayReceived:{status:'HIDDEN',data:null},todayMaterialIssues:a({count:0}),loadingAttention:a({total:0,returned:0,items:[]}),openOpname:{status:'HIDDEN',data:null},links:{outgoing:'/warehouse/mobile/outgoing',incoming:null,opname:null}}} />);
        expect(screen.getByText('Tidak ada DO loading yang menunggu verifikasi.')).toBeTruthy();
        expect(screen.queryByText('Perlu Diterima')).toBeNull();
        expect(screen.queryByText('Opname Aktif')).toBeNull();
        expect(screen.queryByText(/tidak tersedia/)).toBeNull();
    });
});
