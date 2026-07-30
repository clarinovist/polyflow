import crypto from 'crypto';
import { prisma } from '@/lib/core/prisma';

export function generateSecureToken(lengthBytes = 24): string {
  // url-safe base64 without padding
  return crypto
    .randomBytes(lengthBytes)
    .toString('base64url');
}

export async function createLinkToken(input: {
  tenantId: string;
  userId: string;
  expiresInSec?: number;
}): Promise<{ token: string; expiresAt: Date; record: unknown }> {
  const token = generateSecureToken(32);
  const expiresAt = new Date(
    Date.now() + (input.expiresInSec ?? 600) * 1000,
  );
  const record = await prisma.telegramLinkToken.create({
    data: {
      token,
      tenantId: input.tenantId,
      userId: input.userId,
      expiresAt,
    },
  });
  return { token, expiresAt, record };
}

export async function validateAndConsumeLinkToken(
  token: string,
  tenantId: string,
): Promise<
  | { valid: true; tenantId: string; userId: string; id: string }
  | { valid: false; reason: string }
> {
  if (!token) return { valid: false, reason: 'missing token' };
  const record = await prisma.telegramLinkToken.findUnique({
    where: { token },
  });
  if (!record) return { valid: false, reason: 'not found' };
  if (record.tenantId !== tenantId) {
    return { valid: false, reason: 'tenant mismatch' };
  }
  if (record.usedAt) {
    return { valid: false, reason: 'already used' };
  }
  if (record.expiresAt.getTime() < Date.now()) {
    return { valid: false, reason: 'expired' };
  }
  // mark used
  await prisma.telegramLinkToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  return {
    valid: true,
    tenantId: record.tenantId,
    userId: record.userId,
    id: record.id,
  };
}

export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.telegramLinkToken.deleteMany({
    where: { expiresAt: { lt: new Date() }, usedAt: null },
  });
  return result.count;
}
