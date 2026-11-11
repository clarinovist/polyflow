// @vitest-environment jsdom

import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { AttendanceStalePanel } from '../AttendanceStalePanel';
import { CLOSURE_MAX_BATCH } from '../stale-closure-types';
import type { StaleSessionsState } from '../useStaleOpenSessions';

const SESSIONS = [
    {
        id: 'r1',
        employeeId: 'e1',
        employeeName: 'Budi Contoh',
        employeeCode: 'E001',
        workDate: '2026-11-09',
        // 07:05 WIB
        clockInAt: '2026-11-09T00:05:00.000Z',
        shift: { id: 's1', name: 'Pagi', startTime: '07:00', endTime: '15:00' },
        openHours: 30.5,
    },
    {
        id: 'r2',
        employeeId: 'e2',
        employeeName: 'Siti Contoh',
        employeeCode: 'E002',
        workDate: '2026-11-08',
        clockInAt: '2026-11-08T13:00:00.000Z',
        shift: { id: 's2', name: 'Malam', startTime: '20:00', endTime: '08:00' },
        openHours: 48,
    },
];

const ready = (sessions = SESSIONS, truncated = false): StaleSessionsState => ({
    status: 'ready',
    data: { sessions, truncated },
});

function setup(
    state: StaleSessionsState,
    props: Partial<React.ComponentProps<typeof AttendanceStalePanel>> = {},
) {
    const onRetry = vi.fn();
    const onCorrect = vi.fn();
    render(
        <AttendanceStalePanel
            state={state}
            query=""
            onRetry={onRetry}
            onCorrect={onCorrect}
            {...props}
        />,
    );
    return { onRetry, onCorrect };
}

