export const CENTRAL_LOGIN_STAGES = [
    'REQUEST_CONTEXT',
    'INVITATION_COOKIE_READ',
    'INVITATION_TENANT_LOOKUP',
    'INVITATION_ACCEPT',
    'MEMBERSHIP_ACTIVATE',
    'INVITATION_COOKIE_CLEAR',
    'LOGIN_USER_RESOLVE',
    'SESSION_USER_ASSIGN',
] as const;

export interface CentralLoginDiagnosticContext {
    stage: (typeof CENTRAL_LOGIN_STAGES)[number];
    invitationPresent: boolean | null;
}

const BINDING_REASONS = new Set([
    'ACCOUNT_NOT_FOUND',
    'ACCOUNT_INACTIVE',
    'MEMBERSHIP_NOT_FOUND',
    'MEMBERSHIP_INACTIVE',
    'TENANT_INACTIVE',
    'TENANT_BINDING_MISMATCH',
    'LOCAL_USER_INACTIVE',
    'SESSION_REVOKED',
]);

// Match ONLY exact, static messages from the existing auth services. Never
// output the message itself: unknown errors can contain queries or credentials.
const MESSAGE_REASONS = new Map([
    ['CentralTenantContextMissing', 'CONTEXT_OR_PROFILE_MISSING'],
    ['CentralTenantContextMismatch', 'TENANT_CONTEXT_MISMATCH'],
    ['Email akun pusat harus sudah terverifikasi.', 'EMAIL_UNVERIFIED'],
    ['Identitas pusat belum terverifikasi.', 'EMAIL_UNVERIFIED'],
    ['Undangan tidak valid.', 'INVITATION_INVALID'],
    ['Undangan tidak valid atau sudah berakhir.', 'INVITATION_NOT_FOUND'],
    ['Undangan tidak berlaku untuk perusahaan ini.', 'INVITATION_TENANT_MISMATCH'],
    ['Undangan sudah tidak dapat digunakan.', 'INVITATION_NOT_USABLE'],
    ['Undangan sudah berakhir.', 'INVITATION_EXPIRED'],
    ['Undangan sudah dipakai atau sudah berakhir.', 'INVITATION_CLAIM_CONFLICT'],
    ['Akun pusat tidak sesuai dengan penerima undangan.', 'INVITATION_EMAIL_MISMATCH'],
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
    ['Issuer identitas pusat tidak valid.', 'ISSUER_INVALID'],
    ['Tenant callback tidak cocok.', 'TENANT_CONTEXT_MISMATCH'],
    ['Binding pengguna tenant tidak valid.', 'LOCAL_BINDING_INVALID'],
]);

const CODE_REASONS = new Map([
    ['P2002', 'DB_UNIQUE_CONFLICT'],
    ['P2025', 'DB_RECORD_CONFLICT'],
    ['P2028', 'DB_TRANSACTION_FAILED'],
    ['P2034', 'DB_TRANSACTION_CONFLICT'],
    ['P1001', 'DB_UNAVAILABLE'],
    ['P1002', 'DB_TIMEOUT'],
    ['P2024', 'DB_POOL_TIMEOUT'],
    ['NOT_FOUND', 'RECORD_NOT_FOUND'],
    ['CONFLICT', 'STATE_CONFLICT'],
    ['BUSINESS_RULE_VIOLATION', 'BUSINESS_RULE_REJECTED'],
    ['AUTHORIZATION_ERROR', 'AUTHORIZATION_REJECTED'],
]);

function failureReason(error: unknown): string {
    if (!error || typeof error !== 'object') return 'UNEXPECTED_ERROR';
    const { reason, message, code } = error as {
        reason?: unknown;
        message?: unknown;
        code?: unknown;
    };
    if (typeof reason === 'string' && BINDING_REASONS.has(reason)) return reason;
    if (typeof message === 'string' && MESSAGE_REASONS.has(message)) {
        return MESSAGE_REASONS.get(message)!;
    }
    if (typeof code === 'string' && CODE_REASONS.has(code)) {
        return CODE_REASONS.get(code)!;
    }
    return 'UNEXPECTED_ERROR';
}

/** Server-only failure telemetry. No request/profile/error object reaches logs. */
export function logCentralLoginFailure(
    context: CentralLoginDiagnosticContext,
    error: unknown,
): void {
    try {
        console.warn('[auth][central-login-denied]', JSON.stringify({
            stage: CENTRAL_LOGIN_STAGES.includes(context.stage)
                ? context.stage
                : 'UNKNOWN',
            invitationPresent: typeof context.invitationPresent === 'boolean'
                ? context.invitationPresent
                : null,
            reason: failureReason(error),
        }));
    } catch {
        // Diagnostics (including a broken sink/error accessor) must never
        // replace the existing fail-closed, generic AccessDenied response.
    }
}
