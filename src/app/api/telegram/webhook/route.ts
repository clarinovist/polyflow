import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/api/rate-limit';
import { prisma, getTenantDb, getMainPrisma } from '@/lib/core/prisma';
import {
  isMiniAppEnabled,
  getWebhookSecret,
  getMiniAppUrl,
  getPilotSubdomain,
  getBotUsername,
} from '@/lib/telegram/kill-switch';
import { logTelegramAudit } from '@/lib/telegram/audit';
import { sendTelegramMessage } from '@/lib/telegram/send-message';

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string; username?: string };
    from?: { id: number; username?: string; first_name?: string; is_bot?: boolean };
    text?: string;
  };
  callback_query?: unknown;
};

function getIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
}

async function getPilotTenantDb(): Promise<{ tenantId: string; tenantDb: ReturnType<typeof getTenantDb> } | null> {
  try {
    const main = getMainPrisma();
    const pilotSub = getPilotSubdomain();
    const tenant = await main.tenant.findUnique({ where: { subdomain: pilotSub } });
    if (!tenant?.dbUrl) return null;
    return { tenantId: tenant.id, tenantDb: getTenantDb(tenant.dbUrl) };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const ip = getIp(req);

  // Rate limit webhook globally
  const limiter = rateLimit(`tg-webhook:${ip}`, 120, 60_000);
  if (!limiter.success) {
    return NextResponse.json({ ok: false, error: 'rate limit' }, { status: 429 });
  }

  // Secret token validation
  const expectedSecret = getWebhookSecret();
  if (expectedSecret) {
    const got = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (got !== expectedSecret) {
      logTelegramAudit({
        action: 'WEBHOOK_AUTH_FAILED',
        outcome: 'BLOCKED',
        ip,
        details: { reason: 'secret mismatch' },
      });
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  // Kill switch — return 200 to avoid Telegram retries storm, but skip processing
  if (!isMiniAppEnabled()) {
    logTelegramAudit({
      action: 'KILL_SWITCH_BLOCKED',
      outcome: 'SKIPPED',
      ip,
      details: { route: 'webhook' },
    });
    return NextResponse.json({ ok: true, skipped: 'kill switch' });
  }

  let body: TelegramUpdate;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const updateId = body.update_id;
  if (!updateId && updateId !== 0) {
    return NextResponse.json({ ok: false, error: 'missing update_id' }, { status: 400 });
  }

  // Deduplicate update_id
  const updateIdStr = String(updateId);
  try {
    const existing = await prisma.telegramUpdateLog.findUnique({
      where: { updateId: updateIdStr },
    });
    if (existing) {
      logTelegramAudit({
        action: 'WEBHOOK_DUP',
        outcome: 'SKIPPED_DUP',
        ip,
        details: { updateId: updateIdStr },
      });
      return NextResponse.json({ ok: true, dedup: true });
    }
    await prisma.telegramUpdateLog.create({
      data: { updateId: updateIdStr, type: body.message ? 'message' : body.callback_query ? 'callback_query' : 'unknown' },
    });
  } catch {
    // race: unique constraint may fire, treat as dup
    return NextResponse.json({ ok: true, dedup: true });
  }

  // Pilot tenant lookup
  const pilot = await getPilotTenantDb();
  if (!pilot) {
    logTelegramAudit({
      action: 'TENANT_MISMATCH',
      outcome: 'FAILED',
      ip,
      details: { updateId: updateIdStr, reason: 'pilot tenant not found' },
    });
    return NextResponse.json({ ok: true });
  }

  // Handle only message for MVP
  const msg = body.message;
  if (!msg) {
    return NextResponse.json({ ok: true });
  }

  const chatId = msg.chat.id;
  const fromId = msg.from?.id;
  const textRaw = (msg.text || '').trim();

  logTelegramAudit({
    action: 'WEBHOOK_RECEIVE',
    telegramUserId: fromId,
    tenantId: pilot.tenantId,
    outcome: 'RECEIVED',
    ip,
    latencyMs: Date.now() - startedAt,
    details: { updateId: updateIdStr, chatId, hasText: !!textRaw },
  });

  if (!textRaw) {
    return NextResponse.json({ ok: true });
  }

  // Handle /start
  if (textRaw.startsWith('/start')) {
    const parts = textRaw.split(' ');
    const startParam = parts[1];

    if (fromId) {
      try {
        const identity = await pilot.tenantDb.telegramIdentity.findFirst({
          where: { telegramUserId: String(fromId), tenantId: pilot.tenantId },
        });

        const miniAppUrl = getMiniAppUrl();
        const botUsername = getBotUsername();

        if (identity?.status === 'ACTIVE') {
          // Already linked — send button to open mini app
          await sendTelegramMessage(
            chatId,
            `✅ Akun Polyflow Anda sudah terhubung.\n\nBuka Mini App untuk melanjutkan:\n${miniAppUrl}`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: 'Buka Polyflow', web_app: { url: miniAppUrl } }],
                  [{ text: 'Bantuan', url: `https://t.me/${botUsername}` }],
                ],
              },
            },
          );
        } else {
          // Check if start_param is a link token
          if (startParam) {
            try {
              const tokenRecord = await pilot.tenantDb.telegramLinkToken.findUnique({
                where: { token: startParam },
              });
              if (tokenRecord && tokenRecord.tenantId === pilot.tenantId && !tokenRecord.usedAt && tokenRecord.expiresAt.getTime() > Date.now()) {
                // Consume token and link
                await pilot.tenantDb.telegramLinkToken.update({
                  where: { id: tokenRecord.id },
                  data: { usedAt: new Date() },
                });
                await pilot.tenantDb.telegramIdentity.upsert({
                  where: {
                    telegramUserId_tenantId: {
                      telegramUserId: String(fromId),
                      tenantId: pilot.tenantId,
                    },
                  },
                  update: {
                    userId: tokenRecord.userId,
                    telegramChatId: String(chatId),
                    telegramUsername: msg.from?.username,
                    status: 'ACTIVE',
                    revokedAt: null,
                    linkedAt: new Date(),
                    lastActiveAt: new Date(),
                  },
                  create: {
                    telegramUserId: String(fromId),
                    telegramChatId: String(chatId),
                    telegramUsername: msg.from?.username,
                    tenantId: pilot.tenantId,
                    userId: tokenRecord.userId,
                    status: 'ACTIVE',
                    linkedAt: new Date(),
                    lastActiveAt: new Date(),
                  },
                });
                await sendTelegramMessage(
                  chatId,
                  `✅ Akun berhasil terhubung!\n\nBuka Polyflow Mini App:\n${miniAppUrl}`,
                  {
                    reply_markup: {
                      inline_keyboard: [[{ text: 'Buka Polyflow', web_app: { url: miniAppUrl } }]],
                    },
                  },
                );
                return NextResponse.json({ ok: true, linked: true });
              }
            } catch {
              // ignore
            }
          }

          // Not linked, no token — instruct to link from Polyflow web
          await sendTelegramMessage(
            chatId,
            `👋 Halo! Untuk menghubungkan akun Polyflow Anda:\n\n1. Buka Polyflow di ${pilot.tenantId ? '' : ''}https://${getPilotSubdomain()}.polyflow.uk\n2. Buka menu Pengaturan atau ketik /telegram di web untuk mendapatkan link koneksi\n3. Atau gunakan perintah /link <token> jika Anda sudah punya token\n\nSetelah terhubung, buka Mini App dari menu bot.`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: 'Buka Polyflow', web_app: { url: getMiniAppUrl() } }],
                ],
              },
            },
          );
        }
      } catch (e) {
        console.error('[TG_WEBHOOK] /start error', e);
      }
    }
    return NextResponse.json({ ok: true });
  }

  // Handle /link <token>
  if (textRaw.startsWith('/link')) {
    const token = textRaw.replace('/link', '').trim();
    if (!token) {
      await sendTelegramMessage(chatId, 'Format: /link <token>\nDapatkan token dari Polyflow web → Settings → Telegram.');
      return NextResponse.json({ ok: true });
    }
    if (!fromId) {
      await sendTelegramMessage(chatId, 'Tidak dapat membaca identitas Telegram Anda. Coba lagi.');
      return NextResponse.json({ ok: true });
    }
    try {
      const rec = await pilot.tenantDb.telegramLinkToken.findUnique({ where: { token } });
      if (!rec || rec.tenantId !== pilot.tenantId) {
        await sendTelegramMessage(chatId, '❌ Token tidak ditemukan atau tenant salah.');
        logTelegramAudit({ action: 'LINK_FAILED', telegramUserId: String(fromId), tenantId: pilot.tenantId, outcome: 'NOT_FOUND', ip });
        return NextResponse.json({ ok: true });
      }
      if (rec.usedAt) {
        await sendTelegramMessage(chatId, '❌ Token sudah digunakan. Buat token baru di Polyflow web.');
        return NextResponse.json({ ok: true });
      }
      if (rec.expiresAt.getTime() < Date.now()) {
        await sendTelegramMessage(chatId, '❌ Token expired. Buat token baru (berlaku 10 menit).');
        return NextResponse.json({ ok: true });
      }
      await pilot.tenantDb.telegramLinkToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
      await pilot.tenantDb.telegramIdentity.upsert({
        where: { telegramUserId_tenantId: { telegramUserId: String(fromId), tenantId: pilot.tenantId } },
        update: {
          userId: rec.userId,
          telegramChatId: String(chatId),
          telegramUsername: msg.from?.username,
          status: 'ACTIVE',
          revokedAt: null,
          linkedAt: new Date(),
          lastActiveAt: new Date(),
        },
        create: {
          telegramUserId: String(fromId),
          telegramChatId: String(chatId),
          telegramUsername: msg.from?.username,
          tenantId: pilot.tenantId,
          userId: rec.userId,
          status: 'ACTIVE',
          linkedAt: new Date(),
          lastActiveAt: new Date(),
        },
      });
      await sendTelegramMessage(
        chatId,
        `✅ Akun terhubung! Buka Mini App:\n${getMiniAppUrl()}`,
        { reply_markup: { inline_keyboard: [[{ text: 'Buka Polyflow', web_app: { url: getMiniAppUrl() } }]] } },
      );
      logTelegramAudit({ action: 'LINK_SUCCESS', telegramUserId: String(fromId), userId: rec.userId, tenantId: pilot.tenantId, outcome: 'SUCCESS', ip });
    } catch (e) {
      console.error('[TG_WEBHOOK] /link error', e);
      await sendTelegramMessage(chatId, '❌ Gagal linking. Coba lagi nanti.');
      logTelegramAudit({ action: 'LINK_FAILED', telegramUserId: String(fromId), tenantId: pilot.tenantId, outcome: 'ERROR', ip });
    }
    return NextResponse.json({ ok: true });
  }

  // Fallback: remind to open Mini App
  if (fromId) {
    try {
      const identity = await pilot.tenantDb.telegramIdentity.findFirst({
        where: { telegramUserId: String(fromId), tenantId: pilot.tenantId, status: 'ACTIVE' },
      });
      if (identity) {
        await sendTelegramMessage(
          chatId,
          `Buka Mini App Polyflow untuk melihat data operasional:\n${getMiniAppUrl()}`,
          { reply_markup: { inline_keyboard: [[{ text: 'Buka Polyflow', web_app: { url: getMiniAppUrl() } }]] } },
        );
      }
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ ok: true });
}
