import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    output: vi.fn(),
    orderCount: vi.fn(),
    orders: vi.fn(),
    downtime: vi.fn(),
    downtimeCount: vi.fn(),
    setting: vi.fn(),
    qc: vi.fn(),
    employees: vi.fn(),
    attendance: vi.fn(),
    shifts: vi.fn(),
    auth: vi.fn(),
    portal: vi.fn(),
}));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/mobile/mobile-portal-access', () => ({
    requireMobilePortalAccess: m.portal,
}));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: m.auth }));
vi.mock('@/lib/core/prisma', () => {
    const prisma = {
        productionOrder: { findMany: m.orders, count: m.orderCount },
        productionExecution: { findMany: m.output },
        machineDowntime: {
            findMany: m.downtime,
            count: m.downtimeCount,
        },
        appSetting: { findUnique: m.setting },
        qualityInspection: { count: m.qc },
        employee: { findMany: m.employees },
        attendanceRecord: { findMany: m.attendance },
        workShift: { findMany: m.shifts },
    };
    return { prisma, getTenantDbFromContext: () => prisma };
});

import {
    getMobileTeamAttendance,
    getProductionSupervisorOverview,
} from '../mobile-supervisor';

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T03:00:00Z'));
    m.auth.mockResolvedValue({ user: { role: 'PRODUCTION' } });
    m.portal.mockResolvedValue({ permissions: 'ALL' });
    m.orders.mockResolvedValue([]);
    m.orderCount.mockResolvedValue(25);
    m.output.mockResolvedValue([]);
    m.qc.mockResolvedValue(0);
    m.downtime.mockResolvedValue([]);
    m.downtimeCount.mockResolvedValue(0);
    m.setting.mockResolvedValue(null);
    m.employees.mockResolvedValue([]);
    m.attendance.mockResolvedValue([]);
    m.shifts.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('mobile production read semantics', () => {
    it('keeps full active count and daily downtime factual without total severity', async () => {
        m.downtimeCount.mockResolvedValue(1);
        m.downtime
            .mockResolvedValueOnce([
                {
                    id: 'ongoing',
                    machineId: 'm',
                    machine: { code: 'M', type: 'MIXER' },
                    reason: 'Synthetic',
                    startTime: new Date('2026-09-22T16:00:00Z'),
                },
            ])
            .mockResolvedValueOnce([
                ...Array.from({ length: 6 }, () => ({
                    startTime: new Date('2026-09-23T02:00:00Z'),
                    endTime: new Date('2026-09-23T02:10:00Z'),
                })),
                {
                    startTime: new Date('2026-09-22T16:00:00Z'),
                    endTime: null,
                },
            ]);

        const result = await getProductionSupervisorOverview();

        expect(result).toMatchObject({
            success: true,
            data: {
                health: {
                    activeSpk: { status: 'AVAILABLE', data: { count: 25 } },
                    downtime: {
                        status: 'AVAILABLE',
                        data: {
                            totalMinutesToday: 660,
                            longest: { incidentId: 'ongoing', minutes: 660 },
                        },
                    },
                },
            },
        });
        expect(m.output.mock.calls[0][0].where).toEqual({
            status: { not: 'VOIDED' },
            startTime: {
                gte: new Date('2026-09-22T17:00:00Z'),
                lte: new Date('2026-09-23T16:59:59.999Z'),
            },
        });
    });

    it('fails downtime independently rather than inventing zero', async () => {
        m.downtime.mockRejectedValue(new Error('Synthetic unavailable'));
        expect(await getProductionSupervisorOverview()).toMatchObject({
            success: true,
            data: {
                health: {
                    downtime: { status: 'UNAVAILABLE', data: null },
                    activeSpk: { status: 'AVAILABLE', data: { count: 25 } },
                },
            },
        });
    });

    it('derives NO_RECORD after reading detailed attendance without an enum filter', async () => {
        m.employees.mockResolvedValue([
            { id: 'one', name: 'One', code: 'E1', role: 'OPERATOR' },
            { id: 'two', name: 'Two', code: 'E2', role: 'PACKER' },
        ]);
        m.attendance.mockResolvedValue([
            {
                id: 'a',
                employeeId: 'one',
                status: 'PRESENT',
                employee: { id: 'one' },
                workShift: { id: 's', name: 'Shift' },
                workDate: new Date(),
                clockInAt: null,
            },
        ]);
        expect(
            await getMobileTeamAttendance({
                date: '2026-09-23',
                status: 'NO_RECORD',
            }),
        ).toMatchObject({
            success: true,
            data: { noRecordCount: 1, records: [{ employeeId: 'two' }] },
        });
        expect(m.attendance.mock.calls[0][0].where).not.toHaveProperty('status');
    });
});
