import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
  getMainPrisma: vi.fn(),
  getTenantDb: vi.fn(),
}));

vi.mock('@/lib/modules/tenant-entitlements', () => ({
  hasTenantModuleDirect: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/telegram/kill-switch', () => ({
  getPilotSubdomain: vi.fn().mockReturnValue('melindo'),
  isKillSwitchActive: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/telegram/send-message', () => ({
  sendTelegramMessage: vi.fn(),
}));

vi.mock('@/lib/telegram/permissions', () => ({
  resolveAllowedResourcesForTenant: vi.fn(),
}));

vi.mock('@/lib/telegram/audit', () => ({
  logTelegramAudit: vi.fn(),
}));

vi.mock('@/lib/telegram/notification-dedup', () => ({
  buildDedupKey: vi.fn().mockReturnValue('dedup-key-123'),
  isDuplicate: vi.fn().mockResolvedValue(false),
  recordNotificationAttempt: vi.fn(),
}));

vi.mock('@/lib/bot/feature-flags', () => ({
  isFeatureEnabled: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/findings/finding-sync', () => ({
  syncFindings: vi.fn().mockResolvedValue({
    created: [],
    reopened: [],
    updated: [],
    unsnoozed: [],
    autoResolved: [],
    skippedDetectors: [],
  }),
}));

vi.mock('@/lib/findings/finding-notify', () => ({
  notifyNewFindings: vi.fn().mockResolvedValue({
    findingsProcessed: 0,
    notificationsSent: 0,
  }),
}));

vi.mock('@/lib/findings/finding-escalate', () => ({
  escalateOverdueFindings: vi.fn().mockResolvedValue({
    escalated: [],
    ownerRecipients: 0,
  }),
}));

vi.mock('../detectors', () => ({
  detectCriticalStock: vi.fn(),
  detectStuckSalesOrders: vi.fn(),
  detectOverdueAr: vi.fn(),
  detectOverdueAp: vi.fn(),
  detectProductionNoProgress: vi.fn(),
}));

// toDigestFindings is real (pure/deterministic) so these tests exercise the
// actual capping/flattening logic; only formatDigestMarkdown stays a spy.
vi.mock('../format', async () => {
  const actual = await vi.importActual<typeof import('../format')>('../format');
  return { ...actual, formatDigestMarkdown: vi.fn() };
});

import { runDigest } from '../digest-service';
import { getMainPrisma, getTenantDb } from '@/lib/core/prisma';
import { hasTenantModuleDirect } from '@/lib/modules/tenant-entitlements';
import { isKillSwitchActive } from '@/lib/telegram/kill-switch';
import { sendTelegramMessage } from '@/lib/telegram/send-message';
import { resolveAllowedResourcesForTenant } from '@/lib/telegram/permissions';
import { logTelegramAudit } from '@/lib/telegram/audit';
import { isDuplicate, recordNotificationAttempt } from '@/lib/telegram/notification-dedup';
import { isFeatureEnabled } from '@/lib/bot/feature-flags';
import {
  detectCriticalStock,
  detectStuckSalesOrders,
  detectOverdueAr,
  detectOverdueAp,
  detectProductionNoProgress,
} from '../detectors';
import { formatDigestMarkdown } from '../format';
import { syncFindings } from '@/lib/findings/finding-sync';
import { notifyNewFindings } from '@/lib/findings/finding-notify';
import { escalateOverdueFindings } from '@/lib/findings/finding-escalate';
import type { DetectionResult, DetectedItem } from '../detection-types';

const mockGetMainPrisma = vi.mocked(getMainPrisma);
const mockGetTenantDb = vi.mocked(getTenantDb);
const mockSendTelegramMessage = vi.mocked(sendTelegramMessage);
const mockResolveAllowedResources = vi.mocked(resolveAllowedResourcesForTenant);
const mockRecordNotificationAttempt = vi.mocked(recordNotificationAttempt);
const mockLogTelegramAudit = vi.mocked(logTelegramAudit);

