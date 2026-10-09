import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductionActiveOrderRow } from '../production-dashboard-health-service';
import {
    composeLateProcessDriver,
    composeProductionAttention,
    composeProductionDowntime,
    composeProductionLiveOrders,
    composeProductionOutputHealth,
    resolveFreshProductionDashboardAccess,
} from '../production-dashboard-health-service';

const prisma = vi.hoisted(() => ({
    user: { findUnique: vi.fn() },
    rolePermission: { findMany: vi.fn() },
}));
vi.mock('@/lib/core/prisma', () => ({ prisma }));
vi.mock('@/lib/errors/errors', () => ({
    AuthorizationError: class AuthorizationError extends Error {},
}));

function order(overrides: Record<string, unknown> = {}) {
    return {
        id: 'order-1',
        orderNumber: 'SPK-001',
        plannedQuantity: 100,
        actualQuantity: 25,
        plannedEndDate: new Date('2026-10-09T07:00:00.000Z'),
        actualStartDate: new Date('2026-10-09T06:00:00.000Z'),
        createdAt: new Date('2026-10-09T05:00:00.000Z'),
        bom: {
            category: 'MIXING',
            productVariant: { name: 'Product', primaryUnit: 'KG' },
        },
        machine: { code: 'M-1' },
        _count: { shifts: 1 },
        shifts: [
            {
                operatorId: 'operator',
                startTime: new Date('2026-10-09T06:00:00.000Z'),
                endTime: new Date('2026-10-09T09:00:00.000Z'),
                operator: { name: 'Operator' },
            },
        ],
        executions: [{ startTime: new Date('2026-10-09T06:00:00.000Z') }],
        ...overrides,
    } as never;
}

const now = new Date('2026-10-09T08:00:00.000Z');
const thresholds = {
    scrapWarningPercent: 2,
    scrapAnomalyPercent: 5,
    scrapCriticalQuantity: 50,
    downtimeCriticalMinutes: 30,
    lowThroughputPerHour: 50,
};

