import { describe, expect, it } from 'vitest';
import {
    dashboardSectionState,
    type DashboardSectionState,
} from '../dashboard-section-observability';

const states: DashboardSectionState[] = [
    'AVAILABLE',
    'UNAVAILABLE',
    'HIDDEN',
    'NOT_CONFIGURED',
];

describe('dashboard observability state coverage', () => {
    it('keeps the four contracted states distinct from valid zero', () => {
        for (const state of states) {
            expect(dashboardSectionState({ status: state })).toBe(state);
        }
        expect(dashboardSectionState({ data: { count: 0 } })).toBe('AVAILABLE');
    });
});
