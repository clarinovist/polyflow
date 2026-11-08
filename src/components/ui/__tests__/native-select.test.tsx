// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NativeSelect } from '../native-select';

describe('NativeSelect', () => {
    it('renders options and forwards native select props', () => {
        render(
            <NativeSelect aria-label="Shift" defaultValue="b" disabled>
                <option value="a">A</option>
                <option value="b">B</option>
            </NativeSelect>,
        );

        const select = screen.getByLabelText('Shift') as HTMLSelectElement;
        expect(select.value).toBe('b');
        expect(select.disabled).toBe(true);
    });

    it('uses a 44px touch height and merges custom classes', () => {
        render(
            <NativeSelect aria-label="Mesin" className="mt-1 flex-1">
                <option value="">-</option>
            </NativeSelect>,
        );

        const select = screen.getByLabelText('Mesin');
        expect(select.className).toContain('pointer-coarse:h-11');
        expect(select.className).toContain('flex-1');
    });
});
