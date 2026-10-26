'use server';

import { z } from 'zod';
import { withTenant } from '@/lib/core/tenant';
import { getTenantIdFromContext, prisma } from '@/lib/core/prisma';
import { BusinessRuleError, safeAction } from '@/lib/errors/errors';
import { rateLimit } from '@/lib/api/rate-limit';
import { getClientIp } from '@/lib/api/client-ip';
import { isValidPin, verifyPin } from '@/services/hrd/pin-helpers';
import {
    clearKioskOperatorCookie,
    createKioskOperatorToken,
    getKioskOperatorSession,
    setKioskOperatorCookie,
} from '@/lib/auth/kiosk-operator-session';

const PIN_ATTEMPT_LIMIT = 5;
const PIN_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

const startSessionSchema = z.object({
    employeeId: z.string().min(1).max(64),
    pin: z.string().refine(isValidPin, 'PIN berisi 4 sampai 6 angka.'),
});

/** Operator taps their name, then enters the attendance PIN. */
export const startKioskOperatorSession = withTenant(
    async function startKioskOperatorSession(employeeId: string, pin: string) {
        return safeAction(async () => {
            const parsed = startSessionSchema.safeParse({ employeeId, pin });
            if (!parsed.success) {
                throw new BusinessRuleError(parsed.error.issues[0].message);
            }

            const ip = await getClientIp();
            const attempt = rateLimit(
                `kiosk_pin:${ip}:${parsed.data.employeeId}`,
                PIN_ATTEMPT_LIMIT,
                PIN_ATTEMPT_WINDOW_MS,
            );
            if (!attempt.success) {
                throw new BusinessRuleError(
                    'Terlalu banyak percobaan PIN. Coba lagi 5 menit lagi.',
                );
            }

            const employee = await prisma.employee.findFirst({
                where: {
                    id: parsed.data.employeeId,
                    status: 'ACTIVE',
                    role: 'OPERATOR',
                },
                select: { id: true, code: true, name: true, pinHash: true },
            });
            if (!employee) {
                throw new BusinessRuleError(
                    'Operator tidak ditemukan atau sudah tidak aktif.',
                );
            }
            if (!employee.pinHash) {
                throw new BusinessRuleError(
                    'Anda belum punya PIN. Minta HRD membuatkan PIN absensi.',
                );
            }
            if (!(await verifyPin(parsed.data.pin, employee.pinHash))) {
                throw new BusinessRuleError('PIN salah.');
            }

            const token = createKioskOperatorToken({
                employeeId: employee.id,
                code: employee.code,
                name: employee.name,
                tenantId: getTenantIdFromContext() ?? null,
            });
            await setKioskOperatorCookie(token);
            return {
                id: employee.id,
                name: employee.name,
                code: employee.code,
            };
        });
    },
);

/** "Ganti operator", logout, and the idle timeout all end the session. */
export const endKioskOperatorSession = withTenant(
    async function endKioskOperatorSession() {
        return safeAction(async () => {
            await clearKioskOperatorCookie();
            return null;
        });
    },
);

/** Lets kiosk pages drop a stale client-side operator that has no session. */
export const getKioskOperatorSessionInfo = withTenant(
    async function getKioskOperatorSessionInfo() {
        return safeAction(async () => {
            const session = await getKioskOperatorSession();
            return session
                ? {
                      id: session.employeeId,
                      name: session.name,
                      code: session.code,
                  }
                : null;
        });
    },
);
