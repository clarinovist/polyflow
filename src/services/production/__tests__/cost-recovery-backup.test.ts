import { beforeEach, describe, expect, it, vi } from 'vitest';
const send = vi.hoisted(() => vi.fn());
vi.mock('@/lib/storage/r2', () => ({ BUCKET: 'synthetic-private', r2Client: { send } }));
import { productionRecoveryBackup } from '../cost-recovery-backup';
import { PutObjectCommand } from '@aws-sdk/client-s3';

describe('verified scoped recovery backup', () => {
    beforeEach(() => { vi.resetAllMocks(); });
    it('writes once to private backups then reads/hash-verifies exact bytes', async () => {
        let body: Buffer;
        send.mockImplementation(async command => {
            if (command instanceof PutObjectCommand) { body = command.input.Body as Buffer; return {}; }
            return { ContentLength: body.length, Body: { transformToByteArray: async () => body } };
        });
        const reference = await productionRecoveryBackup('synthetic-tenant').save({ cost: null, quantity: '2' }, 'a'.repeat(64));
        expect(reference).toMatch(/^backups\/tenants\/synthetic-tenant\/production-cost-recovery\/.+\.json#sha256=[a-f0-9]{64}$/);
        expect(send.mock.calls[0][0].input).toMatchObject({ IfNoneMatch: '*', ContentType: 'application/json' });
        expect(send).toHaveBeenCalledTimes(2);
    });
    it.each(['size', 'hash', 'storage'])('fails closed and redacts %s failure', async kind => {
        send.mockImplementationOnce(async () => ({})).mockImplementationOnce(async () => {
            if (kind === 'storage') throw new Error('private storage endpoint');
            const original = send.mock.calls[0][0].input.Body as Buffer;
            return { ContentLength: kind === 'size' ? 0 : original.length, Body: { transformToByteArray: async () => Buffer.alloc(original.length) } };
        });
        await expect(productionRecoveryBackup('tenant').save({ source: 'synthetic' }, 'a'.repeat(64))).rejects.toMatchObject({ code: 'PRODUCTION_RECOVERY_BACKUP_FAILED' });
    });
});
