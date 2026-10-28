import { createHash, randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { BUCKET, r2Client } from '@/lib/storage/r2';
import { BusinessRuleError } from '@/lib/errors/errors';
import type { RecoveryBackupStore } from './cost-recovery-service';

/** Exact scoped metadata before-image, never an entire tenant export. The private
 * backup namespace is denied by the image route. No object key/URL goes to the UI. */
export function productionRecoveryBackup(
    tenantId: string,
): RecoveryBackupStore {
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
            const key = `backups/tenants/${encodeURIComponent(tenantId)}/production-cost-recovery/${randomUUID()}.json`;
            try {
                const options = { abortSignal: AbortSignal.timeout(8000) };
                await r2Client.send(
                    new PutObjectCommand({
                        Bucket: BUCKET,
                        Key: key,
                        Body: body,
                        ContentType: 'application/json',
                        IfNoneMatch: '*',
                    }),
                    options,
                );
                const saved = await r2Client.send(
                    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
                    { abortSignal: AbortSignal.timeout(8000) },
                );
                if (!saved.Body || saved.ContentLength !== body.length)
                    throw new BusinessRuleError('Backup tidak lengkap');
                const bytes = await saved.Body.transformToByteArray();
                if (createHash('sha256').update(bytes).digest('hex') !== digest)
                    throw new BusinessRuleError('Isi backup berbeda');
                return `${key}#sha256=${digest}`;
            } catch {
                // Storage errors may contain credential/endpoint details. Never return them.
                throw new BusinessRuleError(
                    'Cadangan pemulihan tidak dapat diverifikasi. Tidak ada koreksi diterapkan.',
                    undefined,
                    'PRODUCTION_RECOVERY_BACKUP_FAILED',
                );
            }
        },
    };
}
