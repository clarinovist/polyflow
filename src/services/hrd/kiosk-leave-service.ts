import type { PrismaClient } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { countLeaveDays } from '@/lib/hrd/leave-presets';
import { verifyPin } from './pin-helpers';
import { MyLeaveService, type MyLeaveInput } from './leave-self-service';

export interface KioskLeaveCreateInput {
    employeeCode: string;
    pin: string;
    input: MyLeaveInput;
}

export interface KioskLeaveResult {
    id: string;
    days: number;
}

const INVALID_CREDENTIALS_MESSAGE = 'Data karyawan tidak lengkap';

function assertCredentialShape(employeeCode: unknown, pin: unknown) {
    if (
        typeof employeeCode !== 'string' ||
        employeeCode.trim() === '' ||
        typeof pin !== 'string'
    ) {
        throw new BusinessRuleError(INVALID_CREDENTIALS_MESSAGE);
    }
}

async function authenticateEmployee(
    db: PrismaClient,
    employeeCode: string,
    pin: string,
): Promise<string> {
    const employee = await db.employee.findUnique({
        where: { code: employeeCode },
        select: { id: true, status: true, pinHash: true },
    });
    if (!employee) throw new BusinessRuleError('Karyawan tidak ditemukan');
    if (employee.status !== 'ACTIVE') {
        throw new BusinessRuleError('Karyawan tidak aktif');
    }
    if (!(await verifyPin(pin, employee.pinHash))) {
        throw new BusinessRuleError('PIN salah');
    }
    return employee.id;
}

/**
 * Pengajuan izin dari kiosk publik: identitas dibuktikan dengan kode + PIN.
 * Urutan wajib: karyawan -> PIN -> baru input, supaya validasi tanggal/DB
 * tidak menjadi oracle bagi penebak PIN.
 */
export const KioskLeaveService = {
    async create(
        db: PrismaClient,
        { employeeCode, pin, input }: KioskLeaveCreateInput,
        now: Date = new Date(),
    ): Promise<KioskLeaveResult> {
        assertCredentialShape(employeeCode, pin);
        const employeeId = await authenticateEmployee(db, employeeCode, pin);
        const request = await MyLeaveService.create(
            db,
            employeeId,
            input,
            now,
        );
        return {
            id: request.id,
            days: countLeaveDays(input.startDate, input.endDate),
        };
    },
};
