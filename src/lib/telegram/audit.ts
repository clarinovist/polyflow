import crypto from 'crypto';
import { prisma } from '@/lib/core/prisma';
import type { TelegramAuditAction } from '@prisma/client';

export function hashTelegramUserId(telegramUserId: string | number): string {
  const idStr = String(telegramUserId);
  return crypto.createHash('sha256').update(idStr).digest('hex').slice(0, 16);
}

type AuditInput = {
  action: TelegramAuditAction;
  telegramUserId?: string | number | null;
  userId?: string | null;
  tenantId?: string | null;
  resource?: string | null;
  outcome: string;
  latencyMs?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  details?: unknown;
};

export function logTelegramAudit(input: AuditInput): void {
  const telegramUserIdHash = input.telegramUserId
    ? hashTelegramUserId(input.telegramUserId)
    : undefined;

  let safeDetails: unknown = undefined;
  if (input.details && typeof input.details === 'object') {
    try {
      const json = JSON.stringify(input.details);
      const redacted = json.replace(
        /("(?:[^"]*token[^"]*"|[^"]*initData[^"]*"|[^"]*password[^"]*"|[^"]*secret[^"]*"|[^"]*bot[^"]*token[^"]*")\s*:\s*)"[^"]*"/gi,
        '$1"[REDACTED]"',
      );
      safeDetails = JSON.parse(redacted);
    } catch {
      safeDetails = { note: 'details serialization failed (redacted)' };
    }
  } else {
    safeDetails = input.details;
  }

  prisma.telegramAuditLog
    .create({
      data: {
        action: input.action,
        telegramUserIdHash,
        userId: input.userId ?? undefined,
        tenantId: input.tenantId ?? undefined,
        resource: input.resource ?? undefined,
        outcome: input.outcome,
        latencyMs: input.latencyMs ?? undefined,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent?.slice(0, 500),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        details: safeDetails as any,
      },
    })
    .catch(() => {
      // never block
    });
}
