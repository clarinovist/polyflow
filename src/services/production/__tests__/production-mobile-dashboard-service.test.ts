import { describe, expect, it, vi } from 'vitest';
import {
    collectProductionMobileOverview,
    type ProductionMobileOverviewReader,
} from '../production-mobile-dashboard-service';
import { composeProductionOutputHealth } from '../production-dashboard-health-service';

const now = new Date('2026-10-09T08:00:00.000Z');

function output(unit: 'KG' | 'PCS', quantity: number, category: 'MIXING' | 'PACKING') {
    return {
        quantityProduced: quantity,
        productionOrder: {
            id: `${unit}-${category}`,
            bom: {
                category,
                productVariant: {
                    id: `${unit}-${category}`,
                    name: `${unit} product`,
                    skuCode: unit,
                    primaryUnit: unit,
                },
            },
        },
    };
}

function reader(): ProductionMobileOverviewReader {
    return {
        readOutputToday: vi
            .fn()
            .mockResolvedValue(
                composeProductionOutputHealth(
                    [output('KG', 10, 'MIXING'), output('PCS', 4, 'PACKING')],
                    false,
                ),
            ),
        readActiveSpk: vi.fn().mockResolvedValue({ count: 0 }),
        readQcPending: vi.fn().mockResolvedValue({ count: 0 }),
        readPendingMaintenance: vi.fn().mockResolvedValue({ count: 3 }),
        readPendingMaterialOrders: vi.fn().mockResolvedValue({ count: 2 }),
        readDowntime: vi.fn().mockResolvedValue({
            openCount: 2,
            thresholdValue: JSON.stringify({ downtimeCriticalMinutes: 90 }),
            totalMinutesToday: 160,
            openRows: [
                {
                    id: 'short',
                    machineId: 'm1',
                    startTime: new Date('2026-10-09T07:30:00Z'),
                    reason: 'Short',
                    machine: { code: 'M1', type: 'MIXER' },
                },
                {
                    id: 'long',
                    machineId: 'm2',
                    startTime: new Date('2026-10-09T06:00:00Z'),
                    reason: 'Long',
                    machine: { code: 'M2', type: 'EXTRUDER' },
                },
            ],
        }),
    };
}

describe('production mobile canonical composition', () => {
    it('keeps mixed and single units grouped, uses longest incident, and withholds unsigned metrics', async () => {
        const result = await collectProductionMobileOverview({
            reader: reader(),
            now,
            canOpen: () => true,
            canCreateSpk: true,
            audience: 'OPERATIONAL',
            canApprove: false,
        });

        expect(result.health.outputToday).toMatchObject({
            status: 'AVAILABLE',
            data: {
                processTotals: [
                    { processKey: 'MIXING', unit: 'KG', quantity: 10 },
                    { processKey: 'PACKING', unit: 'PCS', quantity: 4 },
                ],
            },
        });
        expect(result.health.downtime).toEqual({
            status: 'AVAILABLE',
            data: {
                openCount: 2,
                totalMinutesToday: 160,
                thresholdMinutes: 90,
                longest: {
                    incidentId: 'long',
                    machineId: 'm2',
                    machineCode: 'M2',
                    reason: 'Long',
                    minutes: 120,
                    severity: 'red',
                },
            },
        });
        expect(result.health.targetAttainment.status).toBe('NOT_CONFIGURED');
        expect(result.health.scrapSeverity.status).toBe('NOT_CONFIGURED');
        expect(JSON.stringify(result)).not.toMatch(
            /targetToday|efficiency|scrapToday|scrapRate/,
        );
    });

    it.each([
        { label: 'absent', value: null },
        { label: 'malformed', value: '{bad' },
    ])('uses canonical parser default for a successfully read $label threshold', async ({ value }) => {
        const testReader = reader();
        vi.mocked(testReader.readDowntime).mockResolvedValue({
            openCount: 0,
            thresholdValue: value,
            totalMinutesToday: 0,
            openRows: [],
        });

        const result = await collectProductionMobileOverview({
            reader: testReader,
            now,
            canOpen: () => false,
            canCreateSpk: false,
            audience: 'EXECUTIVE',
            canApprove: false,
        });

        expect(result.health.downtime).toMatchObject({
            status: 'AVAILABLE',
            data: { thresholdMinutes: 30, openCount: 0, longest: null },
        });
    });

    it('keeps failures independent, valid zero available, and projects links server-side', async () => {
        const testReader = reader();
        vi.mocked(testReader.readOutputToday).mockRejectedValue(
            new Error('output'),
        );
        vi.mocked(testReader.readDowntime).mockRejectedValue(
            new Error('threshold source failed'),
        );

        const result = await collectProductionMobileOverview({
            reader: testReader,
            now,
            canOpen: (href) => href.endsWith('/attendance'),
            canCreateSpk: true,
            audience: 'OPERATIONAL',
            canApprove: false,
        });

        expect(result.health.outputToday).toEqual({
            status: 'UNAVAILABLE',
            data: null,
        });
        expect(result.health.downtime).toEqual({
            status: 'UNAVAILABLE',
            data: null,
        });
        expect(result.health.activeSpk).toEqual({
            status: 'AVAILABLE',
            data: { count: 0 },
        });
        expect(result.links).toEqual({
            maintenance: null,
            attendance: '/production/mobile/attendance',
            quickSpk: null,
        });
    });
});

