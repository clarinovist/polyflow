'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma as db } from '@/lib/core/prisma';
import { verifyPin } from '@/services/hrd/pin-helpers';
import { normalizePhone, phoneVariants } from '@/lib/utils/phone';
import { createEmployeeSessionToken, setEmployeeSessionCookie, clearEmployeeSessionCookie } from '@/lib/auth/employee-session';
import { rateLimit } from '@/lib/api/rate-limit';
import { headers } from 'next/headers';

async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || '127.0.0.1';
}

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 5 * 60 * 1000;

export const loginEmployee = withTenant(
  async function loginEmployee(phoneInput: string, pin: string) {
    try {
      const ip = await getClientIp();
      const normalized = normalizePhone(phoneInput);
      const key = `emp_login:${ip}:${normalized}`;
      const { success } = rateLimit(key, RATE_LIMIT, RATE_WINDOW_MS);
      if (!success) {
        return { success: false, error: 'Terlalu banyak percobaan. Coba lagi 5 menit.' };
      }

      if (!normalized || pin.length < 4) {
        return { success: false, error: 'No HP atau PIN tidak valid' };
      }

      // Search Employee by phone variants + code fallback
      const variants = phoneVariants(phoneInput);
      // Include raw input too
      const allCandidates = [...new Set([...variants, phoneInput.trim()])];

      const employee = await db.employee.findFirst({
        where: {
          OR: [
            { phone: { in: allCandidates } },
            { code: phoneInput.trim() }, // fallback: boleh login pakai Kode Karyawan
          ],
          status: 'ACTIVE',
        },
        select: { id: true, code: true, name: true, phone: true, pinHash: true, status: true },
      });

      if (!employee || !employee.pinHash) {
        return { success: false, error: 'No HP / Kode atau PIN salah' };
      }

      const ok = await verifyPin(pin, employee.pinHash);
      if (!ok) {
        return { success: false, error: 'No HP / Kode atau PIN salah' };
      }

      const token = await createEmployeeSessionToken({
        employeeId: employee.id,
        code: employee.code,
        name: employee.name,
      });

      await setEmployeeSessionCookie(token);

      return { success: true, data: { name: employee.name, code: employee.code } };
    } catch (e) {
      console.error('[loginEmployee]', e);
      return { success: false, error: 'Gagal login. Coba lagi.' };
    }
  }
);

export const logoutEmployee = withTenant(
  async function logoutEmployee() {
    await clearEmployeeSessionCookie();
    return { success: true };
  }
);

// For admin to check employee has phone+pin setup
export const checkEmployeeMyAccess = withTenant(
  async function checkEmployeeMyAccess(employeeId: string) {
    const emp = await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, phone: true, pinHash: true, status: true },
    });
    if (!emp) return { hasPhone: false, hasPin: false, status: 'NOT_FOUND' };
    return { hasPhone: !!emp.phone, hasPin: !!emp.pinHash, status: emp.status };
  }
);
