import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    logCentralLoginFailure,
    type CentralLoginDiagnosticContext,
} from '../central-login-diagnostics';

const context: CentralLoginDiagnosticContext = { stage: 'INVITATION_ACCEPT', invitationPresent: true };
beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));
afterEach(() => vi.restoreAllMocks());
function record(error: unknown) {
    logCentralLoginFailure(context, error);
    expect(console.warn).toHaveBeenCalledTimes(1);
    const [prefix, serialized] = vi.mocked(console.warn).mock.calls[0];
    expect(prefix).toBe('[auth][central-login-denied]');
    return JSON.parse(serialized as string);
}

describe('bounded central login failure telemetry', () => {
    it.each([
        ['ACCOUNT_NOT_FOUND'], ['ACCOUNT_INACTIVE'], ['MEMBERSHIP_NOT_FOUND'],
        ['MEMBERSHIP_INACTIVE'], ['TENANT_INACTIVE'], ['TENANT_BINDING_MISMATCH'],
        ['LOCAL_USER_INACTIVE'], ['SESSION_REVOKED'],
    ])('allows binding reason %s without arbitrary error data', reason => {
        expect(record({ reason, message: 'private@example.test', stack: 'secret', cause: { token: 'secret' } }))
            .toEqual({ ...context, reason });
    });

    it.each([
        ['Undangan tidak valid.', 'INVITATION_INVALID'],
        ['Undangan tidak valid atau sudah berakhir.', 'INVITATION_NOT_FOUND'],
        ['Undangan tidak berlaku untuk perusahaan ini.', 'INVITATION_TENANT_MISMATCH'],
        ['Undangan sudah tidak dapat digunakan.', 'INVITATION_NOT_USABLE'],
        ['Undangan sudah berakhir.', 'INVITATION_EXPIRED'],
        ['Undangan sudah dipakai atau sudah berakhir.', 'INVITATION_CLAIM_CONFLICT'],
        ['Akun pusat tidak sesuai dengan penerima undangan.', 'INVITATION_EMAIL_MISMATCH'],
        ['Email akun pusat harus sudah terverifikasi.', 'EMAIL_UNVERIFIED'],
        ['Identitas pusat belum terverifikasi.', 'EMAIL_UNVERIFIED'],
        ['CentralTenantContextMismatch', 'TENANT_CONTEXT_MISMATCH'],
        ['Tenant callback tidak cocok.', 'TENANT_CONTEXT_MISMATCH'],
        ['Tenant tidak aktif.', 'TENANT_INACTIVE'],
        ['Tenant tidak tersedia.', 'TENANT_UNAVAILABLE'],
        ['Akun pusat tidak aktif.', 'ACCOUNT_INACTIVE'],
        ['Akun pusat sudah terhubung ke pengguna lain di tenant ini.', 'ACCOUNT_ALREADY_LINKED'],
        ['Membership yang telah dicabut tidak dapat dipulihkan melalui undangan lama.', 'MEMBERSHIP_REVOKED'],
        ['Keanggotaan yang dicabut tidak dapat diaktifkan ulang.', 'MEMBERSHIP_REVOKED'],
        ['Keanggotaan menunjuk pengguna tenant lain.', 'TENANT_BINDING_MISMATCH'],
        ['Pengguna tenant sudah terhubung ke akun pusat lain.', 'LOCAL_USER_ALREADY_LINKED'],
        ['Pengguna tenant tidak aktif.', 'LOCAL_USER_INACTIVE'],
        ['Keanggotaan sudah aktif.', 'MEMBERSHIP_ALREADY_ACTIVE'],
        ['Binding pengguna tenant tidak valid.', 'LOCAL_BINDING_INVALID'],
    ])('maps static message to %s without logging the message', (message, reason) => {
        expect(record(new Error(message))).toEqual({ ...context, reason });
    });

    it.each([
        ['P2002', 'DB_UNIQUE_CONFLICT'], ['P2025', 'DB_RECORD_CONFLICT'],
        ['P2028', 'DB_TRANSACTION_FAILED'], ['P2034', 'DB_TRANSACTION_CONFLICT'],
        ['P1001', 'DB_UNAVAILABLE'], ['P1002', 'DB_TIMEOUT'], ['P2024', 'DB_POOL_TIMEOUT'],
        ['NOT_FOUND', 'RECORD_NOT_FOUND'], ['CONFLICT', 'STATE_CONFLICT'],
        ['BUSINESS_RULE_VIOLATION', 'BUSINESS_RULE_REJECTED'], ['AUTHORIZATION_ERROR', 'AUTHORIZATION_REJECTED'],
    ])('maps code %s without exception message or metadata', (code, reason) => {
        expect(record({ code, message: 'query with private@example.test', meta: { token: 'secret' } }))
            .toEqual({ ...context, reason });
    });

    it.each([
        undefined, null, 'private@example.test', 42,
        new Error('Undangan sudah berakhir. private@example.test'),
        { reason: 'ACCOUNT_NOT_FOUND\nsecret', code: 'P2002 secret', message: 'secret', name: 'secret' },
        { reason: 1, code: {}, message: ['secret'], details: { token: 'secret' } },
    ])('collapses unknown errors without serializing them', error => {
        expect(record(error)).toEqual({ ...context, reason: 'UNEXPECTED_ERROR' });
    });

    it('whitelists stage and cookie presence even for malformed runtime input', () => {
        logCentralLoginFailure({ stage: 'private@example.test', invitationPresent: 'secret' } as unknown as CentralLoginDiagnosticContext, null);
        expect(JSON.parse(vi.mocked(console.warn).mock.calls[0][1] as string))
            .toEqual({ stage: 'UNKNOWN', invitationPresent: null, reason: 'UNEXPECTED_ERROR' });
    });

    it('does not execute error serialization', () => {
        const toJSON = vi.fn(() => { throw new Error('must not serialize'); });
        expect(record({ toJSON, cause: { token: 'secret' } })).toEqual({ ...context, reason: 'UNEXPECTED_ERROR' });
        expect(toJSON).not.toHaveBeenCalled();
    });

    it('does not propagate throwing error accessors', () => {
        expect(() => logCentralLoginFailure(context, { get reason() { throw new Error('secret'); } })).not.toThrow();
        expect(console.warn).not.toHaveBeenCalled();
    });
});
