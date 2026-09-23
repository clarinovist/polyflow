// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleListClient } from '../ScheduleListClient';

const mocks = vi.hoisted(() => ({ create: vi.fn(), refresh: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/actions/sales/delivery-schedules', () => ({ createDeliverySchedule: mocks.create }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));

type Row = ComponentProps<typeof ScheduleListClient>['schedules'][number];
function row(status: string, overrides: Partial<Row> = {}): Row {
    return { id: status, scheduleNumber: `JADWAL-DEMO-${status}`, weekStart: '2026-09-21T00:00:00Z', weekEnd: '2026-09-27T23:59:59Z', status, vehicles: [], ...overrides };
}
beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-23T10:00:00Z'));
    mocks.create.mockResolvedValue({ success: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('delivery schedule list', () => {
    it('returns focus to Jadwal Baru when the dialog is dismissed with Escape', async () => {
        render(<ScheduleListClient schedules={[]} />);
        const trigger = screen.getByRole('button', { name: 'Jadwal Baru' });
        fireEvent.click(trigger);
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(document.activeElement).toBe(trigger);
    });

    it('combines active aliases, trimmed case-insensitive search and current-week filtering', () => {
        render(<ScheduleListClient schedules={[
            row('ACTIVE'), row('CONFIRMED'), row('IN_TRANSIT'), row('DRAFT'),
            row('ACTIVE', { id: 'old', scheduleNumber: 'JADWAL-OLD', weekStart: '2026-08-03', weekEnd: '2026-08-09' }),
        ]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Aktif' }));
        expect(screen.getByRole('status').textContent).toBe('Menampilkan 4 dari 5 jadwal');
        fireEvent.click(screen.getByRole('button', { name: 'Minggu Ini' }));
        expect(screen.getByRole('status').textContent).toBe('Menampilkan 3 dari 5 jadwal');
        fireEvent.change(screen.getByRole('textbox', { name: 'Cari nomor jadwal' }), { target: { value: '  demo-confirmed  ' } });
        expect(screen.getByRole('status').textContent).toBe('Menampilkan 1 dari 5 jadwal');
        expect(within(screen.getByRole('table')).getByText('JADWAL-DEMO-CONFIRMED')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Reset Filter' }));
        expect(screen.getByRole('status').textContent).toBe('Menampilkan 5 dari 5 jadwal');
        expect(screen.getByRole('button', { name: 'Semua' }).getAttribute('aria-pressed')).toBe('true');
    });

    it.each([
        ['2026-09-21T10:00:00Z', 1], ['2026-09-27T10:00:00Z', 1], ['2026-09-28T10:00:00Z', 0],
    ])('includes current-week boundaries at %s', (now, count) => {
        vi.setSystemTime(new Date(now));
        // API supplies full timestamps, with weekEnd at the end of Sunday,
        // not a date-only string interpreted as UTC midnight.
        render(<ScheduleListClient schedules={[row('ACTIVE', {
            weekStart: new Date(2026, 8, 21).toISOString(),
            weekEnd: new Date(2026, 8, 27, 23, 59, 59).toISOString(),
        })]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Minggu Ini' }));
        expect(screen.getByRole('status').textContent).toBe(`Menampilkan ${count} dari 1 jadwal`);
    });

    it('distinguishes no matching filter from no schedules and resets without dispatching', () => {
        const view = render(<ScheduleListClient schedules={[row('DRAFT')]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Aktif' }));
        expect(screen.getByText('Tidak ada jadwal yang cocok')).toBeTruthy();
        expect(screen.queryByText('Belum ada jadwal kirim')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Reset Filter' }));
        expect(screen.getByRole('table')).toBeTruthy();
        view.rerender(<ScheduleListClient schedules={[]} />);
        expect(screen.getByText('Belum ada jadwal kirim')).toBeTruthy();
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('preserves trip/stop/unlinked counts and exact navigation IDs on desktop and mobile', () => {
        render(<ScheduleListClient schedules={[row('DRAFT', { vehicles: [
            { orders: [{ id: 'one', status: 'GENERATED', deliveryOrderId: 'do' }, { id: 'two', status: 'CANCELLED', deliveryOrderId: null }] },
            { orders: [{ id: 'three', status: 'PLANNED', deliveryOrderId: null }] },
        ] })]} />);
        const cells = within(screen.getByRole('table')).getAllByRole('cell');
        expect(cells[2].textContent).toBe('2');
        expect(cells[3].textContent).toBe('3');
        expect(cells[4].textContent).toContain('2');
        expect(screen.queryByRole('columnheader', { name: 'Dibuat Oleh' })).toBeNull();
        expect(screen.getAllByRole('link', { name: 'Buka JADWAL-DEMO-DRAFT' }).map(link => link.getAttribute('href'))).toEqual(['/sales/delivery-schedules/DRAFT', '/sales/delivery-schedules/DRAFT']);
    });

    it('shows a retryable load failure without empty state or create controls', () => {
        render(<ScheduleListClient schedules={[]} loadError />);
        expect(screen.getByRole('alert').textContent).toBe('Gagal memuat jadwal kirim.');
        expect(screen.queryByText('Belum ada jadwal kirim')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Jadwal Baru' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Coba Lagi' }));
        expect(mocks.refresh).toHaveBeenCalledOnce();
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it.each([
        ['2026-09-23', 'Senin, 21 Sep 2026 — Minggu, 27 Sep 2026'],
        ['2026-09-27', 'Senin, 21 Sep 2026 — Minggu, 27 Sep 2026'],
        ['2027-01-01', 'Senin, 28 Des 2026 — Minggu, 3 Jan 2027'],
    ])('previews the Monday–Sunday period for %s without changing the submitted date', async (date, preview) => {
        render(<ScheduleListClient schedules={[]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Jadwal Baru' }));
        const dialog = within(screen.getByRole('dialog'));
        expect((dialog.getByRole('button', { name: 'Buat Jadwal' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(dialog.getByLabelText('Tanggal dalam minggu'), { target: { value: date } });
        expect(dialog.getByRole('status').textContent).toContain(preview);
        fireEvent.click(dialog.getByRole('button', { name: 'Buat Jadwal' }));
        await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ weekStart: new Date(date) }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
        expect(screen.queryByRole('dialog')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Jadwal Baru' }));
        expect(screen.getByLabelText('Tanggal dalam minggu')).toHaveProperty('value', '');
    });

    it('retains the selected date on action rejection or exception without success/refresh', async () => {
        mocks.create.mockResolvedValueOnce({ success: false, error: 'Synthetic duplicate week' }).mockRejectedValueOnce(new Error('Synthetic network'));
        render(<ScheduleListClient schedules={[]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Jadwal Baru' }));
        fireEvent.change(screen.getByLabelText('Tanggal dalam minggu'), { target: { value: '2026-09-23' } });
        fireEvent.click(screen.getByRole('button', { name: 'Buat Jadwal' }));
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Synthetic duplicate week'));
        expect(screen.getByLabelText('Tanggal dalam minggu')).toHaveProperty('value', '2026-09-23');
        fireEvent.click(screen.getByRole('button', { name: 'Buat Jadwal' }));
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Gagal membuat jadwal. Silakan coba lagi.'));
        expect(mocks.refresh).not.toHaveBeenCalled();
        expect(mocks.success).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('disables repeat submission while creating and completes once', async () => {
        let resolve!: (value: { success: boolean }) => void;
        mocks.create.mockReturnValue(new Promise(done => { resolve = done; }));
        render(<ScheduleListClient schedules={[]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Jadwal Baru' }));
        fireEvent.change(screen.getByLabelText('Tanggal dalam minggu'), { target: { value: '2026-09-23' } });
        fireEvent.click(screen.getByRole('button', { name: 'Buat Jadwal' }));
        expect((screen.getByRole('button', { name: 'Membuat...' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Membuat...' }));
        expect(mocks.create).toHaveBeenCalledOnce();
        await act(async () => resolve({ success: true }));
        expect(mocks.refresh).toHaveBeenCalledOnce();
    });

    it('includes both persisted completed statuses under Selesai', () => {
        render(<ScheduleListClient schedules={[row('CLOSED'), row('COMPLETED'), row('DRAFT')]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Selesai' }));
        const table = within(screen.getByRole('table'));
        expect(table.getByText('JADWAL-DEMO-CLOSED')).toBeTruthy();
        expect(table.getByText('JADWAL-DEMO-COMPLETED')).toBeTruthy();
        expect(table.queryByText('JADWAL-DEMO-DRAFT')).toBeNull();
    });
});
