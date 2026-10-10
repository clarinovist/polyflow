import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    entitled: vi.fn(),
    requireAuth: vi.fn(),
    prisma: {
        user: { findUnique: vi.fn() },
        rolePermission: { findMany: vi.fn() },
        productionExecution: { findMany: vi.fn() },
        productionOrder: { findMany: vi.fn(), count: vi.fn() },
        productionShift: { groupBy: vi.fn(), findMany: vi.fn() },
        machineDowntime: { findMany: vi.fn(), count: vi.fn() },
        productionIssue: { findMany: vi.fn(), count: vi.fn() },
        appSetting: { findUnique: vi.fn() },
    },
}));

vi.mock('@/lib/core/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: never[]) => unknown) => fn,
}));
vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: mocks.requireAuth,
}));
vi.mock('@/lib/auth/access-policy', () => ({
    hasWorkspaceEntitlement: mocks.entitled,
}));
vi.mock('@/lib/errors/errors', () => ({
    AuthorizationError: class AuthorizationError extends Error {},
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            return { success: true as const, data: await fn() };
        } catch (error) {
            return {
                success: false as const,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
}));

import { getProductionLiveOverview } from '../production-live-overview';

function activeOrder(
    overrides: Partial<ReturnType<typeof activeOrderBase>> = {},
) {
    return { ...activeOrderBase(), ...overrides };
}

function activeOrderBase() {
    return {
        id: 'spk-1',
        orderNumber: 'SPK-001',
        plannedQuantity: 100,
        actualQuantity: 25,
        plannedEndDate: new Date('2026-10-09T07:30:00.000Z'),
        actualStartDate: new Date('2026-10-09T07:00:00.000Z'),
        createdAt: new Date('2026-10-09T07:00:00.000Z'),
        bom: {
            category: 'MIXING',
            productVariant: { name: 'Synthetic product', primaryUnit: 'KG' },
        },
        machine: { code: 'M-01' },
        _count: { shifts: 1 },
        shifts: [
            {
                operatorId: 'operator-1',
                operator: { name: 'Synthetic operator' },
                startTime: new Date('2026-10-09T06:00:00.000Z'),
                endTime: new Date('2026-10-09T09:00:00.000Z'),
            },
        ],
        executions: [{ startTime: new Date('2026-10-09T07:00:00.000Z') }],
    };
}

function downtime() {
    return {
        id: 'down-1',
        machineId: 'machine-1',
        startTime: new Date('2026-10-09T07:00:00.000Z'),
        reason: 'Synthetic maintenance',
        machine: { code: 'M-01', type: 'MIXER' },
    };
}

function outputExecution(
    unit: 'KG' | 'PCS',
    id: string,
    quantity: number,
    category: 'MIXING' | 'PACKING' = 'MIXING',
) {
    return {
        quantityProduced: quantity,
        productionOrder: {
            id: `order-${id}`,
            bom: {
                category,
                productVariant: {
                    id,
                    name: `Product ${id}`,
                    skuCode: id,
                    primaryUnit: unit,
                },
            },
        },
    };
}

function setup() {
    mocks.entitled.mockReturnValue(true);
    mocks.requireAuth.mockResolvedValue({ user: { id: 'production-user' } });
    mocks.prisma.user.findUnique.mockResolvedValue({
        isActive: true,
        isSuperAdmin: false,
        role: 'PRODUCTION',
        roles: [],
    });
    mocks.prisma.rolePermission.findMany.mockResolvedValue([
        { resource: '/production' },
    ]);
    mocks.prisma.productionExecution.findMany.mockImplementation(
        async ({ where }: { where: { startTime?: unknown } }) =>
            where.startTime ? [] : [],
    );
    mocks.prisma.productionOrder.count.mockImplementation(
        async ({ where }: { where: { status: string; plannedEndDate?: unknown } }) =>
            where.status === 'IN_PROGRESS'
                ? where.plannedEndDate
                    ? 1
                    : 1
                : 0,
    );
    mocks.prisma.productionOrder.findMany.mockImplementation(
        async ({ where }: { where: { status: string } }) =>
            where.status === 'IN_PROGRESS' ? [activeOrder()] : [],
    );
    mocks.prisma.productionShift.groupBy.mockResolvedValue([
        {
            productionOrderId: 'spk-1',
            _count: { _all: 1 },
        },
    ]);
    mocks.prisma.productionShift.findMany.mockResolvedValue([
        {
            productionOrderId: 'spk-1',
            startTime: new Date('2026-10-09T06:00:00.000Z'),
            endTime: new Date('2026-10-09T09:00:00.000Z'),
        },
    ]);
    mocks.prisma.machineDowntime.count.mockResolvedValue(1);
    mocks.prisma.machineDowntime.findMany.mockResolvedValue([downtime()]);
    mocks.prisma.productionIssue.count.mockResolvedValue(0);
    mocks.prisma.productionIssue.findMany.mockResolvedValue([]);
    mocks.prisma.appSetting.findUnique.mockResolvedValue(null);
}

function businessMocks() {
    return [
        mocks.prisma.productionExecution.findMany,
        mocks.prisma.productionOrder.count,
        mocks.prisma.productionOrder.findMany,
        mocks.prisma.productionShift.groupBy,
        mocks.prisma.productionShift.findMany,
        mocks.prisma.machineDowntime.count,
        mocks.prisma.machineDowntime.findMany,
        mocks.prisma.productionIssue.count,
        mocks.prisma.productionIssue.findMany,
        mocks.prisma.appSetting.findUnique,
    ];
}

describe('getProductionLiveOverview R4C', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-09T08:00:00.000Z'));
        vi.clearAllMocks();
        setup();
    });

    afterEach(() => vi.useRealTimers());

    it('authorizes from fresh active tenant DB state before business reads', async () => {
        mocks.prisma.user.findUnique.mockResolvedValue(null);

        const result = await getProductionLiveOverview();

        expect(result).toMatchObject({
            success: false,
            error: expect.stringContaining('tidak aktif'),
        });
        expect(mocks.prisma.user.findUnique).toHaveBeenCalledOnce();
        for (const reader of businessMocks()) expect(reader).not.toHaveBeenCalled();
    });

    it.each([
        {
            name: 'nested-only grant',
            user: {
                isActive: true,
                isSuperAdmin: false,
                role: 'PRODUCTION',
                roles: [],
            },
            grants: [{ resource: '/production/daily' }],
        },
        {
            name: 'FACTORY_MANAGER role',
            user: {
                isActive: true,
                isSuperAdmin: false,
                role: 'FACTORY_MANAGER',
                roles: [],
            },
            grants: [{ resource: '/production' }],
        },
        {
            name: 'FACTORY_MANAGER plus PRODUCTION',
            user: {
                isActive: true,
                isSuperAdmin: false,
                role: 'FACTORY_MANAGER',
                roles: [{ role: 'PRODUCTION' }],
            },
            grants: [{ resource: '/production' }],
        },
        {
            name: 'FACTORY_MANAGER plus PLANNING',
            user: {
                isActive: true,
                isSuperAdmin: false,
                role: 'PLANNING',
                roles: [{ role: 'FACTORY_MANAGER' }],
            },
            grants: [{ resource: '/production' }],
        },
    ])('denies $name before business reads', async ({ user, grants }) => {
        mocks.prisma.user.findUnique.mockResolvedValue(user);
        mocks.prisma.rolePermission.findMany.mockResolvedValue(grants);

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(false);
        for (const reader of businessMocks()) expect(reader).not.toHaveBeenCalled();
    });

    it('lets ADMIN override a secondary FACTORY_MANAGER role', async () => {
        mocks.prisma.user.findUnique.mockResolvedValue({
            isActive: true,
            isSuperAdmin: false,
            role: 'ADMIN',
            roles: [{ role: 'FACTORY_MANAGER' }],
        });

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        expect(mocks.prisma.rolePermission.findMany).not.toHaveBeenCalled();
        expect(mocks.prisma.productionOrder.count).toHaveBeenCalled();
    });

    it('returns HIDDEN without business or fresh access reads when Production entitlement is inactive', async () => {
        mocks.entitled.mockReturnValue(false);

        const result = await getProductionLiveOverview();

        expect(result).toMatchObject({
            success: true,
            data: { state: 'HIDDEN', health: null },
        });
        expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
        for (const reader of businessMocks()) expect(reader).not.toHaveBeenCalled();
    });

    it('allows active ADMIN/PRODUCTION/PLANNING with exact root or ALL and derives links from fresh grants', async () => {
        mocks.prisma.user.findUnique.mockResolvedValue({
            isActive: true,
            isSuperAdmin: false,
            role: 'PLANNING',
            roles: [],
        });
        mocks.prisma.rolePermission.findMany.mockResolvedValue([
            { resource: '/production' },
        ]);

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || result.data.state !== 'AVAILABLE') return;
        expect(result.data.permissions.links.outputReport).toBe(
            '/production/output-report',
        );
        expect(result.data.permissions.links.orders).toBe('/production/orders');
        expect(result.data.permissions.links.warehouseMaterials).toBeNull();
        expect(result.data.generatedAt).toBe('2026-10-09T08:00:00.000Z');
        expect(
            result.data.attention.items.some((item) => item.href),
        ).toBe(true);

        mocks.prisma.rolePermission.findMany.mockResolvedValue([
            { resource: '/production' },
            { resource: '/production/orders' },
            { resource: '/production/output-report' },
            { resource: '/kiosk' },
        ]);
        const withKiosk = await getProductionLiveOverview();
        expect(
            withKiosk.success &&
                withKiosk.data.state === 'AVAILABLE' &&
                withKiosk.data.permissions.links.kiosk,
        ).toBe('/kiosk');
        expect(
            withKiosk.success &&
                withKiosk.data.state === 'AVAILABLE' &&
                withKiosk.data.permissions.links.outputReport,
        ).toBe('/production/output-report');
        expect(
            withKiosk.success &&
                withKiosk.data.state === 'AVAILABLE' &&
                withKiosk.data.attention.items.some((item) => item.href),
        ).toBe(true);
    });

    it('uses WIB/non-VOIDED output reads and keeps unlike units in separate groups', async () => {
        mocks.prisma.productionExecution.findMany.mockImplementation(
            async ({ where }: { where: { startTime?: unknown } }) =>
                where.startTime
                    ? [
                          outputExecution('KG', 'same', 10),
                          outputExecution('PCS', 'same', 4),
                      ]
                    : [],
        );

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || result.data.state !== 'AVAILABLE') return;
        expect(result.data.health.output.processTotals).toEqual([
            { processKey: 'MIXING', quantity: 10, unit: 'KG' },
            { processKey: 'MIXING', quantity: 4, unit: 'PCS' },
        ]);
        expect(result.data.health.output.items).toEqual([
            expect.objectContaining({ quantity: 10, unit: 'KG' }),
            expect.objectContaining({ quantity: 4, unit: 'PCS' }),
        ]);
        expect(mocks.prisma.productionExecution.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    status: { not: 'VOIDED' },
                    startTime: {
                        gte: new Date('2026-10-08T17:00:00.000Z'),
                        lte: new Date('2026-10-09T16:59:59.999Z'),
                    },
                },
                take: 2001,
                orderBy: { id: 'asc' },
            }),
        );
    });

    it('keeps desktop and mobile on the exported canonical output reader query/composition contract', async () => {
        const service = await import(
            '@/services/production/production-dashboard-health-service'
        );
        const db = {
            productionExecution: {
                findMany: vi.fn().mockResolvedValue([
                    outputExecution('KG', 'kg', 3, 'MIXING'),
                    outputExecution('PCS', 'pcs', 8, 'PACKING'),
                ]),
            },
        };

        const output = await service.readProductionOutputHealth(db as never, {
            startOfDay: new Date('2026-10-08T17:00:00.000Z'),
            endOfDay: new Date('2026-10-09T16:59:59.999Z'),
        });

        expect(output.processTotals).toEqual([
            { processKey: 'MIXING', quantity: 3, unit: 'KG' },
            { processKey: 'PACKING', quantity: 8, unit: 'PCS' },
        ]);
        expect(db.productionExecution.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    status: { not: 'VOIDED' },
                    startTime: {
                        gte: new Date('2026-10-08T17:00:00.000Z'),
                        lte: new Date('2026-10-09T16:59:59.999Z'),
                    },
                },
                take: 2001,
            }),
        );
    });

    it('reads threshold every refresh and uses default for malformed values', async () => {
        mocks.prisma.appSetting.findUnique.mockResolvedValue({
            value: JSON.stringify({ downtimeCriticalMinutes: 90 }),
        });
        const first = await getProductionLiveOverview();
        expect(
            first.success &&
                first.data.state === 'AVAILABLE' &&
                first.data.health.downtime.longest?.severity,
        ).toBe('amber');

        mocks.prisma.appSetting.findUnique.mockResolvedValue({
            value: '{malformed',
        });
        const second = await getProductionLiveOverview();
        expect(
            second.success &&
                second.data.state === 'AVAILABLE' &&
                second.data.health.downtime.longest?.severity,
        ).toBe('red');
        expect(mocks.prisma.appSetting.findUnique).toHaveBeenCalledTimes(2);
    });

    it('preserves a custom scrap threshold when the independent downtime reader fails', async () => {
        mocks.prisma.appSetting.findUnique.mockResolvedValue({
            value: JSON.stringify({ scrapAnomalyPercent: 10 }),
        });
        mocks.prisma.machineDowntime.findMany.mockRejectedValue(
            new Error('downtime unavailable'),
        );
        mocks.prisma.productionExecution.findMany.mockImplementation(
            async ({ where }: { where: { startTime?: unknown } }) =>
                where.startTime
                    ? []
                    : [
                          {
                              productionOrderId: 'spk-1',
                              quantityProduced: 94,
                              scrapQuantity: 6,
                              scrapProngkolQty: 0,
                              scrapDaunQty: 0,
                          },
                      ],
        );

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || result.data.state !== 'AVAILABLE') return;
        expect(result.data.health.downtime.state).toBe('UNAVAILABLE');
        expect(result.data.drivers.state).toBe('UNAVAILABLE');
        expect(result.data.drivers.lateProcess).toMatchObject({
            processKey: 'MIXING',
            lateCount: 1,
        });
        expect(result.data.attention.state).toBe('UNAVAILABLE');
        expect(
            result.data.attention.items.some(
                (item) => item.type === 'high_scrap',
            ),
        ).toBe(false);
        expect(
            result.data.attention.items.some((item) => item.type === 'late'),
        ).toBe(true);
    });

    it('does not fabricate threshold-derived states or items when the setting reader rejects', async () => {
        mocks.prisma.appSetting.findUnique.mockRejectedValue(
            new Error('setting unavailable'),
        );
        mocks.prisma.productionExecution.findMany.mockImplementation(
            async ({ where }: { where: { startTime?: unknown } }) =>
                where.startTime
                    ? []
                    : [
                          {
                              productionOrderId: 'spk-1',
                              quantityProduced: 94,
                              scrapQuantity: 6,
                              scrapProngkolQty: 0,
                              scrapDaunQty: 0,
                          },
                      ],
        );

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || result.data.state !== 'AVAILABLE') return;
        expect(result.data.health.downtime).toMatchObject({
            state: 'UNAVAILABLE',
            thresholdMinutes: null,
            longest: null,
        });
        expect(result.data.drivers.state).toBe('UNAVAILABLE');
        expect(result.data.drivers.longestDowntime).toBeNull();
        expect(
            result.data.attention.items.some(
                (item) =>
                    item.type === 'downtime' || item.type === 'high_scrap',
            ),
        ).toBe(false);
        expect(
            result.data.attention.items.some((item) => item.type === 'late'),
        ).toBe(true);
    });

    it('preserves the existing scrap attention threshold outside Health and Drivers', async () => {
        mocks.prisma.appSetting.findUnique.mockResolvedValue({
            value: JSON.stringify({ scrapAnomalyPercent: 10 }),
        });
        mocks.prisma.productionExecution.findMany.mockImplementation(
            async ({ where }: { where: { startTime?: unknown } }) =>
                where.startTime
                    ? []
                    : [
                          {
                              productionOrderId: 'spk-1',
                              quantityProduced: 94,
                              scrapQuantity: 6,
                              scrapProngkolQty: 0,
                              scrapDaunQty: 0,
                          },
                      ],
        );

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || result.data.state !== 'AVAILABLE') return;
        expect(
            result.data.attention.items.some(
                (item) => item.type === 'high_scrap',
            ),
        ).toBe(false);
    });

    it('marks output unavailable instead of claiming a partial total when the safety bound is exceeded', async () => {
        mocks.prisma.productionExecution.findMany.mockImplementation(
            async ({ where }: { where: { startTime?: unknown } }) =>
                where.startTime
                    ? Array.from({ length: 2001 }, (_, index) =>
                          outputExecution('KG', `product-${index}`, 1),
                      )
                    : [],
        );

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || result.data.state !== 'AVAILABLE') return;
        expect(result.data.health.output).toMatchObject({
            state: 'UNAVAILABLE',
            totalGroups: 2000,
            returned: 6,
            truncated: true,
        });
    });

    it('marks active-order detail sections unavailable when the complete composition bound is exceeded', async () => {
        mocks.prisma.productionOrder.count
            .mockResolvedValueOnce(501)
            .mockResolvedValueOnce(200)
            .mockResolvedValueOnce(0);
        mocks.prisma.productionOrder.findMany.mockImplementation(
            async ({ where }: { where: { status: string } }) =>
                where.status === 'IN_PROGRESS'
                    ? Array.from({ length: 501 }, (_, index) =>
                          activeOrder({ id: `spk-${index}` }),
                      )
                    : [],
        );

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || result.data.state !== 'AVAILABLE') return;
        expect(result.data.health.activeSpk).toMatchObject({
            state: 'AVAILABLE',
            total: 501,
            lateTotal: 200,
        });
        expect(result.data.liveOrders).toMatchObject({
            state: 'UNAVAILABLE',
            total: 501,
            lateTotal: 200,
            returned: 0,
        });
        expect(result.data.attention.state).toBe('UNAVAILABLE');
        expect(result.data.drivers.state).toBe('UNAVAILABLE');
    });

    it('returns complete totals separately from bounded deterministic samples and Drivers', async () => {
        mocks.prisma.productionOrder.count
            .mockResolvedValueOnce(9)
            .mockResolvedValueOnce(7)
            .mockResolvedValueOnce(4);
        mocks.prisma.productionOrder.findMany.mockImplementation(
            async ({ where }: { where: { status: string } }) =>
                where.status === 'IN_PROGRESS'
                    ? Array.from({ length: 9 }, (_, index) =>
                          activeOrder({
                              id: `spk-${index}`,
                              orderNumber: `SPK-${index}`,
                              plannedEndDate: new Date(
                                  Date.parse('2026-10-09T07:59:00.000Z') -
                                      index * 60_000,
                              ),
                              bom: {
                                  category: index < 5 ? 'MIXING' : 'PACKING',
                                  productVariant: {
                                      name: `Product ${index}`,
                                      primaryUnit: 'KG',
                                  },
                              },
                          }),
                      )
                    : Array.from({ length: 4 }, (_, index) => ({
                          id: `wait-${index}`,
                          orderNumber: `WAIT-${index}`,
                          createdAt: new Date('2026-10-09T06:00:00.000Z'),
                          bom: { category: 'MIXING' },
                      })),
        );

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || result.data.state !== 'AVAILABLE') return;
        expect(result.data.health.activeSpk).toMatchObject({
            total: 9,
            lateTotal: 7,
        });
        expect(result.data.liveOrders).toMatchObject({ total: 9, returned: 5 });
        expect(result.data.liveOrders.items).toHaveLength(5);
        expect(result.data.drivers.lateProcess).toMatchObject({
            processKey: 'MIXING',
            lateCount: 5,
        });
        expect(result.data.attention.total).toBeGreaterThan(
            result.data.attention.returned,
        );
    });

    it('keeps successful sections when an independent section reader fails', async () => {
        mocks.prisma.productionExecution.findMany.mockImplementation(
            async ({ where }: { where: { startTime?: unknown } }) => {
                if (where.startTime) throw new Error('output unavailable');
                return [];
            },
        );
        mocks.prisma.productionIssue.findMany.mockRejectedValue(
            new Error('issues unavailable'),
        );

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || result.data.state !== 'AVAILABLE') return;
        expect(result.data.health.output.state).toBe('UNAVAILABLE');
        expect(result.data.health.activeSpk.state).toBe('AVAILABLE');
        expect(result.data.health.downtime.state).toBe('AVAILABLE');
        expect(result.data.attention.state).toBe('UNAVAILABLE');
        expect(result.data.attention.items.length).toBeGreaterThan(0);
    });

    it('keeps old historical shift truth without a false never-had-shift alert', async () => {
        mocks.prisma.productionOrder.findMany.mockImplementation(
            async ({ where }: { where: { status: string } }) =>
                where.status === 'IN_PROGRESS'
                    ? [
                          activeOrder({
                              _count: { shifts: 0 },
                              shifts: [],
                              executions: [],
                          }),
                      ]
                    : [],
        );
        mocks.prisma.productionShift.groupBy.mockResolvedValue([
            {
                productionOrderId: 'spk-1',
                _count: { _all: 1 },
            },
        ]);
        mocks.prisma.productionShift.findMany.mockResolvedValue([
            {
                productionOrderId: 'spk-1',
                startTime: new Date('2026-10-01T06:00:00.000Z'),
                endTime: new Date('2026-10-01T09:00:00.000Z'),
            },
        ]);

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || result.data.state !== 'AVAILABLE') return;
        expect(
            result.data.attention.items.some(
                (item) => item.type === 'no_shift',
            ),
        ).toBe(false);
    });

    it('alerts when the complete batched facts prove an active SPK never had a shift', async () => {
        mocks.prisma.productionOrder.findMany.mockImplementation(
            async ({ where }: { where: { status: string } }) =>
                where.status === 'IN_PROGRESS'
                    ? [
                          activeOrder({
                              _count: { shifts: 0 },
                              shifts: [],
                              executions: [],
                          }),
                      ]
                    : [],
        );
        mocks.prisma.productionShift.groupBy.mockResolvedValue([]);
        mocks.prisma.productionShift.findMany.mockResolvedValue([]);

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || result.data.state !== 'AVAILABLE') return;
        expect(
            result.data.attention.items.some(
                (item) => item.type === 'no_shift',
            ),
        ).toBe(true);
    });

    it('emits exactly no_operator for an active count with one returned unassigned row', async () => {
        mocks.prisma.productionOrder.findMany.mockImplementation(
            async ({ where }: { where: { status: string } }) =>
                where.status === 'IN_PROGRESS'
                    ? [
                          activeOrder({
                              _count: { shifts: 1 },
                              shifts: [
                                  {
                                      operatorId: null as never,
                                      operator: null as never,
                                      startTime: new Date(
                                          '2026-10-09T06:00:00.000Z',
                                      ),
                                      endTime: new Date(
                                          '2026-10-09T09:00:00.000Z',
                                      ),
                                  },
                              ],
                          }),
                      ]
                    : [],
        );

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || result.data.state !== 'AVAILABLE') return;
        expect(
            result.data.attention.items.filter(
                (item) => item.type === 'no_operator',
            ),
        ).toHaveLength(1);
        expect(
            result.data.attention.items.some(
                (item) => item.type === 'no_shift',
            ),
        ).toBe(false);
        expect(result.data.liveOrders.items[0]?.operatorName).toBe(
            'Unassigned',
        );
    });

    it('keeps assigned active-shift truth from an explicit active count beyond the returned row', async () => {
        mocks.prisma.productionOrder.findMany.mockImplementation(
            async ({ where }: { where: { status: string } }) =>
                where.status === 'IN_PROGRESS'
                    ? [
                          activeOrder({
                              _count: { shifts: 25 },
                              shifts: [
                                  {
                                      operatorId: 'operator-1',
                                      operator: { name: 'Synthetic operator' },
                                      startTime: new Date(
                                          '2026-10-09T06:00:00.000Z',
                                      ),
                                      endTime: new Date(
                                          '2026-10-09T09:00:00.000Z',
                                      ),
                                  },
                              ],
                          }),
                      ]
                    : [],
        );
        mocks.prisma.productionShift.groupBy.mockResolvedValue([
            {
                productionOrderId: 'spk-1',
                _count: { _all: 25 },
            },
        ]);
        mocks.prisma.productionShift.findMany.mockResolvedValue([
            {
                productionOrderId: 'spk-1',
                startTime: new Date('2026-10-09T06:00:00.000Z'),
                endTime: new Date('2026-10-09T09:00:00.000Z'),
            },
        ]);

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || result.data.state !== 'AVAILABLE') return;
        expect(
            result.data.attention.items.some(
                (item) =>
                    item.type === 'no_shift' || item.type === 'no_operator',
            ),
        ).toBe(false);
    });

    it('uses one fixed bounded query shape without service/query calls in loops', async () => {
        await getProductionLiveOverview();

        expect(mocks.prisma.productionExecution.findMany).toHaveBeenCalledTimes(2);
        expect(mocks.prisma.productionExecution.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                take: 2001,
                where: expect.objectContaining({
                    productionOrder: { status: 'IN_PROGRESS' },
                }),
            }),
        );
        expect(mocks.prisma.productionOrder.findMany).toHaveBeenCalledTimes(2);
        expect(mocks.prisma.productionOrder.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                take: 501,
                select: expect.objectContaining({
                    _count: {
                        select: {
                            shifts: {
                                where: {
                                    startTime: {
                                        lte: new Date(
                                            '2026-10-09T08:00:00.000Z',
                                        ),
                                    },
                                    endTime: {
                                        gte: new Date(
                                            '2026-10-09T08:00:00.000Z',
                                        ),
                                    },
                                },
                            },
                        },
                    },
                    shifts: expect.objectContaining({
                        take: 1,
                        where: {
                            startTime: {
                                lte: new Date('2026-10-09T08:00:00.000Z'),
                            },
                            endTime: {
                                gte: new Date('2026-10-09T08:00:00.000Z'),
                            },
                        },
                    }),
                    executions: expect.objectContaining({ take: 1 }),
                }),
            }),
        );
        expect(mocks.prisma.productionOrder.count).toHaveBeenCalledTimes(3);
        expect(mocks.prisma.productionOrder.count).toHaveBeenCalledWith({
            where: { status: 'IN_PROGRESS' },
        });
        expect(mocks.prisma.productionOrder.count).toHaveBeenCalledWith({
            where: {
                status: 'IN_PROGRESS',
                plannedEndDate: { lt: new Date('2026-10-09T08:00:00.000Z') },
            },
        });
        expect(mocks.prisma.productionIssue.count).toHaveBeenCalledWith({
            where: { status: 'OPEN' },
        });
        expect(mocks.prisma.productionIssue.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { status: 'OPEN' } }),
        );
        expect(mocks.prisma.productionShift.groupBy).toHaveBeenCalledOnce();
        expect(mocks.prisma.productionShift.groupBy).toHaveBeenCalledWith({
            by: ['productionOrderId'],
            where: { productionOrderId: { in: ['spk-1'] } },
            _count: { _all: true },
        });
        expect(mocks.prisma.productionShift.findMany).toHaveBeenCalledOnce();
        expect(mocks.prisma.productionShift.findMany).toHaveBeenCalledWith({
            where: { productionOrderId: { in: ['spk-1'] } },
            orderBy: [
                { productionOrderId: 'asc' },
                { startTime: 'desc' },
                { id: 'asc' },
            ],
            distinct: ['productionOrderId'],
            select: {
                productionOrderId: true,
                startTime: true,
                endTime: true,
            },
        });
        expect(mocks.prisma.machineDowntime.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 12 }),
        );
        expect(mocks.prisma.productionIssue.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 12 }),
        );
    });
});
