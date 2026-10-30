import { createHash, randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { BUCKET, r2Client } from '@/lib/storage/r2';
import { BusinessRuleError } from '@/lib/errors/errors';
import type { AtkBackup } from './atk-recovery-service';

export function atkRecoveryBackup(tenantId: string): AtkBackup {
    return {
        ready: () =>
            Boolean(
                tenantId &&
                process.env.S3_ENDPOINT &&
                process.env.S3_ACCESS_KEY_ID &&
                process.env.S3_SECRET_ACCESS_KEY,
            ),
        async save(snapshot, fingerprint) {
            const body = Buffer.from(
                JSON.stringify({ version: 1, tenantId, fingerprint, snapshot }),
            );
            const digest = createHash('sha256').update(body).digest('hex');
            const key = `backups/tenants/${encodeURIComponent(tenantId)}/atk-cost-recovery/${randomUUID()}.json`;
            try {
                await r2Client.send(
                    new PutObjectCommand({
                        Bucket: BUCKET,
                        Key: key,
                        Body: body,
                        ContentType: 'application/json',
                        IfNoneMatch: '*',
                    }),
                    { abortSignal: AbortSignal.timeout(8000) },
                );
                const saved = await r2Client.send(
                    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
                    { abortSignal: AbortSignal.timeout(8000) },
                );
                if (!saved.Body || saved.ContentLength !== body.length)
                    throw new BusinessRuleError('Incomplete backup');
                const bytes = await saved.Body.transformToByteArray();
                if (createHash('sha256').update(bytes).digest('hex') !== digest)
                    throw new BusinessRuleError('Backup hash mismatch');
                return `${key}#sha256=${digest}`;
            } catch {
                throw new BusinessRuleError(
                    'Cadangan koreksi ATK belum dapat diverifikasi. Tidak ada koreksi diterapkan.',
                    undefined,
                    'ATK_BACKUP_FAILED',
                );
            }
        },
    };
}
