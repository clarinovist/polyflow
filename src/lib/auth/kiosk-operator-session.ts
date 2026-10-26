import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { getTenantIdFromContext, prisma } from '@/lib/core/prisma';

/**
 * PIN-verified operator session for the shop-floor kiosk.
 *
 * The kiosk has no NextAuth session: operators only have an employee code and
 * the attendance PIN. Recording actual packaging moves stock and HPP, so the
 * server must know who is recording instead of trusting an operator id sent
 * by the tablet. A signed, short-lived cookie carries that identity.
 */

export const KIOSK_OPERATOR_COOKIE = 'kiosk_operator';
const COOKIE_PATH = '/kiosk';
/** One long shift. The client idle timeout ends sessions much sooner. */
const SESSION_TTL_SEC = 12 * 60 * 60;
/** Derives a kiosk-only key, so tokens from other features never verify here. */
const KEY_CONTEXT = 'kiosk-operator-session:v1';
const DEV_FALLBACK_SECRET = 'polyflow-dev-kiosk-operator';

export interface KioskOperatorSession {
    employeeId: string;
    code: string;
    name: string;
    tenantId: string | null;
}

function signingKey(): string {
    const base = process.env.AUTH_SECRET || process.env.EMPLOYEE_JWT_SECRET;
    if (!base) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error(
                'AUTH_SECRET wajib diisi untuk sesi operator kiosk.',
            );
        }
        return createHmac('sha256', DEV_FALLBACK_SECRET)
            .update(KEY_CONTEXT)
            .digest('hex');
    }
    return createHmac('sha256', base).update(KEY_CONTEXT).digest('hex');
}

function sign(body: string): string {
    return createHmac('sha256', signingKey()).update(body).digest('base64url');
}

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

export function createKioskOperatorToken(
    session: KioskOperatorSession,
    issuedAt = nowSeconds(),
): string {
    const body = Buffer.from(
        JSON.stringify({ ...session, exp: issuedAt + SESSION_TTL_SEC }),
    ).toString('base64url');
    return `${body}.${sign(body)}`;
}

function signatureMatches(body: string, signature: string): boolean {
    const expected = Buffer.from(sign(body));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
}

function parsePayload(body: string): Record<string, unknown> | null {
    try {
        const value: unknown = JSON.parse(
            Buffer.from(body, 'base64url').toString('utf8'),
        );
        return value && typeof value === 'object'
            ? (value as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

export function verifyKioskOperatorToken(
    token: string | undefined,
    tenantId: string | null,
    now = nowSeconds(),
): KioskOperatorSession | null {
    const parts = token?.split('.') ?? [];
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [body, signature] = parts;
    if (!signatureMatches(body, signature)) return null;

    const payload = parsePayload(body);
    if (!payload) return null;
    const { employeeId, code, name, exp } = payload;
    const tokenTenant = payload.tenantId ?? null;
    if (typeof exp !== 'number' || exp < now) return null;
    if (tokenTenant !== tenantId) return null;
    if (
        typeof employeeId !== 'string' ||
        typeof code !== 'string' ||
        typeof name !== 'string'
    ) {
        return null;
    }
    return { employeeId, code, name, tenantId };
}

export async function setKioskOperatorCookie(token: string): Promise<void> {
    const store = await cookies();
    store.set(KIOSK_OPERATOR_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: COOKIE_PATH,
        maxAge: SESSION_TTL_SEC,
    });
}

export async function clearKioskOperatorCookie(): Promise<void> {
    const store = await cookies();
    store.delete({ name: KIOSK_OPERATOR_COOKIE, path: COOKIE_PATH });
}

async function readCookieToken(): Promise<string | undefined> {
    try {
        const store = await cookies();
        return store.get(KIOSK_OPERATOR_COOKIE)?.value;
    } catch {
        // Outside a request (scripts, tests): there is no kiosk operator.
        return undefined;
    }
}

/**
 * The PIN-verified operator for this request, or null. Call inside a
 * withTenant scope so the token is checked against the resolved tenant.
 */
export async function getKioskOperatorSession(): Promise<KioskOperatorSession | null> {
    const token = await readCookieToken();
    if (!token) return null;
    const session = verifyKioskOperatorToken(
        token,
        getTenantIdFromContext() ?? null,
    );
    if (!session) return null;

    const employee = await prisma.employee.findUnique({
        where: { id: session.employeeId },
        select: { status: true, pinHash: true },
    });
    // A deactivated employee or a removed PIN ends the session immediately.
    if (!employee || employee.status !== 'ACTIVE' || !employee.pinHash)
        return null;
    return session;
}
