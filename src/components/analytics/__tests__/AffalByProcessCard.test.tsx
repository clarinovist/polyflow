// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AffalByProcessCard } from '../AffalByProcessCard';
import { DEFAULT_PRODUCTION_ALERT_THRESHOLDS } from '@/lib/production/alert-thresholds';

const empty = { produced: 0, affal: 0, entries: 0 };
const totals = (over = {}) => ({
    MIXING: empty,
    EXTRUSION: empty,
    PACKING: empty,
    OTHER: empty,
    ...over,
});

describe('AffalByProcessCard', () => {
    it('lists each process with output separately and never a combined total', () => {
        render(
            <AffalByProcessCard
                affalByProcess={totals({
                    EXTRUSION: { produced: 14570.98, affal: 731.29, entries: 131 },
                    PACKING: { produced: 10977.5, affal: 2112.56, entries: 163 },
                })}
                thresholds={DEFAULT_PRODUCTION_ALERT_THRESHOLDS}
            />,
        );

        expect(screen.getByText('Ekstrusi')).toBeTruthy();
        expect(screen.getByText('731,29')).toBeTruthy();
        expect(screen.getByText('Packing')).toBeTruthy();
        expect(screen.getByText('2.112,56')).toBeTruthy();
        // 731,29 + 2.112,56 = 2.843,85 must never be shown
        expect(screen.queryByText('2.843,85')).toBeNull();
    });

    it('omits processes without entries', () => {
        render(
            <AffalByProcessCard
                affalByProcess={totals({
                    EXTRUSION: { produced: 100, affal: 5, entries: 1 },
                })}
                thresholds={DEFAULT_PRODUCTION_ALERT_THRESHOLDS}
            />,
        );

        expect(screen.queryByText('Mixing')).toBeNull();
        expect(screen.queryByText('Packing')).toBeNull();
    });

    it('colors a share red only above the critical threshold', () => {
        render(
            <AffalByProcessCard
                affalByProcess={totals({
                    EXTRUSION: { produced: 952, affal: 48, entries: 1 },
                    PACKING: { produced: 825, affal: 175, entries: 1 },
                })}
                thresholds={DEFAULT_PRODUCTION_ALERT_THRESHOLDS}
            />,
        );

        expect(screen.getByText('4,8%').className).not.toContain(
            'text-destructive',
        );
        expect(screen.getByText('17,5%').className).toContain(
            'text-destructive',
        );
    });

    it('shows an empty state when the period has no entries', () => {
        render(
            <AffalByProcessCard
                affalByProcess={totals()}
                thresholds={DEFAULT_PRODUCTION_ALERT_THRESHOLDS}
            />,
        );

        expect(screen.getByText('Belum ada hasil pada periode ini')).toBeTruthy();
    });
});
