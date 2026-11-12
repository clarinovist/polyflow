import type { PrismaClient } from '@prisma/client';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';
import {
    parseProductionAlertThresholds,
    PRODUCTION_ALERT_THRESHOLDS_KEY,
} from '@/lib/production/alert-thresholds';
import {
    observeDashboardSection,
    recordDashboardSectionState,
} from '@/services/dashboard/dashboard-section-observability';
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

export interface ProductionMobilePendingApprovals {
    maintenance: ProductionMobileSection<{ count: number }>;
    materialOrders: ProductionMobileSection<{ count: number }>;
    links: {
        maintenance: '/production/mobile/maintenance' | null;
        materialOrders: '/production/mobile/material-orders' | null;
    };
}

export interface ProductionMobileOverview {
    generatedAt: string;
    audience: 'OPERATIONAL' | 'EXECUTIVE';
    /** Null unless the viewer can approve (FACTORY_MANAGER or ADMIN). */
    pendingApprovals: ProductionMobilePendingApprovals | null;
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
    readPendingMaintenance(): Promise<{ count: number }>;
    readPendingMaterialOrders(): Promise<{ count: number }>;
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

function createProductionMobileOverviewReader(
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
        async readPendingMaintenance() {
            return {
                count: await db.maintenanceRequest.count({
                    where: { status: 'PENDING' },
                }),
            };
        },
        async readPendingMaterialOrders() {
            return {
                count: await db.materialOrder.count({
                    where: { status: 'PENDING' },
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

const MAINTENANCE_HREF = '/production/mobile/maintenance';
const MATERIAL_ORDERS_HREF = '/production/mobile/material-orders';

async function collectPendingApprovals(input: {
    reader: ProductionMobileOverviewReader;
    now: Date;
    canOpen: (href: string) => boolean;
}): Promise<ProductionMobilePendingApprovals> {
    const [maintenance, materialOrders] = await Promise.allSettled([
        observeDashboardSection({
            route: 'production-mobile',
            section: 'pending-maintenance',
            generatedAt: input.now,
            read: () => input.reader.readPendingMaintenance(),
        }),
        observeDashboardSection({
            route: 'production-mobile',
            section: 'pending-material-orders',
            generatedAt: input.now,
            read: () => input.reader.readPendingMaterialOrders(),
        }),
    ]);
    return {
        maintenance:
            maintenance.status === 'fulfilled'
                ? available(maintenance.value)
                : unavailable(),
        materialOrders:
            materialOrders.status === 'fulfilled'
                ? available(materialOrders.value)
                : unavailable(),
        links: {
            maintenance: input.canOpen(MAINTENANCE_HREF)
                ? MAINTENANCE_HREF
                : null,
            materialOrders: input.canOpen(MATERIAL_ORDERS_HREF)
                ? MATERIAL_ORDERS_HREF
                : null,
        },
    };
}

export async function collectProductionMobileOverview(input: {
    reader: ProductionMobileOverviewReader;
    now?: Date;
    canOpen: (href: string) => boolean;
    canCreateSpk: boolean;
    audience: ProductionMobileOverview['audience'];
    canApprove: boolean;
}): Promise<ProductionMobileOverview> {
    const now = input.now ?? new Date();
    const bounds = getWibDayBounds(toBusinessDateString(now));
    const pendingApprovalsPromise = input.canApprove
        ? collectPendingApprovals({
              reader: input.reader,
              now,
              canOpen: input.canOpen,
          })
        : Promise.resolve(null);
    const [output, activeSpk, qcPending, downtime] = await Promise.allSettled([
        observeDashboardSection({
            route: 'production-mobile',
            section: 'output-today',
            generatedAt: now,
            read: () => input.reader.readOutputToday(bounds),
            state: (value) => value.state,
        }),
        observeDashboardSection({
            route: 'production-mobile',
            section: 'active-spk',
            generatedAt: now,
            read: () => input.reader.readActiveSpk(),
        }),
        observeDashboardSection({
            route: 'production-mobile',
            section: 'qc-pending',
            generatedAt: now,
            read: () => input.reader.readQcPending(),
        }),
        observeDashboardSection({
            route: 'production-mobile',
            section: 'downtime',
            generatedAt: now,
            read: () =>
                input.reader.readDowntime({
                    now,
                    startOfDay: bounds.startOfDay,
                }),
        }),
    ]);

    const pendingApprovals = await pendingApprovalsPromise;

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

    recordDashboardSectionState({
        route: 'production-mobile',
        section: 'target-attainment',
        state: 'NOT_CONFIGURED',
        generatedAt: now,
    });
    recordDashboardSectionState({
        route: 'production-mobile',
        section: 'scrap-severity',
        state: 'NOT_CONFIGURED',
        generatedAt: now,
    });

    return {
        generatedAt: now.toISOString(),
        audience: input.audience,
        pendingApprovals,
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
    canApprove: boolean;
}): Promise<ProductionMobileOverview> {
    return collectProductionMobileOverview({
        ...input,
        reader: createProductionMobileOverviewReader(input.db),
    });
}
