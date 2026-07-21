import { cookies } from 'next/headers';
import { prisma } from '@/lib/core/prisma';
import { withTenantPage } from '@/lib/core/tenant';

const COOKIE_NAME = 'emp_session';
const JWT_EXPIRY_SEC = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  return process.env.EMPLOYEE_JWT_SECRET || process.env.AUTH_SECRET || 'polyflow-employee-secret-change-me';
}

export interface EmployeeSessionPayload {
  employeeId: string;
  code: string;
  name: string;
  tenantId?: string;
}

// --- Minimal JWT HS256 using Web Crypto / Node crypto (no extra dep) ---
function b64urlEncode(obj: unknown): string {
  const json = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return Buffer.from(json).toString('base64url');
}
function b64urlDecode<T>(b64: string): T {
  return JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as T;
}
async function hmacSign(data: string, secret: string): Promise<string> {
  const { createHmac } = await import('crypto');
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export async function createEmployeeSessionToken(payload: EmployeeSessionPayload): Promise<string> {
  const header = b64urlEncode({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const body = b64urlEncode({ ...payload, iat: now, exp: now + JWT_EXPIRY_SEC });
  const sig = await hmacSign(`${header}.${body}`, getSecret());
  return `${header}.${body}.${sig}`;
}

export async function verifyEmployeeSessionToken(token: string): Promise<EmployeeSessionPayload | null> {
  try {
    const [h, b, s] = token.split('.');
    if (!h || !b || !s) return null;
    const expectedSig = await hmacSign(`${h}.${b}`, getSecret());
    if (s !== expectedSig) return null;
    const payload = b64urlDecode<{ employeeId: string; code: string; name: string; tenantId?: string; exp: number }>(b);
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { employeeId: payload.employeeId, code: payload.code, name: payload.name, tenantId: payload.tenantId };
  } catch {
    return null;
  }
}

export async function setEmployeeSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/my',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function clearEmployeeSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getEmployeeSession(): Promise<EmployeeSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyEmployeeSessionToken(token);
}

/** Server helper to require auth in /my pages — returns payload or null */
export const requireEmployeeSession = withTenantPage(async function requireEmployeeSession() {
  const session = await getEmployeeSession();
  if (!session) return null;

  // Validate employee still active (lightweight)
  const emp = await prisma.employee.findUnique({
    where: { id: session.employeeId },
    select: { id: true, status: true, pinHash: true },
  });
  if (!emp || emp.status !== 'ACTIVE') {
    await clearEmployeeSessionCookie();
    return null;
  }

  // If pinHash cleared after login -> invalidate
  if (!emp.pinHash) {
    await clearEmployeeSessionCookie();
    return null;
  }

  return session;
});

export const getCurrentEmployeeFull = withTenantPage(async function getCurrentEmployeeFull() {
  const session = await getEmployeeSession();
  if (!session) return null;
  const emp = await prisma.employee.findUnique({
    where: { id: session.employeeId },
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      role: true,
      payType: true,
      dailyRate: true,
      monthlySalary: true,
      status: true,
      employmentStatus: true,
      joinDate: true,
      bpjsParticipant: true,
      photoUrl: true,
    },
  });
  return emp;
});
