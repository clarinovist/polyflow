import { BusinessRuleError } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { getKioskOperatorSession } from '@/lib/auth/kiosk-operator-session';
import { KIOSK_OPERATOR_SESSION_REQUIRED } from '@/lib/kiosk/operator-session-errors';

/**
 * Who performs a kiosk-capable action. A PIN-verified kiosk operator always
 * wins over the operator id the tablet sends; signed-in users keep working.
 */
export async function resolveKioskActor(clientOperatorId?: string) {
    const kioskOperator = await getKioskOperatorSession();
    let userId: string | undefined;
    try {
        const session = await requireAuth();
        userId = session.user.id;
    } catch {
        // Kiosk mode: no NextAuth session.
    }
    if (!userId && !kioskOperator) {
        throw new BusinessRuleError(
            'Sesi operator berakhir. Pilih nama Anda dan masukkan PIN lagi.',
            undefined,
            KIOSK_OPERATOR_SESSION_REQUIRED,
        );
    }
    return {
        userId,
        operatorId: kioskOperator?.employeeId ?? clientOperatorId,
        kioskOperator: kioskOperator
            ? { employeeId: kioskOperator.employeeId, code: kioskOperator.code }
            : undefined,
    };
}
