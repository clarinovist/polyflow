import { logger } from '@/lib/config/logger';
import { logActivity } from '@/lib/tools/audit';
import { recordVirtualCsMetric } from '@/lib/bot/metrics';
import { getMainPrisma } from '@/lib/core/prisma';
import { HelpOutcome } from '@prisma/client';

export type VirtualCsAuditInput = {
  channel: 'telegram' | 'web';
  product: 'polyflow';
  question: string;
  answer?: string;
  allowed: boolean;
  blockedReason?: string;
  success: boolean;
  userId?: string;
  tenantId?: string;
  requesterName?: string;
  latencyMs: number;
  confidence?: number;
};

function compactQuestion(question: string): string {
  return question.replace(/\s+/g, ' ').trim().slice(0, 220);
}

function compactAnswer(answer: string): string {
  return answer.replace(/\s+/g, ' ').trim().slice(0, 500);
}

const GENERIC_FAILURE_PATTERNS = [
  /tidak dapat merangkum/i,
  /gangguan koneksi/i,
  /tidak dikenali/i,
  /sedang mengalami/i,
  /Network Error/i,
];

const WEAK_ANSWER_PATTERNS = [
  /tidak tahu/i,
  /tidak yakin/i,
  /maaf.*tidak bisa/i,
  /tidak memiliki informasi/i,
  /tidak tersedia/i,
  /belum tersedia/i,
];

export function resolveOutcome(input: VirtualCsAuditInput): HelpOutcome {
  if (!input.success) return 'FAILED';
  if (!input.allowed) return 'BLOCKED';

  const answer = (input.answer || '').trim();

  // Empty or very short answer = FAILED
  if (answer.length < 10) return 'FAILED';

  // Generic failure / error messages = FAILED
  if (GENERIC_FAILURE_PATTERNS.some((p) => p.test(answer))) return 'FAILED';

  // Weak / "I don't know" answers = PARTIAL
  if (WEAK_ANSWER_PATTERNS.some((p) => p.test(answer))) return 'PARTIAL';

  return 'SUCCESS';
}

export async function logVirtualCsEvent(input: VirtualCsAuditInput): Promise<string | null> {
  recordVirtualCsMetric(input.channel, input.allowed, input.success);

  const level = input.success ? (input.allowed ? 'info' : 'warn') : 'error';

  const context = {
    module: 'VirtualCS',
    channel: input.channel,
    product: input.product,
    allowed: input.allowed,
    blockedReason: input.blockedReason,
    requesterName: input.requesterName,
    latencyMs: input.latencyMs,
    question: compactQuestion(input.question),
  };

  if (level === 'error') logger.error('Virtual CS request failed', context);
  else if (level === 'warn') logger.warn('Virtual CS request blocked by guardrails', context);
  else logger.info('Virtual CS request served', context);

  // Persist to HelpInteraction in main DB for learning pipeline
  let interactionId: string | null = null;
  try {
    const mainDb = getMainPrisma();
    const interaction = await mainDb.helpInteraction.create({
      data: {
        tenantId: input.tenantId || null,
        userId: input.userId || null,
        channel: input.channel,
        question: input.question.trim().slice(0, 2000),
        answerPreview: input.answer ? compactAnswer(input.answer) : '',
        outcome: resolveOutcome(input),
        confidence: input.confidence ?? null,
        latencyMs: input.latencyMs,
        blockedReason: input.blockedReason || null,
      },
    });
    interactionId = interaction.id;
  } catch (error) {
    logger.error('Failed to persist HelpInteraction', {
      module: 'VirtualCS',
      channel: input.channel,
      error,
    });
  }

  // Legacy audit log (backward compatible)
  const auditUserId = input.userId || process.env.OPENCLAW_SYSTEM_USER_ID;
  if (!auditUserId) return interactionId;

  try {
    await logActivity({
      userId: auditUserId,
      action: input.allowed ? 'VIRTUAL_CS_QUERY_ALLOWED' : 'VIRTUAL_CS_QUERY_BLOCKED',
      entityType: 'VirtualCS',
      entityId: input.product,
      details: `${input.channel.toUpperCase()} | ${compactQuestion(input.question)}`,
      changes: {
        channel: input.channel,
        success: input.success,
        allowed: input.allowed,
        blockedReason: input.blockedReason || null,
        requesterName: input.requesterName || null,
        latencyMs: input.latencyMs,
      },
    });
  } catch (error) {
    logger.error('Failed to persist Virtual CS audit log', {
      module: 'VirtualCS',
      channel: input.channel,
      error,
    });
  }

  return interactionId;
}