function emptyResult(
  detector: string,
  requiredResources: string[],
): DetectionResult {
  return { detector, status: 'ok', requiredResources, items: [] };
}

function okResult(
  detector: string,
  requiredResources: string[],
  items: DetectedItem[],
): DetectionResult {
  return { detector, status: 'ok', requiredResources, items };
}

function oneCriticalStockItem(headline = 'Test'): DetectedItem {
  return {
    entityKey: 'critical_stock:p-1',
    entityType: 'Product',
    entityId: 'p-1',
    severity: 'critical',
    headline,
  };
}

function oneOverdueArItem(headline = 'Invoice overdue'): DetectedItem {
  return {
    entityKey: 'overdue_ar:inv-1',
    entityType: 'Invoice',
    entityId: 'inv-1',
    severity: 'critical',
    headline,
  };
}

function makeMockTenantDb() {
  const findManyIdentity = vi.fn().mockResolvedValue([]);
  const findManyPref = vi.fn().mockResolvedValue([]);
  return {
    telegramIdentity: { findMany: findManyIdentity },
    telegramNotificationPreference: { findMany: findManyPref },
    _findManyIdentity: findManyIdentity,
    _findManyPref: findManyPref,
  };
}

describe('runDigest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isFeatureEnabled).mockReturnValue(true);
    vi.mocked(isKillSwitchActive).mockReturnValue(false);
    vi.mocked(isDuplicate).mockResolvedValue(false);
    vi.mocked(hasTenantModuleDirect).mockResolvedValue(true);
    vi.mocked(detectCriticalStock).mockResolvedValue(
      emptyResult('critical_stock', ['/warehouse/inventory']),
    );
    vi.mocked(detectStuckSalesOrders).mockResolvedValue(
      emptyResult('stuck_so', ['/sales/orders']),
    );
    vi.mocked(detectOverdueAr).mockResolvedValue(
      emptyResult('overdue_ar', ['/finance/invoices']),
    );
    vi.mocked(detectOverdueAp).mockResolvedValue(
      emptyResult('overdue_ap', ['/purchasing/invoices']),
    );
    vi.mocked(detectProductionNoProgress).mockResolvedValue(
      emptyResult('production_no_progress', ['/production/orders']),
    );
    mockGetMainPrisma.mockReturnValue({
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: 't-1', dbUrl: 'postgresql://x' }) },
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty when feature flag is off', async () => {
    vi.mocked(isFeatureEnabled).mockReturnValue(false);
    const result = await runDigest();
    expect(result.sent).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it('returns empty when kill switch is active', async () => {
    vi.mocked(isKillSwitchActive).mockReturnValue(true);
    const result = await runDigest();
    expect(result.sent).toBe(0);
  });

  it('returns empty when no pilot tenant', async () => {
    mockGetMainPrisma.mockReturnValue({
      tenant: { findUnique: vi.fn().mockResolvedValue(null) },
    } as never);
    const result = await runDigest();
    expect(result.sent).toBe(0);
  });

  it('skips recipient when dailyDigest is false', async () => {
    vi.mocked(detectCriticalStock).mockResolvedValue(
      okResult('critical_stock', ['/warehouse/inventory'], [
        oneCriticalStockItem('Test product low'),
      ]),
    );

    const mockDb = makeMockTenantDb();
    mockDb._findManyIdentity.mockResolvedValue([
      { userId: 'user-1', telegramUserId: 'tg-1', telegramChatId: 'chat-1' },
    ]);
    mockDb._findManyPref.mockResolvedValue([
      { userId: 'user-1', enabled: true, dailyDigest: false, timezone: 'Asia/Jakarta', quietHoursStart: null, quietHoursEnd: null },
    ]);
    mockGetTenantDb.mockReturnValue(mockDb as never);

    const result = await runDigest();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });

  it('skips when dedup detects duplicate', async () => {
    vi.mocked(detectCriticalStock).mockResolvedValue(
      okResult('critical_stock', ['/warehouse/inventory'], [oneCriticalStockItem()]),
    );
    vi.mocked(isDuplicate).mockResolvedValue(true);
    vi.mocked(mockResolveAllowedResources).mockResolvedValue('ALL');

    const mockDb = makeMockTenantDb();
    mockDb._findManyIdentity.mockResolvedValue([
      { userId: 'user-1', telegramUserId: 'tg-1', telegramChatId: 'chat-1' },
    ]);
    mockDb._findManyPref.mockResolvedValue([
      { userId: 'user-1', enabled: true, dailyDigest: true, timezone: 'Asia/Jakarta', quietHoursStart: null, quietHoursEnd: null },
    ]);
    mockGetTenantDb.mockReturnValue(mockDb as never);

    const result = await runDigest();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips when no relevant findings after permission filter', async () => {
    vi.mocked(detectCriticalStock).mockResolvedValue(
      okResult('critical_stock', ['/warehouse/inventory'], [oneCriticalStockItem()]),
    );
    vi.mocked(mockResolveAllowedResources).mockResolvedValue(['/sales/orders']);

    const mockDb = makeMockTenantDb();
    mockDb._findManyIdentity.mockResolvedValue([
      { userId: 'user-1', telegramUserId: 'tg-1', telegramChatId: 'chat-1' },
    ]);
    mockDb._findManyPref.mockResolvedValue([
      { userId: 'user-1', enabled: true, dailyDigest: true, timezone: 'Asia/Jakarta', quietHoursStart: null, quietHoursEnd: null },
    ]);
    mockGetTenantDb.mockReturnValue(mockDb as never);

    const result = await runDigest();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('sends digest when findings exist and recipient has access', async () => {
    vi.mocked(detectCriticalStock).mockResolvedValue(
      okResult('critical_stock', ['/warehouse/inventory'], [
        oneCriticalStockItem('Product A low'),
      ]),
    );
    vi.mocked(formatDigestMarkdown).mockReturnValue('*Test digest*');
    vi.mocked(sendTelegramMessage).mockResolvedValue({ ok: true, messageId: 123 });
    vi.mocked(mockResolveAllowedResources).mockResolvedValue('ALL');

    const mockDb = makeMockTenantDb();
    mockDb._findManyIdentity.mockResolvedValue([
      { userId: 'user-1', telegramUserId: 'tg-1', telegramChatId: 'chat-1' },
    ]);
    mockDb._findManyPref.mockResolvedValue([
      { userId: 'user-1', enabled: true, dailyDigest: true, timezone: 'Asia/Jakarta', quietHoursStart: null, quietHoursEnd: null },
    ]);
    mockGetTenantDb.mockReturnValue(mockDb as never);

    const result = await runDigest();
    expect(result.sent).toBe(1);
    expect(result.recipients).toBe(1);
    expect(mockSendTelegramMessage).toHaveBeenCalledWith('chat-1', '*Test digest*');
    expect(mockRecordNotificationAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SENT' }),
    );
    // Regression guard (2026-08-14): must resolve permissions against the
    // tenant DB explicitly, not the ambient prisma proxy — this cron path
    // never runs inside tenantContext.run().
    expect(mockResolveAllowedResources).toHaveBeenCalledWith(mockDb, 'user-1');
  });

  it('records FAILED when send fails', async () => {
    vi.mocked(detectCriticalStock).mockResolvedValue(
      okResult('critical_stock', ['/warehouse/inventory'], [oneCriticalStockItem()]),
    );
    vi.mocked(formatDigestMarkdown).mockReturnValue('*Test*');
    vi.mocked(sendTelegramMessage).mockResolvedValue({ ok: false, error: 'Telegram API error' });
    vi.mocked(mockResolveAllowedResources).mockResolvedValue('ALL');

    const mockDb = makeMockTenantDb();
    mockDb._findManyIdentity.mockResolvedValue([
      { userId: 'user-1', telegramUserId: 'tg-1', telegramChatId: 'chat-1' },
    ]);
    mockDb._findManyPref.mockResolvedValue([
      { userId: 'user-1', enabled: true, dailyDigest: true, timezone: 'Asia/Jakarta', quietHoursStart: null, quietHoursEnd: null },
    ]);
    mockGetTenantDb.mockReturnValue(mockDb as never);

    const result = await runDigest();
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
    expect(mockRecordNotificationAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('one detector rejecting outright does not cancel digest (allSettled defense-in-depth)', async () => {
    vi.mocked(detectCriticalStock).mockRejectedValue(new Error('DB down'));
    vi.mocked(detectOverdueAr).mockResolvedValue(
      okResult('overdue_ar', ['/finance/invoices'], [oneOverdueArItem()]),
    );
    vi.mocked(formatDigestMarkdown).mockReturnValue('*Test*');
    vi.mocked(sendTelegramMessage).mockResolvedValue({ ok: true, messageId: 456 });
    vi.mocked(mockResolveAllowedResources).mockResolvedValue('ALL');

    const mockDb = makeMockTenantDb();
    mockDb._findManyIdentity.mockResolvedValue([
      { userId: 'user-1', telegramUserId: 'tg-1', telegramChatId: 'chat-1' },
    ]);
    mockDb._findManyPref.mockResolvedValue([
      { userId: 'user-1', enabled: true, dailyDigest: true, timezone: 'Asia/Jakarta', quietHoursStart: null, quietHoursEnd: null },
    ]);
    mockGetTenantDb.mockReturnValue(mockDb as never);

    const result = await runDigest();
    expect(result.sent).toBe(1);
    expect(result.findings).toHaveLength(1);
  });

  it('one detector resolving status failed does not cancel digest and is not treated as clean', async () => {
    vi.mocked(detectCriticalStock).mockResolvedValue({
      detector: 'critical_stock',
      status: 'failed',
      error: 'DB down',
      requiredResources: ['/warehouse/inventory'],
      items: [],
    });
    vi.mocked(detectOverdueAr).mockResolvedValue(
      okResult('overdue_ar', ['/finance/invoices'], [oneOverdueArItem()]),
    );
    vi.mocked(formatDigestMarkdown).mockReturnValue('*Test*');
    vi.mocked(sendTelegramMessage).mockResolvedValue({ ok: true, messageId: 999 });
    vi.mocked(mockResolveAllowedResources).mockResolvedValue('ALL');

    const mockDb = makeMockTenantDb();
    mockDb._findManyIdentity.mockResolvedValue([
      { userId: 'user-1', telegramUserId: 'tg-1', telegramChatId: 'chat-1' },
    ]);
    mockDb._findManyPref.mockResolvedValue([
      { userId: 'user-1', enabled: true, dailyDigest: true, timezone: 'Asia/Jakarta', quietHoursStart: null, quietHoursEnd: null },
    ]);
    mockGetTenantDb.mockReturnValue(mockDb as never);

    const result = await runDigest();
    // Only the overdue_ar item should surface — the failed detector must not
    // silently contribute "no findings" as if it had run clean.
    expect(result.findings).toHaveLength(1);
    expect(result.sent).toBe(1);
  });

  it('skips non-entitled module detectors entirely', async () => {
    vi.mocked(hasTenantModuleDirect).mockImplementation(
      async (_tenantId, moduleKey) => moduleKey !== 'INVENTORY',
    );
    vi.mocked(detectOverdueAr).mockResolvedValue(
      okResult('overdue_ar', ['/finance/invoices'], [oneOverdueArItem()]),
    );
    vi.mocked(formatDigestMarkdown).mockReturnValue('*Test*');
    vi.mocked(sendTelegramMessage).mockResolvedValue({ ok: true, messageId: 789 });
    vi.mocked(mockResolveAllowedResources).mockResolvedValue('ALL');

    const mockDb = makeMockTenantDb();
    mockDb._findManyIdentity.mockResolvedValue([
      { userId: 'user-1', telegramUserId: 'tg-1', telegramChatId: 'chat-1' },
    ]);
    mockDb._findManyPref.mockResolvedValue([
      { userId: 'user-1', enabled: true, dailyDigest: true, timezone: 'Asia/Jakarta', quietHoursStart: null, quietHoursEnd: null },
    ]);
    mockGetTenantDb.mockReturnValue(mockDb as never);

    const result = await runDigest();

    expect(detectCriticalStock).not.toHaveBeenCalled();
    expect(detectOverdueAr).toHaveBeenCalled();
    expect(result.findings).toHaveLength(1);
    expect(result.sent).toBe(1);
  });

  it('returns empty findings when all detectors return empty', async () => {
    const mockDb = makeMockTenantDb();
    mockDb._findManyIdentity.mockResolvedValue([
      { userId: 'user-1', telegramUserId: 'tg-1', telegramChatId: 'chat-1' },
    ]);
    mockGetTenantDb.mockReturnValue(mockDb as never);

    const result = await runDigest();
    expect(result.findings).toHaveLength(0);
    expect(result.sent).toBe(0);
  });

  it('skips recipient in quiet hours (window covers current hour)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T02:00:00+07:00'));

    vi.mocked(detectCriticalStock).mockResolvedValue(
      okResult('critical_stock', ['/warehouse/inventory'], [oneCriticalStockItem()]),
    );
    vi.mocked(formatDigestMarkdown).mockReturnValue('*Test*');
    vi.mocked(mockResolveAllowedResources).mockResolvedValue('ALL');

    const mockDb = makeMockTenantDb();
    mockDb._findManyIdentity.mockResolvedValue([
      { userId: 'user-1', telegramUserId: 'tg-1', telegramChatId: 'chat-1' },
    ]);
    mockDb._findManyPref.mockResolvedValue([
      { userId: 'user-1', enabled: true, dailyDigest: true, timezone: 'Asia/Jakarta', quietHoursStart: 0, quietHoursEnd: 6 },
    ]);
    mockGetTenantDb.mockReturnValue(mockDb as never);

    const result = await runDigest();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
    expect(mockLogTelegramAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'SKIPPED_QUIET' }),
    );
  });

  it('skips when quietHoursStart is 0 (falsy-zero regression)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T03:00:00+07:00'));

    vi.mocked(detectCriticalStock).mockResolvedValue(
      okResult('critical_stock', ['/warehouse/inventory'], [oneCriticalStockItem()]),
    );
    vi.mocked(formatDigestMarkdown).mockReturnValue('*Test*');
    vi.mocked(mockResolveAllowedResources).mockResolvedValue('ALL');

    const mockDb = makeMockTenantDb();
    mockDb._findManyIdentity.mockResolvedValue([
      { userId: 'user-1', telegramUserId: 'tg-1', telegramChatId: 'chat-1' },
    ]);
    mockDb._findManyPref.mockResolvedValue([
      { userId: 'user-1', enabled: true, dailyDigest: true, timezone: 'Asia/Jakarta', quietHoursStart: 0, quietHoursEnd: 5 },
    ]);
    mockGetTenantDb.mockReturnValue(mockDb as never);

    const result = await runDigest();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
    expect(mockLogTelegramAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'SKIPPED_QUIET' }),
    );
  });

  describe('finding lifecycle sync', () => {
    it('runs even when proactiveDigest is off, as long as findingLifecycle is on', async () => {
      vi.mocked(isFeatureEnabled).mockImplementation(
        (flag: string) => flag === 'assistant.findingLifecycle',
      );
      vi.mocked(detectCriticalStock).mockResolvedValue(
        okResult('critical_stock', ['/warehouse/inventory'], [oneCriticalStockItem()]),
      );

      const mockDb = makeMockTenantDb();
      mockGetTenantDb.mockReturnValue(mockDb as never);

      const result = await runDigest();

      expect(syncFindings).toHaveBeenCalledTimes(1);
      // Telegram send flow must not run — proactiveDigest is off.
      expect(mockSendTelegramMessage).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
      // But findings are still computed/returned (e.g. for introspection).
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it('only passes production + warehouse detector results into syncFindings', async () => {
      vi.mocked(isFeatureEnabled).mockReturnValue(true);
      vi.mocked(detectCriticalStock).mockResolvedValue(
        okResult('critical_stock', ['/warehouse/inventory'], [oneCriticalStockItem()]),
      );
      vi.mocked(detectOverdueAr).mockResolvedValue(
        okResult('overdue_ar', ['/finance/invoices'], [oneOverdueArItem()]),
      );
      vi.mocked(formatDigestMarkdown).mockReturnValue('*Test*');
      vi.mocked(mockResolveAllowedResources).mockResolvedValue('ALL');

      const mockDb = makeMockTenantDb();
      mockGetTenantDb.mockReturnValue(mockDb as never);

      await runDigest();

      expect(syncFindings).toHaveBeenCalledTimes(1);
      const [, scopedResults] = vi.mocked(syncFindings).mock.calls[0];
      const detectors = scopedResults.map((r) => r.detector);
      expect(detectors).toContain('critical_stock');
      expect(detectors).not.toContain('overdue_ar');
      expect(detectors).not.toContain('stuck_so');
      expect(detectors).not.toContain('overdue_ap');
    });

    it('does not call syncFindings when findingLifecycle is disabled', async () => {
      vi.mocked(isFeatureEnabled).mockImplementation(
        (flag: string) => flag === 'assistant.proactiveDigest',
      );
      vi.mocked(detectCriticalStock).mockResolvedValue(
        okResult('critical_stock', ['/warehouse/inventory'], [oneCriticalStockItem()]),
      );
      vi.mocked(formatDigestMarkdown).mockReturnValue('*Test*');
      vi.mocked(mockResolveAllowedResources).mockResolvedValue('ALL');

      const mockDb = makeMockTenantDb();
      mockGetTenantDb.mockReturnValue(mockDb as never);

      await runDigest();

      expect(syncFindings).not.toHaveBeenCalled();
    });

    it('a syncFindings failure does not stop the Telegram digest from sending', async () => {
      vi.mocked(isFeatureEnabled).mockReturnValue(true);
      vi.mocked(syncFindings).mockRejectedValueOnce(new Error('DB down'));
      vi.mocked(detectCriticalStock).mockResolvedValue(
        okResult('critical_stock', ['/warehouse/inventory'], [oneCriticalStockItem()]),
      );
      vi.mocked(formatDigestMarkdown).mockReturnValue('*Test*');
      vi.mocked(sendTelegramMessage).mockResolvedValue({ ok: true, messageId: 1 });
      vi.mocked(mockResolveAllowedResources).mockResolvedValue('ALL');

      const mockDb = makeMockTenantDb();
      mockDb._findManyIdentity.mockResolvedValue([
        { userId: 'user-1', telegramUserId: 'tg-1', telegramChatId: 'chat-1' },
      ]);
      mockDb._findManyPref.mockResolvedValue([
        { userId: 'user-1', enabled: true, dailyDigest: true, timezone: 'Asia/Jakarta', quietHoursStart: null, quietHoursEnd: null },
      ]);
      mockGetTenantDb.mockReturnValue(mockDb as never);

      const result = await runDigest();

      expect(result.sent).toBe(1);
    });

    it('notifies only findings that were created or reopened, not merely refreshed', async () => {
      vi.mocked(isFeatureEnabled).mockReturnValue(true);
      vi.mocked(syncFindings).mockResolvedValue({
        created: ['f-new-1'],
        reopened: ['f-reopened-1'],
        updated: ['f-still-open-1'],
        unsnoozed: [],
        autoResolved: ['f-closed-1'],
        skippedDetectors: [],
      });
      vi.mocked(detectCriticalStock).mockResolvedValue(
        okResult('critical_stock', ['/warehouse/inventory'], [oneCriticalStockItem()]),
      );

      const mockDb = makeMockTenantDb();
      mockGetTenantDb.mockReturnValue(mockDb as never);

      await runDigest();

      expect(notifyNewFindings).toHaveBeenCalledWith(mockDb, [
        'f-new-1',
        'f-reopened-1',
      ]);
    });

    it('a notifyNewFindings failure does not stop the Telegram digest from sending', async () => {
      vi.mocked(isFeatureEnabled).mockReturnValue(true);
      vi.mocked(notifyNewFindings).mockRejectedValueOnce(new Error('notify down'));
      vi.mocked(detectCriticalStock).mockResolvedValue(
        okResult('critical_stock', ['/warehouse/inventory'], [oneCriticalStockItem()]),
      );
      vi.mocked(formatDigestMarkdown).mockReturnValue('*Test*');
      vi.mocked(sendTelegramMessage).mockResolvedValue({ ok: true, messageId: 2 });
      vi.mocked(mockResolveAllowedResources).mockResolvedValue('ALL');

      const mockDb = makeMockTenantDb();
      mockDb._findManyIdentity.mockResolvedValue([
        { userId: 'user-1', telegramUserId: 'tg-1', telegramChatId: 'chat-1' },
      ]);
      mockDb._findManyPref.mockResolvedValue([
        { userId: 'user-1', enabled: true, dailyDigest: true, timezone: 'Asia/Jakarta', quietHoursStart: null, quietHoursEnd: null },
      ]);
      mockGetTenantDb.mockReturnValue(mockDb as never);

      const result = await runDigest();

      expect(result.sent).toBe(1);
    });

    it('runs escalation only when findingLifecycle is enabled', async () => {
      vi.mocked(isFeatureEnabled).mockImplementation(
        (flag: string) => flag === 'assistant.findingLifecycle',
      );
      vi.mocked(detectCriticalStock).mockResolvedValue(
        okResult('critical_stock', ['/warehouse/inventory'], [oneCriticalStockItem()]),
      );

      const mockDb = makeMockTenantDb();
      mockGetTenantDb.mockReturnValue(mockDb as never);

      await runDigest();

      expect(escalateOverdueFindings).toHaveBeenCalledTimes(1);
      expect(escalateOverdueFindings).toHaveBeenCalledWith(mockDb);
    });

    it('does not run escalation when findingLifecycle is disabled', async () => {
      vi.mocked(isFeatureEnabled).mockImplementation(
        (flag: string) => flag === 'assistant.proactiveDigest',
      );
      vi.mocked(detectCriticalStock).mockResolvedValue(
        okResult('critical_stock', ['/warehouse/inventory'], [oneCriticalStockItem()]),
      );
      vi.mocked(formatDigestMarkdown).mockReturnValue('*Test*');
      vi.mocked(mockResolveAllowedResources).mockResolvedValue('ALL');

      const mockDb = makeMockTenantDb();
      mockGetTenantDb.mockReturnValue(mockDb as never);

      await runDigest();

      expect(escalateOverdueFindings).not.toHaveBeenCalled();
    });

    it('an escalateOverdueFindings failure does not stop the Telegram digest from sending', async () => {
      vi.mocked(isFeatureEnabled).mockReturnValue(true);
      vi.mocked(escalateOverdueFindings).mockRejectedValueOnce(
        new Error('escalation down'),
      );
      vi.mocked(detectCriticalStock).mockResolvedValue(
        okResult('critical_stock', ['/warehouse/inventory'], [oneCriticalStockItem()]),
      );
      vi.mocked(formatDigestMarkdown).mockReturnValue('*Test*');
      vi.mocked(sendTelegramMessage).mockResolvedValue({ ok: true, messageId: 3 });
      vi.mocked(mockResolveAllowedResources).mockResolvedValue('ALL');

      const mockDb = makeMockTenantDb();
      mockDb._findManyIdentity.mockResolvedValue([
        { userId: 'user-1', telegramUserId: 'tg-1', telegramChatId: 'chat-1' },
      ]);
      mockDb._findManyPref.mockResolvedValue([
        { userId: 'user-1', enabled: true, dailyDigest: true, timezone: 'Asia/Jakarta', quietHoursStart: null, quietHoursEnd: null },
      ]);
      mockGetTenantDb.mockReturnValue(mockDb as never);

      const result = await runDigest();

      expect(result.sent).toBe(1);
    });
  });
});
