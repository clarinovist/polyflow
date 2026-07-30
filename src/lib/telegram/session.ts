import crypto from 'crypto';
import { prisma } from '@/lib/core/prisma';
import {
  getSessionCookieName,
  getSessionMaxAgeSec,
} from './kill-switch';

type CreateSessionInput = {
  telegramUserId: string;
  tenantId: string;
  userId: string;
  telegramIdentityId?: string | null;
};

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function generateRawToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 64 hex chars
}

export async function createTelegramSession(
  input: CreateSessionInput,
): Promise<{ rawToken: string; expiresAt: Date; hash: string }> {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const maxAgeSec = getSessionMaxAgeSec();
  const expiresAt = new Date(Date.now() + maxAgeSec * 1000);

  await prisma.telegramMiniAppSession.create({
    data: {
      sessionTokenHash: tokenHash,
      telegramIdentityId: input.telegramIdentityId ?? undefined,
      telegramUserId: input.telegramUserId,
      tenantId: input.tenantId,
      userId: input.userId,
      expiresAt,
      lastActiveAt: new Date(),
    },
  });

  return { rawToken, expiresAt, hash: tokenHash };
}

export async function verifyTelegramSession(rawToken: string): Promise<
  | {
      valid: true;
      session: {
        id: string;
        telegramUserId: string;
        tenantId: string;
        userId: string;
        telegramIdentityId: string | null;
        expiresAt: Date;
      };
    }
  | { valid: false; reason: string }
> {
  if (!rawToken) return { valid: false, reason: 'missing token' };
  const hash = hashToken(rawToken);
  const record = await prisma.telegramMiniAppSession.findUnique({
    where: { sessionTokenHash: hash },
  });
  if (!record) return { valid: false, reason: 'not found' };
  if (record.expiresAt.getTime() < Date.now()) {
    // cleanup expired (fire-and-forget)
    prisma.telegramMiniAppSession
      .delete({ where: { id: record.id } })
      .catch(() => {});
    return { valid: false, reason: 'expired' };
  }
  // touch lastActiveAt (fire-and-forget to avoid latency)
  prisma.telegramMiniAppSession
    .update({
      where: { id: record.id },
      data: { lastActiveAt: new Date() },
    })
    .catch(() => {});

  return {
    valid: true,
    session: {
      id: record.id,
      telegramUserId: record.telegramUserId,
      tenantId: record.tenantId,
      userId: record.userId,
      telegramIdentityId: record.telegramIdentityId,
      expiresAt: record.expiresAt,
    },
  };
}

export async function revokeTelegramSessionsByUserId(
  tenantId: string,
  userId: string,
): Promise<void> {
  await prisma.telegramMiniAppSession.deleteMany({
    where: { tenantId, userId },
  });
}

export async function revokeTelegramSessionsByTelegramUserId(
  tenantId: string,
  telegramUserId: string,
): Promise<void> {
  await prisma.telegramMiniAppSession.deleteMany({
    where: { tenantId, telegramUserId },
  });
}

export async function revokeSessionByTokenHash(hash: string): Promise<void> {
  await prisma.telegramMiniAppSession
    .delete({ where: { sessionTokenHash: hash } })
    .catch(() => {});
}

export function buildSessionCookieHeader(
  rawToken: string,
  opts?: { expiresAt?: Date; isProduction?: boolean },
): string {
  const name = getSessionCookieName();
  const maxAge = getSessionMaxAgeSec();
  const isProd = opts?.isProduction ?? process.env.NODE_ENV === 'production';
  const parts = [
    `${name}=${rawToken}`,
    `Path=/`,
    `HttpOnly`,
    `Max-Age=${maxAge}`,
  ];
  if (isProd) {
    parts.push('Secure');
    parts.push('SameSite=None');
  } else {
    parts.push('SameSite=Lax');
  }
  if (opts?.expiresAt) {
    parts.push(`Expires=${opts.expiresAt.toUTCString()}`);
  }
  return parts.join('; ');
}

export function buildClearSessionCookieHeader(): string {
  const name = getSessionCookieName();
  // Force clear
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${name}=`,
    `Path=/`,
    `HttpOnly`,
    `Max-Age=0`,
    `Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
  ];
  if (isProd) {
    parts.push('Secure');
    parts.push('SameSite=None');
  } else {
    parts.push('SameSite=Lax');
  }
  return parts.join('; ');
}

export function extractSessionTokenFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;
  const name = getSessionCookieName();
  const match = cookieHeader
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`));
  if (!match) return null;
  return match.slice(name.length + 1) || null;
}
