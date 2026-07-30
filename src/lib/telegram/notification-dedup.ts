import crypto from 'crypto';
import { prisma } from '@/lib/core/prisma';
import type { TelegramNotificationStatus } from '@prisma/client';

export function buildDedupKey(input: {
  tenantId: string;
  type: string;
  scope?: string;
}): string {
  const raw = `${input.tenantId}:${input.type}:${input.scope || ''}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export async function isDuplicate(dedupKey: string): Promise<boolean> {
  const existing = await prisma.telegramNotificationLog.findUnique({
    where: { dedupKey },
  });
  return !!existing;
}

export async function recordNotificationAttempt(input: {
  tenantId: string;
  userId: string;
  telegramUserId?: string;
  telegramChatId?: string;
  dedupKey: string;
  type: string;
  summary?: string;
  status?: TelegramNotificationStatus;
  telegramMessageId?: string;
}): Promise<void> {
  await prisma.telegramNotificationLog.upsert({
    where: { dedupKey: input.dedupKey },
    update: {
      status: input.status || 'SENT',
      summary: input.summary,
      telegramMessageId: input.telegramMessageId,
      sentAt: input.status === 'SENT' ? new Date() : undefined,
    },
    create: {
      tenantId: input.tenantId,
      userId: input.userId,
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramChatId,
      dedupKey: input.dedupKey,
      type: input.type,
      summary: input.summary,
      status: input.status || 'SENT',
      telegramMessageId: input.telegramMessageId,
      sentAt: input.status === 'SENT' ? new Date() : undefined,
    },
  });
}
