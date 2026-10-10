import { describe, expect, it, vi } from 'vitest';
import {
    dashboardAgeBucket,
    dashboardSectionState,
    observeDashboardSection,
    recordDashboardSectionState,
    type TimingDependencies,
} from '../dashboard-section-observability';

function dependencies() {
    const persist = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();
    const logPersistenceFailure = vi.fn();
    let clock = 100;
    const value: TimingDependencies = {
        now: () => new Date('2026-10-10T03:10:00.000Z'),
        clock: () => {
            clock += 5;
            return clock;
        },
        persist,
        log,
        logPersistenceFailure,
    };
    return { value, persist, log, logPersistenceFailure };
}

describe('dashboard section observability', () => {
    it('records only opaque timing/state/age fields and preserves the result', async () => {
        const d = dependencies();
        const result = await observeDashboardSection(
            {
                route: 'finance-mobile',
                section: 'overdue-ar',
                generatedAt: '2026-10-10T03:00:00.000Z',
                read: async () => ({ status: 'AVAILABLE', data: { count: 7 } }),
            },
            d.value,
        );
        expect(result).toEqual({ status: 'AVAILABLE', data: { count: 7 } });
        expect(d.log).toHaveBeenCalledWith({
            route: 'finance-mobile',
            section: 'overdue-ar',
            durationMs: 5,
            state: 'AVAILABLE',
            ageBucket: 'M5_15',
        });
        await vi.waitFor(() =>
            expect(d.persist).toHaveBeenCalledWith(
                'dashboard.finance-mobile.overdue-ar',
                5,
            ),
        );
        expect(JSON.stringify(d.log.mock.calls)).not.toMatch(
            /tenant|customer|employee|document|amount|error/i,
        );
    });

    it('reports rejection as unavailable and rethrows without raw error logging', async () => {
        const d = dependencies();
        await expect(
            observeDashboardSection(
                {
                    route: 'warehouse-mobile',
                    section: 'loading-attention',
                    read: async () => {
                        throw new Error('synthetic-sensitive-error');
                    },
                },
                d.value,
            ),
        ).rejects.toThrow('synthetic-sensitive-error');
        expect(d.log).toHaveBeenCalledWith(
            expect.objectContaining({
                route: 'warehouse-mobile',
                section: 'loading-attention',
                state: 'UNAVAILABLE',
                ageBucket: 'UNKNOWN',
            }),
        );
        expect(JSON.stringify(d.log.mock.calls)).not.toContain(
            'synthetic-sensitive-error',
        );
    });

    it('keeps persistence failure non-fatal and logs no database error detail', async () => {
        const d = dependencies();
        d.persist.mockRejectedValue(new Error('database-secret-detail'));
        await expect(
            observeDashboardSection(
                {
                    route: 'hrd-dashboard',
                    section: 'payroll-readiness',
                    read: async () => ({ status: 'NOT_CONFIGURED', data: null }),
                },
                d.value,
            ),
        ).resolves.toEqual({ status: 'NOT_CONFIGURED', data: null });
        await vi.waitFor(() =>
            expect(d.logPersistenceFailure).toHaveBeenCalledWith(
                'hrd-dashboard',
                'payroll-readiness',
            ),
        );
        expect(JSON.stringify(d.logPersistenceFailure.mock.calls)).not.toContain(
            'database-secret-detail',
        );
    });

    it('records a static hidden/not-configured state without a business read', async () => {
        // The default writer is mocked by this test module's dependency-free
        // environment; the assertion is that the static recorder never throws.
        expect(() =>
            recordDashboardSectionState({
                route: 'production-mobile',
                section: 'target-attainment',
                state: 'NOT_CONFIGURED',
                generatedAt: '2026-10-10T03:00:00.000Z',
            }),
        ).not.toThrow();
        await Promise.resolve();
    });

    it.each([
        ['2026-10-10T03:06:00.000Z', 'LT_5M'],
        ['2026-10-10T03:00:00.000Z', 'M5_15'],
        ['2026-10-10T02:30:00.000Z', 'M15_60'],
        ['2026-10-10T01:00:00.000Z', 'GTE_60M'],
        ['bad-date', 'UNKNOWN'],
        [null, 'UNKNOWN'],
    ] as const)('buckets snapshot age %s as %s', (generatedAt, expected) => {
        expect(
            dashboardAgeBucket(
                generatedAt,
                new Date('2026-10-10T03:10:00.000Z'),
            ),
        ).toBe(expected);
    });

    it.each([
        [{ status: 'HIDDEN' }, 'HIDDEN'],
        [{ state: 'UNAVAILABLE' }, 'UNAVAILABLE'],
        [{ status: 'NOT_CONFIGURED' }, 'NOT_CONFIGURED'],
        [{ count: 0 }, 'AVAILABLE'],
    ] as const)('derives state from %j', (value, expected) => {
        expect(dashboardSectionState(value)).toBe(expected);
    });

    it('sanitizes dynamic-looking section keys without failing the dashboard', async () => {
        const d = dependencies();
        await expect(
            observeDashboardSection(
                {
                    route: 'admin-mobile',
                    section: 'tenant-123/customer-456',
                    read: async () => 1,
                },
                d.value,
            ),
        ).resolves.toBe(1);
        await vi.waitFor(() =>
            expect(d.persist).toHaveBeenCalledWith(
                'dashboard.admin-mobile.invalid-section',
                5,
            ),
        );
        expect(d.log).toHaveBeenCalledWith(
            expect.objectContaining({ section: 'invalid-section' }),
        );
    });
});