describe('production dashboard health composition', () => {
    it('groups output without combining unlike units and exposes bounded live totals', () => {
        const output = composeProductionOutputHealth(
            [
                {
                    quantityProduced: 10,
                    productionOrder: {
                        id: 'one',
                        bom: {
                            category: 'MIXING',
                            productVariant: {
                                id: 'same',
                                name: 'Product',
                                skuCode: 'P',
                                primaryUnit: 'KG',
                            },
                        },
                    },
                },
                {
                    quantityProduced: 4,
                    productionOrder: {
                        id: 'two',
                        bom: {
                            category: 'MIXING',
                            productVariant: {
                                id: 'same',
                                name: 'Product',
                                skuCode: 'P',
                                primaryUnit: 'PCS',
                            },
                        },
                    },
                },
            ],
            false,
        );
        const live = composeProductionLiveOrders(
            Array.from({ length: 7 }, (_, index) =>
                order({
                    id: `order-${index}`,
                    orderNumber: `SPK-${index}`,
                    plannedEndDate: new Date(
                        now.getTime() - (index + 1) * 60_000,
                    ),
                }),
            ),
            now,
        );

        expect(output.processTotals).toEqual([
            { processKey: 'MIXING', quantity: 10, unit: 'KG' },
            { processKey: 'MIXING', quantity: 4, unit: 'PCS' },
        ]);
        expect(output.items.map((item) => item.unit)).toEqual(['KG', 'PCS']);
        expect(live).toMatchObject({ total: 7, lateTotal: 7, returned: 5 });
        expect(live.items.map((item) => item.orderNumber)).toEqual([
            'SPK-6',
            'SPK-5',
            'SPK-4',
            'SPK-3',
            'SPK-2',
        ]);
    });

    it('keeps complete output cohort totals while returning only a deterministic bounded sample', () => {
        const output = composeProductionOutputHealth(
            Array.from({ length: 8 }, (_, index) => ({
                quantityProduced: index + 1,
                productionOrder: {
                    id: `order-${index}`,
                    bom: {
                        category: 'MIXING' as const,
                        productVariant: {
                            id: `product-${index}`,
                            name: `Product ${index}`,
                            skuCode: `P-${index}`,
                            primaryUnit: 'KG' as const,
                        },
                    },
                },
            })),
            false,
        );

        expect(output).toMatchObject({
            totalGroups: 8,
            returned: 6,
            processTotals: [
                { processKey: 'MIXING', unit: 'KG', quantity: 36 },
            ],
        });
        expect(output.items).toHaveLength(6);
    });

    it('ranks downtime and late-process drivers deterministically', () => {
        const rows = [
            {
                id: 'b',
                machineId: 'machine-b',
                startTime: new Date(now.getTime() - 60 * 60_000),
                reason: 'Reason B',
                machine: { code: 'B', type: 'MIXER' },
            },
            {
                id: 'a',
                machineId: 'machine-a',
                startTime: new Date(now.getTime() - 60 * 60_000),
                reason: 'Reason A',
                machine: { code: 'A', type: 'EXTRUDER' },
            },
        ] as never;
        const downtime = composeProductionDowntime(
            rows,
            now,
            thresholds,
            (id) => `/production/machines/${id}`,
        );
        const driver = composeLateProcessDriver(
            [
                order({ id: 'mix', bom: { category: 'MIXING', productVariant: { name: 'A', primaryUnit: 'KG' } } }),
                order({ id: 'pack', bom: { category: 'PACKING', productVariant: { name: 'B', primaryUnit: 'PCS' } } }),
            ],
            now,
        );

        expect(downtime.longest).toMatchObject({
            incidentId: 'a',
            severity: 'red',
            minutes: 60,
        });
        expect(driver).toMatchObject({
            processKey: 'MIXING',
            lateCount: 1,
            oldestDelayMinutes: 60,
        });
    });

    it('uses explicit complete shift facts for never-had and historical-shift semantics', () => {
        const withoutLoadedWindow = order({
            _count: { shifts: 0 },
            shifts: [],
            executions: [],
        });
        const compose = (fact: {
            count: number;
            latestStartTime: Date | null;
            latestEndTime: Date | null;
        }) =>
            composeProductionAttention({
                now,
                activeOrders: [withoutLoadedWindow],
                downtimes: [],
                issues: [],
                waitingMaterials: [],
                scrapExecutions: [],
                thresholds,
                shiftFacts: new Map([['order-1', fact]]),
                orderHref: () => null,
                machineHref: () => null,
                warehouseMaterialsHref: null,
            });

        expect(
            compose({
                count: 1,
                latestStartTime: new Date('2026-10-01T06:00:00.000Z'),
                latestEndTime: new Date('2026-10-01T09:00:00.000Z'),
            }).items.some((item) => item.type === 'no_shift'),
        ).toBe(false);
        expect(
            compose({
                count: 0,
                latestStartTime: null,
                latestEndTime: null,
            }).items.some((item) => item.type === 'no_shift'),
        ).toBe(true);
    });

    it('omits threshold-derived items when threshold truth is unavailable', () => {
        const attention = composeProductionAttention({
            now,
            activeOrders: [order()],
            downtimes: [
                {
                    id: 'down',
                    machineId: 'machine',
                    startTime: new Date('2026-10-09T07:00:00.000Z'),
                    reason: 'Reason',
                    machine: { code: 'M', type: 'MIXER' },
                },
            ],
            issues: [],
            waitingMaterials: [],
            scrapExecutions: [
                {
                    productionOrderId: 'order-1',
                    quantityProduced: 94,
                    scrapQuantity: 6,
                    scrapProngkolQty: 0,
                    scrapDaunQty: 0,
                },
            ],
            thresholds: null,
            shiftFacts: new Map([
                [
                    'order-1',
                    {
                        count: 1,
                        latestStartTime: new Date(
                            '2026-10-09T06:00:00.000Z',
                        ),
                        latestEndTime: new Date(
                            '2026-10-09T09:00:00.000Z',
                        ),
                    },
                ],
            ]),
            orderHref: () => null,
            machineHref: () => null,
            warehouseMaterialsHref: null,
        });

        expect(
            attention.items.some(
                (item) =>
                    item.type === 'downtime' || item.type === 'high_scrap',
            ),
        ).toBe(false);
        expect(attention.items.some((item) => item.type === 'late')).toBe(true);
    });

    it.each([
        {
            label: 'unassigned',
            operatorId: null,
            operator: null,
            expected: true,
        },
        {
            label: 'assigned',
            operatorId: 'operator',
            operator: { name: 'Operator' },
            expected: false,
        },
    ])(
        'emits no_operator=$expected for one returned $label active shift',
        ({ operatorId, operator, expected }) => {
            const activeShift = {
                operatorId,
                startTime: new Date('2026-10-09T06:00:00.000Z'),
                endTime: new Date('2026-10-09T09:00:00.000Z'),
                operator,
            };
            const attention = composeProductionAttention({
                now,
                activeOrders: [
                    order({
                        _count: { shifts: 1 },
                        shifts: [activeShift],
                    }),
                ],
                downtimes: [],
                issues: [],
                waitingMaterials: [],
                scrapExecutions: [],
                thresholds,
                shiftFacts: new Map([
                    [
                        'order-1',
                        {
                            count: 1,
                            latestStartTime: activeShift.startTime,
                            latestEndTime: activeShift.endTime,
                        },
                    ],
                ]),
                orderHref: () => null,
                machineHref: () => null,
                warehouseMaterialsHref: null,
            });

            expect(
                attention.items.filter(
                    (item) => item.type === 'no_operator',
                ),
            ).toHaveLength(expected ? 1 : 0);
        },
    );

    it('uses the active window for operator and shift truth even with more historical shifts', () => {
        const currentShift = {
            operatorId: 'operator',
            startTime: new Date('2026-10-09T06:00:00.000Z'),
            endTime: new Date('2026-10-09T09:00:00.000Z'),
            operator: { name: 'Operator' },
        };
        const attention = composeProductionAttention({
            now,
            activeOrders: [
                order({ _count: { shifts: 25 }, shifts: [currentShift] }),
            ],
            downtimes: [],
            issues: [],
            waitingMaterials: [],
            scrapExecutions: [],
            thresholds,
            shiftFacts: new Map([
                [
                    'order-1',
                    {
                        count: 25,
                        latestStartTime: currentShift.startTime,
                        latestEndTime: currentShift.endTime,
                    },
                ],
            ]),
            orderHref: () => null,
            machineHref: () => null,
            warehouseMaterialsHref: null,
        });

        expect(
            attention.items.some(
                (item) =>
                    item.type === 'no_shift' || item.type === 'no_operator',
            ),
        ).toBe(false);
    });

    it('composes attention families, deterministic sample bounds, and safe links', () => {
        const active: ProductionActiveOrderRow[] = Array.from(
            { length: 15 },
            (_, index) =>
                order({
                    id: `order-${index}`,
                    orderNumber: `SPK-${String(index).padStart(2, '0')}`,
                    _count: { shifts: 0 },
                    shifts: [],
                    executions: [],
                }),
        );
        const attention = composeProductionAttention({
            now,
            activeOrders: active,
            downtimes: [],
            issues: [],
            waitingMaterials: [],
            scrapExecutions: [],
            thresholds,
            shiftFacts: new Map(
                active.map((item) => [
                    item.id,
                    {
                        count: 0,
                        latestStartTime: null,
                        latestEndTime: null,
                    },
                ]),
            ),
            orderHref: (id) => `/production/orders/${id}`,
            machineHref: () => null,
            warehouseMaterialsHref: null,
        });

        expect(attention.total).toBe(30);
        expect(attention.returned).toBe(12);
        expect(attention.items).toHaveLength(12);
        expect(attention.items.every((item) => item.href?.startsWith('/production/orders/'))).toBe(true);
        expect(
            attention.items.every(
                (item) =>
                    !item.secondaryHref ||
                    item.secondaryHref.startsWith('/production/orders/'),
            ),
        ).toBe(true);
    });
});

