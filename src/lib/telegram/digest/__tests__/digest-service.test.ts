import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
  getMainPrisma: vi.fn(),
  getTenantDb: vi.fn(),
}));

vi.mock('@/lib/telegram/kill-switch', () => ({
  getPilotSubdomain: vi.fn().mockReturnValue('melindo'),
  isKillSwitchActive: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/telegram/send-message', () => ({
  sendTelegramMessage: vi.fn(),
}));

vi.mock('@/lib/telegram/permissions', () => ({
  resolveAllowedResources: vi.fn(),
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

vi.mock('../detectors', () => ({
  detectCriticalStock: vi.fn().mockResolvedValue([]),
  detectStuckSalesOrders: vi.fn().mockResolvedValue([]),
  detectOverdueAr: vi.fn().mockResolvedValue([]),
  detectOverdueAp: vi.fn().mockResolvedValue([]),
  detectProductionNoProgress: vi.fn().mockResolvedValue([]),
}));

vi.mock('../format', () => ({
  formatDigestMarkdown: vi.fn(),
}));

import { runDigest } from '../digest-service';
import { getMainPrisma, getTenantDb } from '@/lib/core/prisma';
import { isKillSwitchActive } from '@/lib/telegram/kill-switch';
import { sendTelegramMessage } from '@/lib/telegram/send-message';
import { resolveAllowedResources } from '@/lib/telegram/permissions';
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

const mockGetMainPrisma = vi.mocked(getMainPrisma);
const mockGetTenantDb = vi.mocked(getTenantDb);
const mockSendTelegramMessage = vi.mocked(sendTelegramMessage);
const mockResolveAllowedResources = vi.mocked(resolveAllowedResources);
const mockRecordNotificationAttempt = vi.mocked(recordNotificationAttempt);
const mockLogTelegramAudit = vi.mocked(logTelegramAudit);

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
    vi.mocked(detectCriticalStock).mockResolvedValue([]);
    vi.mocked(detectStuckSalesOrders).mockResolvedValue([]);
    vi.mocked(detectOverdueAr).mockResolvedValue([]);
    vi.mocked(detectOverdueAp).mockResolvedValue([]);
    vi.mocked(detectProductionNoProgress).mockResolvedValue([]);
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
    vi.mocked(detectCriticalStock).mockResolvedValue([
      { detector: 'critical_stock', severity: 'critical', requiredResources: ['/warehouse/inventory'], headline: 'Test product low' },
    ]);

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
    vi.mocked(detectCriticalStock).mockResolvedValue([
      { detector: 'critical_stock', severity: 'critical', requiredResources: ['/warehouse/inventory'], headline: 'Test' },
    ]);
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
    vi.mocked(detectCriticalStock).mockResolvedValue([
      { detector: 'critical_stock', severity: 'critical', requiredResources: ['/warehouse/inventory'], headline: 'Test' },
    ]);
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
    vi.mocked(detectCriticalStock).mockResolvedValue([
      { detector: 'critical_stock', severity: 'critical', requiredResources: ['/warehouse/inventory'], headline: 'Product A low' },
    ]);
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
  });

  it('records FAILED when send fails', async () => {
    vi.mocked(detectCriticalStock).mockResolvedValue([
      { detector: 'critical_stock', severity: 'critical', requiredResources: ['/warehouse/inventory'], headline: 'Test' },
    ]);
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

  it('one detector failure does not cancel digest', async () => {
    vi.mocked(detectCriticalStock).mockRejectedValue(new Error('DB down'));
    vi.mocked(detectOverdueAr).mockResolvedValue([
      { detector: 'overdue_ar', severity: 'critical', requiredResources: ['/finance/invoices'], headline: 'Invoice overdue' },
    ]);
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

    vi.mocked(detectCriticalStock).mockResolvedValue([
      { detector: 'critical_stock', severity: 'critical', requiredResources: ['/warehouse/inventory'], headline: 'Test' },
    ]);
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

    vi.mocked(detectCriticalStock).mockResolvedValue([
      { detector: 'critical_stock', severity: 'critical', requiredResources: ['/warehouse/inventory'], headline: 'Test' },
    ]);
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
});
