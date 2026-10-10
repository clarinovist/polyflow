import { performance } from 'node:perf_hooks';
import { prisma } from '@/lib/core/prisma';
import { logger } from '@/lib/config/logger';

export const DASHBOARD_OBSERVABILITY_ROUTES = [
    'warehouse-mobile',
    'admin-mobile',
    'purchasing-mobile',
    'finance-mobile',
    'production-mobile',
    'hrd-dashboard',
    'field-sales-mobile',
    'marketing-mobile',
] as const;

export type DashboardObservabilityRoute =
    (typeof DASHBOARD_OBSERVABILITY_ROUTES)[number];
export type DashboardSectionState =
    | 'AVAILABLE'
    | 'UNAVAILABLE'
    | 'HIDDEN'
    | 'NOT_CONFIGURED';
export type DashboardAgeBucket =
    | 'LT_5M'
    | 'M5_15'
    | 'M15_60'
    | 'GTE_60M'
    | 'UNKNOWN';

export interface DashboardSectionTiming {
    route: DashboardObservabilityRoute;
    section: string;
    durationMs: number;
    state: DashboardSectionState;
    ageBucket: DashboardAgeBucket;
}

interface TimingDependencies {
    now: () => Date;
    clock: () => number;
    persist: (route: string, durationMs: number) => Promise<unknown>;
    log: (timing: DashboardSectionTiming) => void;
    logPersistenceFailure: (route: string, section: string) => void;
}

const DEFAULT_DEPENDENCIES: TimingDependencies = {
    now: () => new Date(),
    clock: () => performance.now(),
    persist: (route, durationMs) =>
        prisma.performanceMetric.create({ data: { route, durationMs } }),
    log: (timing) =>
        logger.info('Dashboard section timing', {
            module: 'dashboard-observability',
            route: timing.route,
            section: timing.section,
            durationMs: timing.durationMs,
            state: timing.state,
            ageBucket: timing.ageBucket,
        }),
    logPersistenceFailure: (route, section) =>
        logger.warn('Dashboard section timing persistence unavailable', {
            module: 'dashboard-observability',
            route,
            section,
        }),
};

function safeSectionKey(section: string): string {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(section)) {
        return 'invalid-section';
    }
    return section;
}

export function dashboardAgeBucket(
    generatedAt: Date | string | null | undefined,
    now: Date = new Date(),
): DashboardAgeBucket {
    if (generatedAt == null) return 'UNKNOWN';
    const generated =
        generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
    if (Number.isNaN(generated.getTime())) return 'UNKNOWN';
    const ageMs = Math.max(0, now.getTime() - generated.getTime());
    if (ageMs < 5 * 60_000) return 'LT_5M';
    if (ageMs < 15 * 60_000) return 'M5_15';
    if (ageMs < 60 * 60_000) return 'M15_60';
    return 'GTE_60M';
}

export function dashboardSectionState(value: unknown): DashboardSectionState {
    if (value && typeof value === 'object') {
        const candidate = value as { status?: unknown; state?: unknown };
        const state = candidate.status ?? candidate.state;
        if (
            state === 'AVAILABLE' ||
            state === 'UNAVAILABLE' ||
            state === 'HIDDEN' ||
            state === 'NOT_CONFIGURED'
        ) {
            return state;
        }
    }
    return 'AVAILABLE';
}

function emitTiming(
    input: {
        route: DashboardObservabilityRoute;
        section: string;
        startedAt: number;
        generatedAt?: Date | string | null;
        state: DashboardSectionState;
    },
    dependencies: TimingDependencies,
): void {
    const section = safeSectionKey(input.section);
    const durationMs = Math.max(
        0,
        Math.round(dependencies.clock() - input.startedAt),
    );
    const timing: DashboardSectionTiming = {
        route: input.route,
        section,
        durationMs,
        state: input.state,
        ageBucket: dashboardAgeBucket(input.generatedAt, dependencies.now()),
    };
    dependencies.log(timing);
    const metricRoute = 'dashboard.' + input.route + '.' + section;
    void Promise.resolve()
        .then(() => dependencies.persist(metricRoute, durationMs))
        .catch(() => dependencies.logPersistenceFailure(input.route, section));
}

export function recordDashboardSectionState(input: {
    route: DashboardObservabilityRoute;
    section: string;
    state: DashboardSectionState;
    generatedAt?: Date | string | null;
}): void {
    const startedAt = DEFAULT_DEPENDENCIES.clock();
    emitTiming(
        {
            ...input,
            startedAt,
        },
        DEFAULT_DEPENDENCIES,
    );
}

export async function observeDashboardSection<T>(
    input: {
        route: DashboardObservabilityRoute;
        section: string;
        generatedAt?: Date | string | null;
        read: () => Promise<T>;
        state?: (value: T) => DashboardSectionState;
    },
    dependencies: TimingDependencies = DEFAULT_DEPENDENCIES,
): Promise<T> {
    const startedAt = dependencies.clock();
    try {
        const value = await input.read();
        emitTiming(
            {
                route: input.route,
                section: input.section,
                generatedAt: input.generatedAt,
                startedAt,
                state: input.state?.(value) ?? dashboardSectionState(value),
            },
            dependencies,
        );
        return value;
    } catch (error) {
        emitTiming(
            {
                route: input.route,
                section: input.section,
                generatedAt: input.generatedAt,
                startedAt,
                state: 'UNAVAILABLE',
            },
            dependencies,
        );
        throw error;
    }
}

export const dashboardTimingTestUtils = {
    safeSectionKey,
    emitTiming,
};
export type { TimingDependencies };
