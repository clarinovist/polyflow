import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/findings/finding-routing', () => ({
  resolveUsersForResources: vi.fn().mockResolvedValue(['user-1']),
}));

vi.mock('../note-composer', () => ({
  composeNotes: vi.fn(),
  defaultPriorityForDetector: (d: string) =>
    d === 'missing_finance_journal' ? 'CRITICAL' : 'NORMAL',
}));

vi.mock('../note-memory', () => ({
  readNoteMemory: vi.fn(),
  formatMemoryForPrompt: () => '',
}));

import { runCeoNotesForTenant } from '../note-service';
import { composeNotes } from '../note-composer';
import { readNoteMemory } from '../note-memory';
import type { ExecutiveStats } from '@/services/dashboard/executive-stats-service';

function makeStats(): ExecutiveStats {
  return {
    sales: { mtdRevenue: 1, activeOrders: 0, pendingInvoices: 0 },
    purchasing: { mtdSpending: 0, pendingPOs: 0 },
    production: {
      activeJobs: 0,
      delayedJobs: 0,
      completionRate: 0,
      yieldRate: 0,
      totalScrapKg: 0,
      downtimeHours: 0,
      runningMachines: 0,
      totalMachines: 0,
    },
    inventory: { totalValue: 0, lowStockCount: 0, totalItems: 0 },
    cashflow: { overdueReceivables: 0, overduePayables: 0, invoicesDueThisWeek: 0 },
    revenueTrendChart: [],
  };
}

function makeTenantDb() {
  return {
    ceoNote: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args: Record<string, unknown>) =>
        Promise.resolve({ id: 'new-1', ...(args.data as object) }),
      ),
      findMany: vi.fn().mockResolvedValue([
        { id: 'new-1', title: 'T', body: 'B', assignedUserIds: ['user-1'] },
      ]),
      update: vi.fn().mockResolvedValue({}),
    },
    ceoNoteEvent: { create: vi.fn().mockResolvedValue({}) },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

describe('runCeoNotesForTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readNoteMemory).mockResolvedValue({
      openRecurrences: [],
      patternLines: [],
    });
  });

  it('skips when there is nothing detected', async () => {
    const tenantDb = makeTenantDb();
    const outcome = await runCeoNotesForTenant(tenantDb as never, {
      results: [],
      stats: makeStats(),
    });
    expect(outcome.skipped).toBe(true);
    expect(composeNotes).not.toHaveBeenCalled();
  });

  it('composes, publishes and notifies end to end', async () => {
    vi.mocked(composeNotes).mockResolvedValue({
      notes: [
        {
          title: 'Stok karung kritis',
          body: 'B',
          suggestedSteps: [],
          priority: 'NORMAL',
          requiredResources: ['/warehouse/inventory'],
          sourceDetectors: ['critical_stock'],
          sourceFingerprints: ['critical_stock:p-1'],
        },
      ],
      aiModel: 'm',
      usedFallback: false,
    });
    const tenantDb = makeTenantDb();
    const outcome = await runCeoNotesForTenant(tenantDb as never, {
      results: [
        {
          detector: 'critical_stock',
          status: 'ok',
          requiredResources: ['/warehouse/inventory'],
          items: [
            {
              entityKey: 'critical_stock:p-1',
              entityType: 'Product',
              entityId: 'p-1',
              severity: 'critical',
              headline: 'Karung: 5 < 20',
            },
          ],
        },
      ],
      stats: makeStats(),
    });
    expect(outcome.created).toEqual(['new-1']);
    expect(outcome.notificationsSent).toBe(1);
    expect(outcome.usedFallback).toBe(false);
  });
});
