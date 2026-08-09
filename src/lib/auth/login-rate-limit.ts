import { rateLimit } from '@/lib/api/rate-limit';

export const MAIN_LOGIN_RATE_LIMIT_MESSAGE =
    'Terlalu banyak percobaan login. Coba lagi 5 menit.';

const DEFAULT_IP_LIMIT = 30;
const DEFAULT_IDENTITY_LIMIT = 5;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

export type MainLoginRateLimitReason = 'ip' | 'identity';

export interface MainLoginRateLimitInput {
    ip: string;
    email: string;
    subdomain: string;
}

export type MainLoginRateLimitResult =
    | { success: true }
    | {
          success: false;
          reason: MainLoginRateLimitReason;
          message: typeof MAIN_LOGIN_RATE_LIMIT_MESSAGE;
      };

function readPositiveIntegerEnv(name: string, fallback: number): number {
    const value = Number.parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeKeyPart(value: string, fallback: string): string {
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : fallback;
}

export function checkMainLoginRateLimit({
    ip,
    email,
    subdomain,
}: MainLoginRateLimitInput): MainLoginRateLimitResult {
    const windowMs = readPositiveIntegerEnv(
        'LOGIN_RATE_LIMIT_WINDOW_MS',
        DEFAULT_WINDOW_MS,
    );
    const ipLimit = readPositiveIntegerEnv(
        'LOGIN_RATE_LIMIT_IP_MAX',
        DEFAULT_IP_LIMIT,
    );
    const identityLimit = readPositiveIntegerEnv(
        'LOGIN_RATE_LIMIT_IDENTITY_MAX',
        DEFAULT_IDENTITY_LIMIT,
    );
    const normalizedIp = normalizeKeyPart(ip, '127.0.0.1');
    const normalizedEmail = normalizeKeyPart(email, 'unknown-email');
    const normalizedSubdomain = normalizeKeyPart(subdomain, 'main');

    const ipResult = rateLimit(
        `main_login:ip:${normalizedIp}`,
        ipLimit,
        windowMs,
    );
    if (!ipResult.success) {
        return {
            success: false,
            reason: 'ip',
            message: MAIN_LOGIN_RATE_LIMIT_MESSAGE,
        };
    }

    const identityResult = rateLimit(
        `main_login:identity:${normalizedIp}:${normalizedSubdomain}:${normalizedEmail}`,
        identityLimit,
        windowMs,
    );
    if (!identityResult.success) {
        return {
            success: false,
            reason: 'identity',
            message: MAIN_LOGIN_RATE_LIMIT_MESSAGE,
        };
    }

    return { success: true };
}
