'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/core/tenant';
import { prisma as db } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { checkKioskRateLimit } from '@/lib/hrd/kiosk-guard';
import { KioskLeaveService } from '@/services/hrd/kiosk-leave-service';
import {
    parseMyLeaveInput,
    type MyLeaveInput,
} from '@/services/hrd/leave-self-service';
import { mapKioskError } from './attendance';

/**
 * Izin dari kiosk publik (tanpa sesi): identitas = kode + PIN. Berbagi satu
 * ember rate limit dengan absen kiosk supaya bukan jalur baru menebak PIN.
 * Data balikan hanya {id, days}; baris LeaveRequest tidak pernah dikembalikan.
 */

const RATE_LIMIT_MESSAGE =
    'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.';
const CREATE_FAILED_MESSAGE =
    'Gagal mengirim pengajuan izin. Silakan coba lagi.';
const INVALID_CREDENTIALS_MESSAGE = 'Data karyawan tidak lengkap';

type KioskLeaveResponse = {
    success: boolean;
    data?: { id: string; days: number };
    error?: string;
};

// Hanya error bisnis yang pesannya aman ditampilkan; sisanya generik.
async function toUserMessage(error: unknown): Promise<string> {
    if (error instanceof BusinessRuleError || error instanceof NotFoundError) {
        return mapKioskError(error);
    }
    return CREATE_FAILED_MESSAGE;
}

export const kioskRequestLeave = withTenant(async function kioskRequestLeave(
    employeeCode: string,
    pin: string,
    input: MyLeaveInput,
): Promise<KioskLeaveResponse> {
    try {
        if (!(await checkKioskRateLimit(employeeCode))) {
            return { success: false, error: RATE_LIMIT_MESSAGE };
        }
        if (typeof employeeCode !== 'string' || typeof pin !== 'string') {
            return { success: false, error: INVALID_CREDENTIALS_MESSAGE };
        }
        const safeInput = parseMyLeaveInput(input);
        const { id, days } = await KioskLeaveService.create(db, {
            employeeCode,
            pin,
            input: safeInput,
        });
        revalidatePath('/hrd/leave');
        return { success: true, data: { id, days } };
    } catch (error) {
        return { success: false, error: await toUserMessage(error) };
    }
});
