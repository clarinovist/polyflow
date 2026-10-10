import type { PrismaClient } from '@prisma/client';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';
import {
    parseProductionAlertThresholds,
    PRODUCTION_ALERT_THRESHOLDS_KEY,
} from '@/lib/production/alert-thresholds';
import {
    composeProductionDowntime,
    readProductionOutputHealth,
    type ProductionDowntimeData,
    type ProductionDowntimeRow,
    type ProductionOutputHealthData,
} from './production-dashboard-health-service';

export type ProductionMobileSection<T> =
    | { status: 'AVAILABLE'; data: T }
    | { status: 'UNAVAILABLE'; data: null }
    | { status: 'NOT_CONFIGURED'; data: null };

export interface ProductionMobileOverview {
    generatedAt: string;
    audience: 'OPERATIONAL' | 'EXECUTIVE';
    links: {
        maintenance: '/production/mobile/maintenance' | null;
        attendance: '/production/mobile/attendance' | null;
        quickSpk: '/production/mobile/tasks/new' | null;
    };
    health: {
        outputToday: ProductionMobileSection<ProductionOutputHealthData>;
        activeSpk: ProductionMobileSection<{ count: number }>;
        qcPending: ProductionMobileSection<{ count: number }>;
        downtime: ProductionMobileSection<{
            openCount: number;
            totalMinutesToday: number;
            thresholdMinutes: number;
            longest: NonNullable<ProductionDowntimeData['longest']> | null;
        }>;
        targetAttainment: ProductionMobileSection<never>;
        scrapSeverity: ProductionMobileSection<never>;
    };
}

export interface ProductionMobileOverviewReader {
    readOutputToday(bounds: {
        startOfDay: Date;
        endOfDay: Date;
    }): Promise<ProductionOutputHealthData>;
    readActiveSpk(): Promise<{ count: number }>;
    readQcPending(): Promise<{ count: number }>;
    readDowntime(input: { now: Date; startOfDay: Date }): Promise<{
        openCount: number;
        openRows: ProductionDowntimeRow[];
        totalMinutesToday: number;
        thresholdValue: string | null | undefined;
    }>;
}

function available<T>(data: T): ProductionMobileSection<T> {
    return { status: 'AVAILABLE', data };
}

function unavailable<T>(): ProductionMobileSection<T> {
    return { status: 'UNAVAILABLE', data: null };
}

function notConfigured<T>(): ProductionMobileSection<T> {
    return { status: 'NOT_CONFIGURED', data: null };
}

function minutesInsideDay(
    row: { startTime: Date; endTime: Date | null },
    startOfDay: Date,
    now: Date,
): number {
    const start = Math.max(startOfDay.getTime(), row.startTime.getTime());
    const end = Math.min(
        now.getTime(),
        row.endTime?.getTime() ?? now.getTime(),
    );
    return Math.max(0, Math.round((end - start) / 60_000));
}

export function createProductionMobileOverviewReader(
    db: PrismaClient,
): ProductionMobileOverviewReader {
    return {
        readOutputToday: (bounds) => readProductionOutputHealth(db, bounds),
        async readActiveSpk() {
            return {
                count: await db.productionOrder.count({
                    where: { status: 'IN_PROGRESS' },
                }),
            };
        },
        async readQcPending() {
            return {
                count: await db.qualityInspection.count({
                    where: { result: 'QUARANTINE' },
                }),
            };
        },
        async readDowntime({ now, startOfDay }) {
            const [openCount, openRows, dayRows, threshold] = await Promise.all(
                [
                    db.machineDowntime.count({ where: { endTime: null } }),
                    db.machineDowntime.findMany({
                        where: { endTime: null },
                        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
                        take: 1,
                        select: {
                            id: true,
                            machineId: true,
                            startTime: true,
                            reason: true,
                            machine: { select: { code: true, type: true } },
                        },
                    }),
                    db.machineDowntime.findMany({
                        where: {
                            startTime: { lte: now },
                            OR: [
                                { endTime: null },
                                { endTime: { gt: startOfDay } },
                            ],
                        },
                        orderBy: { id: 'asc' },
                        select: { startTime: true, endTime: true },
                    }),
                    db.appSetting.findUnique({
                        where: { key: PRODUCTION_ALERT_THRESHOLDS_KEY },
                        select: { value: true },
                    }),
                ],
            );
            return {
                openCount,
                openRows: openRows as ProductionDowntimeRow[],
                totalMinutesToday: dayRows.reduce(
                    (total, row) =>
                        total + minutesInsideDay(row, startOfDay, now),
                    0,
                ),
                thresholdValue: threshold?.value,
            };
        },
    };
}

export async function collectProductionMobileOverview(input: {
    reader: ProductionMobileOverviewReader;
    now?: Date;
    canOpen: (href: string) => boolean;
    canCreateSpk: boolean;
    audience: ProductionMobileOverview['audience'];
}): Promise<ProductionMobileOverview> {
    const now = input.now ?? new Date();
    const bounds = getWibDayBounds(toBusinessDateString(now));
    const [output, activeSpk, qcPending, downtime] = await Promise.allSettled([
        input.reader.readOutputToday(bounds),
        input.reader.readActiveSpk(),
        input.reader.readQcPending(),
        input.reader.readDowntime({ now, startOfDay: bounds.startOfDay }),
    ]);

    let outputSection: ProductionMobileOverview['health']['outputToday'] =
        unavailable();
    if (output.status === 'fulfilled') {
        outputSection =
            output.value.state === 'AVAILABLE'
                ? available(output.value)
                : unavailable();
    }

    let downtimeSection: ProductionMobileOverview['health']['downtime'] =
        unavailable();
    if (downtime.status === 'fulfilled') {
        const thresholds = parseProductionAlertThresholds(
            downtime.value.thresholdValue,
        );
        const composed = composeProductionDowntime(
            downtime.value.openRows,
            now,
            thresholds,
            () => null,
        );
        downtimeSection = available({
            openCount: downtime.value.openCount,
            totalMinutesToday: downtime.value.totalMinutesToday,
            thresholdMinutes: thresholds.downtimeCriticalMinutes,
            longest: composed.longest,
        });
    }

    return {
        generatedAt: now.toISOString(),
        audience: input.audience,
        links: {
            maintenance: input.canOpen('/production/mobile/maintenance')
                ? '/production/mobile/maintenance'
                : null,
            attendance: input.canOpen('/production/mobile/attendance')
                ? '/production/mobile/attendance'
                : null,
            quickSpk:
                input.canCreateSpk &&
                input.canOpen('/production/mobile/tasks/new')
                    ? '/production/mobile/tasks/new'
                    : null,
        },
        health: {
            outputToday: outputSection,
            activeSpk:
                activeSpk.status === 'fulfilled'
                    ? available(activeSpk.value)
                    : unavailable(),
            qcPending:
                qcPending.status === 'fulfilled'
                    ? available(qcPending.value)
                    : unavailable(),
            downtime: downtimeSection,
            targetAttainment: notConfigured(),
            scrapSeverity: notConfigured(),
        },
    };
}

export async function readProductionMobileOverview(input: {
    db: PrismaClient;
    now?: Date;
    canOpen: (href: string) => boolean;
    canCreateSpk: boolean;
    audience: ProductionMobileOverview['audience'];
}): Promise<ProductionMobileOverview> {
    return collectProductionMobileOverview({
        ...input,
        reader: createProductionMobileOverviewReader(input.db),
    });
}
