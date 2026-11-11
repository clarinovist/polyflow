// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import React from 'react';
import { RecapMessageCard, SummaryCard } from '../RecapShared';

describe('SummaryCard', () => {
    it('renders icon, label and value in the default style', () => {
        const { container } = render(
            <SummaryCard icon={<svg data-testid="icon" />} label="Karyawan" value="3 orang" />,
        );
        expect(screen.getByTestId('icon')).toBeTruthy();
        expect(screen.getByText('Karyawan')).toBeTruthy();
        expect(screen.getByText('3 orang').className).toContain('text-foreground');
        expect(container.firstElementChild?.className).toContain('bg-card');
    });

    it('highlights the card when accent is set', () => {
        const { container } = render(
            <SummaryCard icon={null} label="Total OT" value="2.0j" accent />,
        );
        expect(screen.getByText('2.0j').className).toContain('text-primary');
        expect(container.firstElementChild?.className).toContain('border-primary/20');
    });
});

describe('RecapMessageCard', () => {
    it('renders its children in a muted card', () => {
        render(<RecapMessageCard>Memuat…</RecapMessageCard>);
        expect(screen.getByText('Memuat…').className).toContain('text-muted-foreground');
    });
});
