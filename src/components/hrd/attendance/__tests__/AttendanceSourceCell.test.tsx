// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import React from 'react';
import { AttendanceSourceCell } from '../AttendanceSourceCell';
import { RECORD } from './fixtures';

describe('AttendanceSourceCell', () => {
    it('shows only the source badge without distance or coordinates', () => {
        render(<AttendanceSourceCell record={RECORD} />);
        expect(screen.getByText('Kiosk')).toBeTruthy();
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('shows meters and km distances but hides zero', () => {
        const { rerender } = render(
            <AttendanceSourceCell record={{ ...RECORD, clockInDistance: 250 }} />,
        );
        expect(screen.getByText('250m')).toBeTruthy();
        rerender(<AttendanceSourceCell record={{ ...RECORD, clockInDistance: 1500 }} />);
        expect(screen.getByText('1.5km')).toBeTruthy();
        rerender(<AttendanceSourceCell record={{ ...RECORD, clockInDistance: 0 }} />);
        expect(screen.queryByText(/m$/)).toBeNull();
    });

    it('links to the map when coordinates exist', () => {
        render(
            <AttendanceSourceCell
                record={{ ...RECORD, source: 'SELF_SERVICE', clockInLatitude: -6.2, clockInLongitude: 106.8 }}
            />,
        );
        expect(screen.getByText('Mandiri')).toBeTruthy();
        const link = screen.getByRole('link');
        expect(link.getAttribute('href')).toContain('google.com/maps');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
        expect(link.getAttribute('title')).toBe('-6.2, 106.8');
    });

    it('requires both latitude and longitude for the map link', () => {
        render(<AttendanceSourceCell record={{ ...RECORD, clockInLatitude: -6.2, clockInLongitude: null }} />);
        expect(screen.queryByRole('link')).toBeNull();
    });
});
