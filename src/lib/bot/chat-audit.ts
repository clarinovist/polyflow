import { logger } from '@/lib/config/logger';
import { logActivity } from '@/lib/tools/audit';
import { recordVirtualCsMetric } from '@/lib/bot/metrics';

export type VirtualCsAuditInput = {
  channel: 'telegram' | 'web';
  product: 'polyflow';
  question: string;
  allowed: boolean;
  blockedReason?: string;
  success: boolean;
  userId?: string;
  requesterName?: string;
  latencyMs: number;
};

function compactQuestion(question: string): string {
  return question.replace(/\s+/g, ' ').trim().slice(0, 220);
}

export async function logVirtualCsEvent(input: VirtualCsAuditInput): Promise<void> {
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

  const auditUserId = input.userId || process.env.OPENCLAW_SYSTEM_USER_ID;
  if (!auditUserId) return;

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
}
