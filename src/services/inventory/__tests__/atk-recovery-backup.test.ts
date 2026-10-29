import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/lib/storage/r2', () => ({ BUCKET: 'synthetic', r2Client: { send: m.send } }));
import { atkRecoveryBackup } from '../atk-recovery-backup';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('S3_ENDPOINT', 'synthetic'); vi.stubEnv('S3_ACCESS_KEY_ID', 'synthetic'); vi.stubEnv('S3_SECRET_ACCESS_KEY', 'synthetic'); });

describe('ATK before-image storage', () => {
    it('uses conditional creation and verifies read-back bytes before returning a private reference', async () => {
        let bytes: Buffer;
        m.send.mockImplementation(async command => {
            if (command instanceof PutObjectCommand) { expect(command.input.IfNoneMatch).toBe('*'); bytes = command.input.Body as Buffer; return {}; }
            expect(command).toBeInstanceOf(GetObjectCommand);
            return { ContentLength: bytes.length, Body: { transformToByteArray: async () => bytes } };
        });
        expect(await atkRecoveryBackup('tenant-fixture').save({ quantity: '10' }, 'hash')).toMatch(/^backups\/tenants\/tenant-fixture\/atk-cost-recovery\/.*#sha256=/);
    });
    it('fails closed without exposing endpoint details on mismatched bytes or storage failure', async () => {
        m.send.mockResolvedValueOnce({}).mockResolvedValueOnce({ ContentLength: 1 });
        await expect(atkRecoveryBackup('test').save({}, 'h')).rejects.toMatchObject({ code: 'ATK_BACKUP_FAILED' });
        m.send.mockRejectedValue(new Error('credential secret endpoint'));
        await expect(atkRecoveryBackup('test').save({}, 'h')).rejects.toThrow('Cadangan koreksi ATK');
        vi.stubEnv('S3_ENDPOINT', ''); expect(atkRecoveryBackup('test').ready()).toBe(false);
    });
});
