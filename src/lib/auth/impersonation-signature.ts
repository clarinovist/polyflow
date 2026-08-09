import { createHmac, timingSafeEqual } from 'crypto';

export interface ImpersonationSignaturePayload {
    email: string;
    subdomain: string;
    impersonationBy: string;
    impersonationExpiresAt: number;
}

export interface VerifyImpersonationSignatureInput
    extends ImpersonationSignaturePayload {
    signature: string | undefined;
}

function getAuthSecret(): string {
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) {
        throw new Error('Auth secret is required for impersonation.');
    }
    return secret;
}

function canonicalizePayload({
    email,
    subdomain,
    impersonationBy,
    impersonationExpiresAt,
}: ImpersonationSignaturePayload): string {
    return [
        email.trim().toLowerCase(),
        subdomain.trim().toLowerCase(),
        impersonationBy,
        String(impersonationExpiresAt),
    ].join('|');
}

export function createImpersonationSignature(
    payload: ImpersonationSignaturePayload,
): string {
    return createHmac('sha256', getAuthSecret())
        .update(canonicalizePayload(payload))
        .digest('hex');
}

export function verifyImpersonationSignature({
    signature,
    ...payload
}: VerifyImpersonationSignatureInput): boolean {
    if (!signature || payload.impersonationExpiresAt <= Math.floor(Date.now() / 1000)) {
        return false;
    }

    const expected = createImpersonationSignature(payload);
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(signature, 'hex');

    return (
        actualBuffer.length === expectedBuffer.length &&
        timingSafeEqual(actualBuffer, expectedBuffer)
    );
}