describe('production mobile pending approvals', () => {
    async function collect(
        testReader: ProductionMobileOverviewReader,
        overrides: { canApprove?: boolean; canOpen?: (href: string) => boolean } = {},
    ) {
        return collectProductionMobileOverview({
            reader: testReader,
            now,
            canOpen: overrides.canOpen ?? (() => true),
            canCreateSpk: false,
            audience: 'EXECUTIVE',
            canApprove: overrides.canApprove ?? true,
        });
    }

    it('returns pending maintenance and material order counts with links for approvers', async () => {
        const result = await collect(reader());

        expect(result.pendingApprovals).toEqual({
            maintenance: {
                status: 'AVAILABLE',
                data: { count: 3 },
            },
            materialOrders: {
                status: 'AVAILABLE',
                data: { count: 2 },
            },
            links: {
                maintenance: '/production/mobile/maintenance',
                materialOrders: '/production/mobile/material-orders',
            },
        });
    });

    it('omits the block and never queries pending approvals for non-approvers', async () => {
        const testReader = reader();

        const result = await collect(testReader, { canApprove: false });

        expect(result.pendingApprovals).toBeNull();
        expect(testReader.readPendingMaintenance).not.toHaveBeenCalled();
        expect(testReader.readPendingMaterialOrders).not.toHaveBeenCalled();
    });

    it('keeps one failing approval query independent from the other and from the page', async () => {
        const testReader = reader();
        vi.mocked(testReader.readPendingMaintenance).mockRejectedValue(
            new Error('maintenance'),
        );

        const result = await collect(testReader);

        expect(result.pendingApprovals?.maintenance).toEqual({
            status: 'UNAVAILABLE',
            data: null,
        });
        expect(result.pendingApprovals?.materialOrders).toEqual({
            status: 'AVAILABLE',
            data: { count: 2 },
        });
        expect(result.health.activeSpk.status).toBe('AVAILABLE');
    });

    it('keeps a valid zero count available', async () => {
        const testReader = reader();
        vi.mocked(testReader.readPendingMaterialOrders).mockResolvedValue({
            count: 0,
        });

        const result = await collect(testReader);

        expect(result.pendingApprovals?.materialOrders).toEqual({
            status: 'AVAILABLE',
            data: { count: 0 },
        });
    });

    it('only projects links for paths the viewer may open', async () => {
        const result = await collect(reader(), {
            canOpen: (href) => href.endsWith('/material-orders'),
        });

        expect(result.pendingApprovals?.links).toEqual({
            maintenance: null,
            materialOrders: '/production/mobile/material-orders',
        });
    });
});
