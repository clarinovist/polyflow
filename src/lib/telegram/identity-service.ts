import { prisma } from '@/lib/core/prisma';

export async function findIdentityByTelegramUserId(
  telegramUserId: string,
  tenantId: string,
) {
  return prisma.telegramIdentity.findFirst({
    where: { telegramUserId, tenantId },
  });
}

export async function findIdentityByUserId(userId: string, tenantId: string) {
  return prisma.telegramIdentity.findFirst({
    where: { userId, tenantId, status: 'ACTIVE' },
  });
}

export async function findIdentityById(id: string) {
  return prisma.telegramIdentity.findUnique({ where: { id } });
}

export async function createIdentity(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
  telegramUsername?: string | null;
  tenantId: string;
  userId: string;
}) {
  const existing = await prisma.telegramIdentity.findFirst({
    where: { telegramUserId: input.telegramUserId, tenantId: input.tenantId },
  });

  if (existing) {
    return prisma.telegramIdentity.update({
      where: { id: existing.id },
      data: {
        telegramChatId: input.telegramChatId ?? existing.telegramChatId,
        telegramUsername: input.telegramUsername ?? existing.telegramUsername,
        userId: input.userId,
        status: 'ACTIVE',
        revokedAt: null,
        linkedAt: new Date(),
        lastActiveAt: new Date(),
      },
    });
  }

  const created = await prisma.telegramIdentity.create({
    data: {
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramChatId,
      telegramUsername: input.telegramUsername,
      tenantId: input.tenantId,
      userId: input.userId,
      status: 'ACTIVE',
      linkedAt: new Date(),
      lastActiveAt: new Date(),
    },
  });

  // Ensure default notification preference exists
  await prisma.telegramNotificationPreference
    .upsert({
      where: {
        tenantId_userId: { tenantId: input.tenantId, userId: input.userId },
      },
      update: {},
      create: {
        tenantId: input.tenantId,
        userId: input.userId,
        enabled: true,
        criticalStock: true,
        timezone: 'Asia/Jakarta',
      },
    })
    .catch(() => {});

  return created;
}

export async function revokeIdentity(id: string) {
  return prisma.telegramIdentity.update({
    where: { id },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });
}

export async function touchIdentityLastActive(id: string) {
  await prisma.telegramIdentity
    .update({ where: { id }, data: { lastActiveAt: new Date() } })
    .catch(() => {});
}

export async function revokeIdentityByTelegramUserId(
  tenantId: string,
  telegramUserId: string,
) {
  const identity = await findIdentityByTelegramUserId(
    telegramUserId,
    tenantId,
  );
  if (!identity) return null;
  return revokeIdentity(identity.id);
}
