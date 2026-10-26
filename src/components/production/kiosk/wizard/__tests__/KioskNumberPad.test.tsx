// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KioskNumberPad } from '../KioskNumberPad';

afterEach(cleanup);

const press = (value: string, key: string) => {
    cleanup();
    const onChange = vi.fn();
    render(<KioskNumberPad value={value} onChange={onChange} label="Keypad" />);
    fireEvent.click(screen.getByRole('button', { name: key }));
    return onChange.mock.calls[0]?.[0];
};

describe('KioskNumberPad', () => {
    it('appends digits and replaces a lone zero', () => {
        expect(press('2', '5')).toBe('25');
        expect(press('0', '7')).toBe('7');
    });

    it('adds one decimal comma, starting from zero when empty', () => {
        expect(press('', 'Koma desimal')).toBe('0,');
        expect(press('24', 'Koma desimal')).toBe('24,');
        expect(press('24,7', 'Koma desimal')).toBeUndefined();
    });

    it('deletes the last character', () => {
        expect(press('24,7', 'Hapus satu angka')).toBe('24,');
    });
});