describe('fresh Production dashboard access', () => {
    beforeEach(() => vi.clearAllMocks());

    it('allows exact-root active Production and keeps nested resources for link filtering', async () => {
        prisma.user.findUnique.mockResolvedValue({
            isActive: true,
            isSuperAdmin: false,
            role: 'PRODUCTION',
            roles: [],
        });
        prisma.rolePermission.findMany.mockResolvedValue([
            { resource: '/production' },
            { resource: '/warehouse/materials' },
        ]);

        await expect(
            resolveFreshProductionDashboardAccess('user'),
        ).resolves.toEqual({
            resources: ['/production', '/warehouse/materials'],
        });
    });

    it.each([
        {
            role: 'FACTORY_MANAGER',
            extraRoles: [],
            resources: ['/production'],
        },
        {
            role: 'FACTORY_MANAGER',
            extraRoles: ['PRODUCTION'],
            resources: ['/production'],
        },
        {
            role: 'PLANNING',
            extraRoles: ['FACTORY_MANAGER'],
            resources: ['/production'],
        },
        {
            role: 'PRODUCTION',
            extraRoles: [],
            resources: ['/production/daily'],
        },
        { role: 'SALES', extraRoles: [], resources: ['ALL'] },
    ])(
        'denies role=$role extraRoles=$extraRoles resources=$resources',
        async ({ role, extraRoles, resources }) => {
            prisma.user.findUnique.mockResolvedValue({
                isActive: true,
                isSuperAdmin: false,
                role,
                roles: extraRoles.map((extraRole) => ({ role: extraRole })),
            });
            prisma.rolePermission.findMany.mockResolvedValue(
                resources.map((resource) => ({ resource })),
            );

            await expect(
                resolveFreshProductionDashboardAccess('user'),
            ).rejects.toThrow();
        },
    );

    it('lets ADMIN override a secondary FACTORY_MANAGER assignment', async () => {
        prisma.user.findUnique.mockResolvedValue({
            isActive: true,
            isSuperAdmin: false,
            role: 'ADMIN',
            roles: [{ role: 'FACTORY_MANAGER' }],
        });

        await expect(
            resolveFreshProductionDashboardAccess('admin'),
        ).resolves.toEqual({ resources: 'ALL' });
        expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
    });
});
