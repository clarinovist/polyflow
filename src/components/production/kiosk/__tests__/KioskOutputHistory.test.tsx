// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KioskOutputHistory } from '../KioskOutputHistory';

afterEach(cleanup);

const logs = [
    {
        id: 'exec-2',
        recordedAt: '2026-10-26T06:58:00.000Z',
        operatorName: 'Operator 3',
        quantity: 25,
        enteredQuantity: null,
        enteredUnit: null,
        scrapKg: 0.3,
        packaging: [
            { name: 'Etiket Merek A', quantity: 240, unit: 'PCS' },
            { name: 'Plastik', quantity: 0.8, unit: 'KG' },
        ],
    },
    {
        id: 'exec-1',
        recordedAt: '2026-10-26T04:40:00.000Z',
        operatorName: null,
        quantity: 50,
        enteredQuantity: 2,
        enteredUnit: 'BAL',
        scrapKg: 0,
        packaging: [],
    },
];

describe('KioskOutputHistory', () => {
    it('lists each output with its time in WIB, operator, unit, packaging and affal', () => {
        render(<KioskOutputHistory logs={logs} primaryUnit="KG" />);

        expect(screen.getByRole('heading', { name: 'Riwayat catat SPK ini' })).toBeTruthy();
        expect(screen.getByText('2 catatan')).toBeTruthy();
        const [first, second] = screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
        expect(first).toEqual(['13.58', 'Operator 3', '25 KG', 'Etiket Merek A 240 pcs · Plastik 0,8 KG', '0,3 KG']);
        expect(second).toEqual(['11.40', '-', '2 BAL', '-', '-']);
    });

    it('says so when nothing has been recorded yet', () => {
        render(<KioskOutputHistory logs={[]} primaryUnit="KG" />);

        expect(screen.getByText('Belum ada hasil yang dicatat untuk SPK ini.')).toBeTruthy();
        expect(screen.queryByRole('table')).toBeNull();
    });
});
