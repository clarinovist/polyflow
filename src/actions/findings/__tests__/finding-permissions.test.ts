import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: <T extends (...args: unknown[]) => unknown>(action: T) => action,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/telegram/permissions', () => ({
    resolveAllowedResources: vi.fn(),
}));

const { mockFinding, mockFindingEvent } = vi.hoisted(() => ({
    mockFinding: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
    },
    mockFindingEvent: { create: vi.fn() },
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        finding: mockFinding,
        findingEvent: mockFindingEvent,
        $transaction: vi.fn(),
    },
}));

import {
    claimFinding,
    listMyFindings,
    snoozeFinding,
} from '../finding-actions';
import { requireAuth } from '@/lib/tools/auth-checks';
import { resolveAllowedResources } from '@/lib/telegram/permissions';
import { DETECTOR_RESOURCES } from '@/lib/findings/detector-catalog';

// Grants mirroring the seeded defaults in actions/admin/permissions.ts, plus a
// finance role limited to the invoice pages. 'ALL' is what ADMIN resolves to.
const ADMIN = 'ALL' as const;
const FINANCE_DEFAULT = ['/dashboard', '/finance', '/sales/invoices', '/hrd'];
const FINANCE_INVOICES_ONLY = ['/finance/invoices'];
const WAREHOUSE_DEFAULT = ['/warehouse', '/kiosk'];

const ALL_DETECTORS = Object.keys(DETECTOR_RESOURCES);
const ALL_ROWS = ALL_DETECTORS.map((detector) => ({
    id: detector,
    detector,
    requiredResources: [
        ...DETECTOR_RESOURCES[detector as keyof typeof DETECTOR_RESOURCES],
    ],
}));

async function visibleDetectors(allowed: string[] | 'ALL') {
    vi.mocked(resolveAllowedResources).mockResolvedValue(allowed);
    mockFinding.findMany.mockResolvedValue(ALL_ROWS);
    const result = await listMyFindings();
    if (!result.success) throw new Error(result.error);
    return (result.data as Array<{ detector: string }>).map((f) => f.detector);
}

describe('findings visibility per role', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockResolvedValue({
            user: { id: 'user-1' },
        } as never);
    });

    it('lets ADMIN see every detector', async () => {
        expect(await visibleDetectors(ADMIN)).toEqual(ALL_DETECTORS);
    });

    it('lets a finance role see AR, AP and journal findings, not stock or SO', async () => {
        const seen = await visibleDetectors(FINANCE_DEFAULT);

        expect(seen).toEqual(
            expect.arrayContaining([
                'overdue_ar',
                'overdue_ap',
                'missing_finance_journal',
            ]),
        );
        expect(seen).not.toContain('critical_stock');
        expect(seen).not.toContain('stuck_so');
        expect(seen).not.toContain('production_no_progress');
    });

    it('limits an invoices-only finance grant to AR and AP', async () => {
        expect(await visibleDetectors(FINANCE_INVOICES_ONLY)).toEqual([
            'overdue_ar',
            'overdue_ap',
        ]);
    });

    it('hides AR from a warehouse role and shows only stock', async () => {
        const seen = await visibleDetectors(WAREHOUSE_DEFAULT);

        expect(seen).not.toContain('overdue_ar');
        expect(seen).toEqual(['critical_stock']);
    });

    it('shows nothing to a user without grants (empty state, not an error)', async () => {
        expect(await visibleDetectors([])).toEqual([]);
    });
});

describe('findings actions enforce the same visibility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockResolvedValue({
            user: { id: 'user-1' },
        } as never);
        vi.mocked(resolveAllowedResources).mockResolvedValue(WAREHOUSE_DEFAULT);
        mockFinding.findUnique.mockResolvedValue({
            status: 'UNCLAIMED',
            requiredResources: ['/sales/invoices', '/finance/invoices'],
            detector: 'overdue_ar',
        });
    });

    it('rejects claiming an AR finding for a warehouse role', async () => {
        const result = await claimFinding('ar-1');

        expect(result.success).toBe(false);
        expect(mockFinding.updateMany).not.toHaveBeenCalled();
    });

    it('rejects snoozing an AR finding for a warehouse role', async () => {
        const result = await snoozeFinding('ar-1', 3, 'janji bayar tanggal 15');

        expect(result.success).toBe(false);
        expect(mockFinding.update).not.toHaveBeenCalled();
    });
});
