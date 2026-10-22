// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductionKpiCard } from '../ProductionKpiCard';

describe('ProductionKpiCard', () => {
    it('renders the label, value, unit and caption together', () => {
        render(
            <ProductionKpiCard
                label="Ekstrusi"
                value="14.570,98"
                unit="kg"
                caption="131 entri"
            />,
        );

        expect(screen.getByText('Ekstrusi')).toBeTruthy();
        expect(screen.getByText('14.570,98')).toBeTruthy();
        expect(screen.getByText('kg')).toBeTruthy();
        expect(screen.getByText('131 entri')).toBeTruthy();
    });

    it('omits the unit and caption when not given', () => {
        render(<ProductionKpiCard label="Lolos QC" value="—" />);

        expect(screen.getByText('Lolos QC')).toBeTruthy();
        expect(screen.getByText('—')).toBeTruthy();
        expect(screen.queryByText('kg')).toBeNull();
    });

    it('does not let a long value push past the card', () => {
        const { container } = render(
            <ProductionKpiCard label="Packing" value="1.234.567.890,12" unit="kg" />,
        );

        const card = container.firstChild as HTMLElement;
        expect(card.className).toContain('min-w-0');
        expect(screen.getByText('1.234.567.890,12').className).toContain(
            'break-words',
        );
    });

    it('renders a detail line with its own tone class', () => {
        render(
            <ProductionKpiCard
                label="Packing"
                value="1,00"
                caption="2 entri"
                detail="Affal 17,5%"
                detailClassName="text-destructive font-medium"
            />,
        );

        expect(screen.getByText('Affal 17,5%').className).toContain(
            'text-destructive',
        );
    });

    it('shows the icon slot when provided', () => {
        render(
            <ProductionKpiCard
                label="Mixing"
                value="1"
                icon={<svg data-testid="kpi-icon" />}
            />,
        );

        expect(screen.getByTestId('kpi-icon')).toBeTruthy();
    });
});
