// @vitest-environment jsdom

import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountingInput } from '../accounting-input';

function ControlledAccountingInput({
    onValueChange,
}: {
    onValueChange: (value: number) => void;
}) {
    const [value, setValue] = React.useState(0);
    return (
        <AccountingInput
            aria-label="Debit"
            value={value}
            onValueChange={(next) => {
                setValue(next);
                onValueChange(next);
            }}
        />
    );
}

describe('AccountingInput', () => {
    it.each(['5304,17', '5304.17', '5.304,17', '5,304.17'])(
        'commits %s as 5304.17 and formats it on blur',
        (raw) => {
            const onValueChange = vi.fn();
            render(<ControlledAccountingInput onValueChange={onValueChange} />);
            const input = screen.getByLabelText('Debit');

            fireEvent.focus(input);
            fireEvent.change(input, { target: { value: raw } });
            expect(onValueChange).toHaveBeenLastCalledWith(5304.17);

            fireEvent.blur(input);
            expect((input as HTMLInputElement).value).toBe('5.304,17');
        },
    );

    it('keeps an intermediate separator without sending a partial value', () => {
        const onValueChange = vi.fn();
        render(
            <AccountingInput
                aria-label="Debit"
                value={45}
                onValueChange={onValueChange}
            />,
        );
        const input = screen.getByLabelText('Debit');

        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '45,' } });

        expect((input as HTMLInputElement).value).toBe('45,');
        expect(onValueChange).not.toHaveBeenCalled();
    });

    it('does not coerce invalid input to a partial/zero value and marks it invalid', () => {
        const onValueChange = vi.fn();
        render(
            <AccountingInput
                aria-label="Credit"
                value={0}
                onValueChange={onValueChange}
            />,
        );
        const input = screen.getByLabelText('Credit');

        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '12abc' } });

        expect(onValueChange).toHaveBeenLastCalledWith(Number.NaN);
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect((input as HTMLInputElement).validationMessage).not.toBe('');
    });

    it('reflects external reset and auto-clear values', () => {
        const { rerender } = render(
            <AccountingInput
                aria-label="Debit"
                value={5304.17}
                onValueChange={vi.fn()}
            />,
        );
        expect(
            (screen.getByLabelText('Debit') as HTMLInputElement).value,
        ).toBe('5.304,17');

        rerender(
            <AccountingInput
                aria-label="Debit"
                value={0}
                onValueChange={vi.fn()}
            />,
        );
        expect(
            (screen.getByLabelText('Debit') as HTMLInputElement).value,
        ).toBe('');
    });
});
