// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { VoidedAffalNotice } from '../VoidedAffalNotice';

const reference = {
    voidedAt: new Date('2026-10-27T09:01:58Z'),
    prongkol: 0,
    daun: 9,
    total: 9,
};

describe('VoidedAffalNotice', () => {
    afterEach(cleanup);

    it('shows the voided affal when the new entry records less', () => {
        render(<VoidedAffalNotice reference={reference} prongkol={0} daun={0} />);
        const notice = screen.getByRole('status');
        expect(notice.textContent).toContain('Isian yang dibatalkan 27 Oct 16:01 WIB mencatat affal 9 kg');
        expect(notice.textContent).toContain('prongkol 0 kg, daun 9 kg');
        expect(notice.textContent).toContain('Isian ini 0 kg');
        expect(notice.textContent).toContain('dianggap masih ada di stok');
    });

    it('omits the prongkol/daun breakdown for a kiosk entry that kept only the total', () => {
        const kiosk = { ...reference, daun: 0, total: 0.32 };
        render(<VoidedAffalNotice reference={kiosk} prongkol={0} daun={0} />);
        const notice = screen.getByRole('status');
        expect(notice.textContent).toContain('mencatat affal 0,32 kg');
        expect(notice.textContent).not.toContain('Rinciannya');
    });

    it('stays hidden once the entry records at least the voided affal', () => {
        render(<VoidedAffalNotice reference={reference} prongkol={2} daun={7} />);
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('stays hidden without a pending voided entry', () => {
        render(<VoidedAffalNotice reference={null} prongkol={0} daun={0} />);
        expect(screen.queryByRole('status')).toBeNull();
    });
});
