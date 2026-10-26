// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KioskJobCard } from '@/services/production/kiosk-job-service';

const { mockRefresh, scanner } = vi.hoisted(() => ({
    mockRefresh: vi.fn(),
    scanner: { onScan: null as null | ((code: string) => void) },
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: mockRefresh }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/actions/app/refresh-actions', () => ({ refreshKioskData: vi.fn() }));
vi.mock('@/hooks/useBarcodeScanner', () => ({
    useBarcodeScanner: (onScan: (code: string) => void) => {
        scanner.onScan = onScan;
    },
}));
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));

import KioskJobList from '../KioskJobList';

const card = (overrides: Partial<KioskJobCard>): KioskJobCard => ({
    id: 'spk-1',
    orderNumber: 'WO-001',
    status: 'IN_PROGRESS',
    isRunning: false,
    productName: 'Tali Rafia 1 kg',
    unit: { primaryUnit: 'KG', salesUnit: null, conversionFactor: 1 },
    plannedQuantity: 200,
    plannedEnteredQuantity: null,
    plannedEnteredUnit: null,
    plannedConversionFactorSnapshot: null,
    actualQuantity: 80,
    executionMode: 'GENERIC',
    machine: { id: 'm-2', name: 'Mesin 2' },
    packaging: null,
    ...overrides,
});

const jobs = [
    card({ isRunning: true, packaging: { labelName: 'Etiket Merek A', labelStock: 3200 } }),
    card({ id: 'spk-2', orderNumber: 'WO-002', productName: 'Tali Rafia Polos 5 kg', status: 'RELEASED', actualQuantity: 0 }),
    card({ id: 'spk-3', orderNumber: 'WO-003', productName: 'Baling', machine: null }),
];
const machines = [{ id: 'm-2', name: 'Mesin 2' }];
const employees = [{ id: 'op-1', name: 'Operator 1', machineIds: [] }];

beforeEach(() => {
    sessionStorage.setItem('kiosk_operator_id', 'op-1');
});
afterEach(() => {
    cleanup();
    sessionStorage.clear();
});

const cardLinks = () => screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/kiosk/jobs/'));

describe('KioskJobList', () => {
    it('makes each SPK card a single link to Fokus SPK, with its etiket stock', () => {
        render(<KioskJobList jobs={jobs} employees={employees} machines={machines} />);

        expect(cardLinks().map((link) => link.getAttribute('href'))).toEqual(['/kiosk/jobs/spk-1', '/kiosk/jobs/spk-2', '/kiosk/jobs/spk-3']);
        expect(cardLinks()[0].querySelector('button')).toBeNull();
        expect(cardLinks()[0].textContent).toMatch(/Berjalan.*Etiket Merek A · stok 3\.200 lbr.*Buka/);
    });

    it('searches by SPK number or product, also from the barcode scanner', () => {
        render(<KioskJobList jobs={jobs} employees={employees} machines={machines} />);

        fireEvent.change(screen.getByRole('searchbox', { name: 'Cari atau scan nomor SPK' }), { target: { value: 'polos' } });
        expect(cardLinks()).toHaveLength(1);

        act(() => scanner.onScan?.('WO-003'));
        expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('WO-003');
        expect(cardLinks().map((link) => link.getAttribute('href'))).toEqual(['/kiosk/jobs/spk-3']);
    });

    it('filters SPKs without a machine through a button, not a native select', () => {
        render(<KioskJobList jobs={jobs} employees={employees} machines={machines} />);

        expect(screen.queryByRole('combobox')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Tanpa mesin' }));

        expect(cardLinks().map((link) => link.getAttribute('href'))).toEqual(['/kiosk/jobs/spk-3']);
    });
});