describe('AttendanceStalePanel', () => {
    it('shows a loading status while the list loads', () => {
        setup({ status: 'loading' });

        expect(screen.getByRole('status').textContent).toMatch(/Memuat/);
    });

    it('shows an error with a retry button instead of an empty list', () => {
        const { onRetry } = setup({
            status: 'error',
            message: 'Gagal memuat sesi belum pulang',
        });

        expect(screen.getByRole('alert').textContent).toContain(
            'Gagal memuat sesi belum pulang',
        );
        expect(screen.queryByText(/Tidak ada sesi/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('states plainly that nothing is open when the list is empty', () => {
        setup(ready([]));

        expect(
            screen.getByText('Tidak ada sesi yang belum pulang'),
        ).toBeTruthy();
    });

    it('lists each session with work date, clock-in, shift and open hours', () => {
        setup(ready());

        const row = screen.getByText('Budi Contoh').closest('li') as HTMLElement;
        expect(within(row).getByText('E001')).toBeTruthy();
        expect(within(row).getByText(/Pagi \(07:00–15:00\)/)).toBeTruthy();
        expect(within(row).getByText(/9 Nov 2026/)).toBeTruthy();
        expect(within(row).getByText(/07\.05/)).toBeTruthy();
        expect(within(row).getByText('Terbuka 30,5 jam')).toBeTruthy();
        expect(within(row).getByText('Lupa pulang')).toBeTruthy();
        expect(screen.getByText('Siti Contoh')).toBeTruthy();
        expect(screen.getByText('Terbuka 48 jam')).toBeTruthy();
    });

    it('shows the title and how many sessions are listed', () => {
        setup(ready());

        expect(screen.getByText('Sesi belum pulang')).toBeTruthy();
        expect(screen.getByText(/· 2 sesi/)).toBeTruthy();
    });

    it('warns when the list was cut off at the limit', () => {
        setup(ready(SESSIONS, true));

        expect(screen.getByText(/sebagian sesi lebih lama tidak ditampilkan/i)).toBeTruthy();
    });

    it('does not warn about truncation when the list is complete', () => {
        setup(ready());

        expect(screen.queryByText(/tidak ditampilkan/i)).toBeNull();
    });

    it('filters by the search query on name or code', () => {
        setup(ready(), { query: 'e002' });

        expect(screen.queryByText('Budi Contoh')).toBeNull();
        expect(screen.getByText('Siti Contoh')).toBeTruthy();
    });

    it('says nothing matches when the query excludes everyone', () => {
        setup(ready(), { query: 'zzz' });

        expect(screen.getByText(/Tidak ada karyawan yang cocok/)).toBeTruthy();
    });

    it('hands the chosen session to the correction callback', () => {
        const { onCorrect } = setup(ready());

        fireEvent.click(
            screen.getAllByRole('button', { name: /Koreksi jam/ })[1],
        );

        expect(onCorrect).toHaveBeenCalledWith(SESSIONS[1]);
    });
});

const manySessions = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        ...SESSIONS[0],
        id: `m${i}`,
        employeeId: `em${i}`,
        employeeName: `Karyawan ${i}`,
        employeeCode: `K${i}`,
    }));

describe('AttendanceStalePanel bulk closure controls', () => {
    const bulk = (
        state: StaleSessionsState = ready(),
        props: Partial<React.ComponentProps<typeof AttendanceStalePanel>> = {},
    ) => {
        const onPreviewClosure = vi.fn();
        const utils = setup(state, {
            canBulkClose: true,
            onPreviewClosure,
            ...props,
        });
        return { onPreviewClosure, ...utils };
    };
    const previewBtn = () =>
        screen.getByRole('button', { name: /Pratinjau koreksi/ }) as HTMLButtonElement;

    it('hides every bulk control for roles that cannot bulk close', () => {
        setup(ready());

        expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
        expect(screen.queryByRole('radiogroup')).toBeNull();
        expect(screen.queryByRole('button', { name: /Pratinjau koreksi/ })).toBeNull();
        expect(screen.getAllByRole('button', { name: /Koreksi jam/ })).toHaveLength(2);
    });

    it('shows a checkbox per row and a select-all box when allowed', () => {
        bulk();

        expect(screen.getAllByRole('checkbox')).toHaveLength(3);
        expect(screen.getByRole('checkbox', { name: 'Pilih semua yang tampil' })).toBeTruthy();
        expect(screen.getByRole('checkbox', { name: 'Pilih Budi Contoh' })).toBeTruthy();
    });

    it('disables the preview button until something is selected and counts the selection', () => {
        bulk();

        expect(previewBtn().disabled).toBe(true);
        expect(previewBtn().textContent).toContain('(0)');
        fireEvent.click(screen.getByRole('checkbox', { name: 'Pilih Budi Contoh' }));
        expect(previewBtn().disabled).toBe(false);
        expect(previewBtn().textContent).toContain('(1)');
    });

    it('offers the two policies with plain explanations, defaulting to end of shift', () => {
        bulk();

        const radios = screen.getAllByRole('radio');
        expect(radios).toHaveLength(2);
        expect(radios[0].getAttribute('aria-checked')).toBe('true');
        expect(screen.getByText('Akhir shift terjadwal')).toBeTruthy();
        expect(screen.getByText(/jam selesai shift pada tanggal kerja/)).toBeTruthy();
        expect(screen.getByText('Jam masuk + durasi terjadwal')).toBeTruthy();
        expect(screen.getByText(/jam masuk ditambah jam kerja terjadwal/)).toBeTruthy();
    });

    it('previews the selected ids with the default policy', () => {
        const { onPreviewClosure } = bulk();

        fireEvent.click(screen.getByRole('checkbox', { name: 'Pilih Siti Contoh' }));
        fireEvent.click(previewBtn());

        expect(onPreviewClosure).toHaveBeenCalledWith(['r2'], 'SHIFT_END');
    });

    it('previews with the policy the user picked', () => {
        const { onPreviewClosure } = bulk();

        fireEvent.click(screen.getByRole('checkbox', { name: 'Pilih semua yang tampil' }));
        fireEvent.click(screen.getAllByRole('radio')[1]);
        fireEvent.click(previewBtn());

        expect(onPreviewClosure).toHaveBeenCalledWith(['r1', 'r2'], 'CLOCK_IN_PLUS_PLANNED');
    });

    it('select-all picks only the rows that are shown by the search query', () => {
        const { onPreviewClosure } = bulk(ready(), { query: 'siti' });

        fireEvent.click(screen.getByRole('checkbox', { name: 'Pilih semua yang tampil' }));
        fireEvent.click(previewBtn());

        expect(onPreviewClosure).toHaveBeenCalledWith(['r2'], 'SHIFT_END');
    });

    it('toggling select-all twice clears the selection', () => {
        bulk();
        const all = screen.getByRole('checkbox', { name: 'Pilih semua yang tampil' });

        fireEvent.click(all);
        fireEvent.click(all);

        expect(previewBtn().disabled).toBe(true);
    });

    it('does not send a row that was selected and then filtered out by the search', () => {
        const { onPreviewClosure, rerender } = (() => {
            const onPreviewClosure = vi.fn();
            const utils = render(
                <AttendanceStalePanel
                    state={ready()}
                    query=""
                    onRetry={vi.fn()}
                    onCorrect={vi.fn()}
                    canBulkClose
                    onPreviewClosure={onPreviewClosure}
                />,
            );
            return { onPreviewClosure, ...utils };
        })();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Pilih Budi Contoh' }));

        rerender(
            <AttendanceStalePanel
                state={ready()}
                query="siti"
                onRetry={vi.fn()}
                onCorrect={vi.fn()}
                canBulkClose
                onPreviewClosure={onPreviewClosure}
            />,
        );

        expect(previewBtn().disabled).toBe(true);
    });

    it('caps select-all at the batch limit and says how many were left out', () => {
        const total = CLOSURE_MAX_BATCH + 5;
        const { onPreviewClosure } = bulk(ready(manySessions(total)));

        fireEvent.click(screen.getByRole('checkbox', { name: 'Pilih semua yang tampil' }));

        expect(previewBtn().textContent).toContain(`(${CLOSURE_MAX_BATCH})`);
        expect(
            screen.getByText(new RegExp(`${CLOSURE_MAX_BATCH} dari ${total}`)),
        ).toBeTruthy();
        fireEvent.click(previewBtn());
        const ids = onPreviewClosure.mock.calls[0][0] as string[];
        expect(ids).toHaveLength(CLOSURE_MAX_BATCH);
        expect(ids[0]).toBe('m0');
    });

    it('blocks ticking more rows once the batch limit is reached', () => {
        bulk(ready(manySessions(CLOSURE_MAX_BATCH + 1)));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Pilih semua yang tampil' }));

        const extra = screen.getByRole('checkbox', {
            name: `Pilih Karyawan ${CLOSURE_MAX_BATCH}`,
        }) as HTMLButtonElement;

        expect(extra.disabled).toBe(true);
        const first = screen.getByRole('checkbox', {
            name: 'Pilih Karyawan 0',
        }) as HTMLButtonElement;
        expect(first.disabled).toBe(false);
    });

    it('does not warn about the limit for a small selection', () => {
        bulk();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Pilih semua yang tampil' }));

        expect(screen.queryByText(/batas per koreksi/)).toBeNull();
    });
});

