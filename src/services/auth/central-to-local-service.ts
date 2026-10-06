import { BusinessRuleError } from '@/lib/errors/errors';

export type CentralMembershipStatus = 'PENDING' | 'ACTIVE' | 'REVOKED' | null;

export interface CentralToLocalTarget {
    id: string;
    authMode: 'LOCAL' | 'CENTRAL';
    centralAccountId: string | null;
    isSuperAdmin?: boolean;
}

export interface CentralToLocalGate {
    membershipStatus: CentralMembershipStatus;
    hasPendingInvitation: boolean;
}

/**
 * Guard murni untuk konversi eksplisit CENTRAL -> LOCAL.
 * Revoke Google sengaja mempertahankan authMode CENTRAL agar password lama
 * tidak hidup lagi sebagai fallback; satu-satunya jalan kembali ke password
 * lokal adalah aksi eksplisit ini (oleh admin, dengan password baru).
 *
 * Aturan:
 * - hanya target CENTRAL (sudah LOCAL => idempoten ditolak, suruh pakai edit biasa)
 * - superadmin => tolak
 * - membership ACTIVE => tolak (cabut dulu)
 * - undangan PENDING => tolak (batalkan dulu)
 * - membership REVOKED / null / PENDING-row? PENDING di sini berarti status
 *   membership lama yang belum aktif — tetap tolak bila ada undangan aktif;
 *   status PENDING tanpa undangan dianggap belum aktif dan BOLEH dikonversi.
 */
export function assertConvertibleToLocal(
    target: CentralToLocalTarget,
    gate: CentralToLocalGate,
): void {
    if (target.isSuperAdmin) {
        throw new BusinessRuleError('Tidak dapat mengubah akun Super Admin');
    }
    if (target.authMode !== 'CENTRAL') {
        throw new BusinessRuleError(
            'Akun ini sudah lokal. Pakai form edit biasa untuk ganti password.',
        );
    }
    if (gate.membershipStatus === 'ACTIVE') {
        throw new BusinessRuleError(
            'Cabut akses login Google dulu sebelum menjadikan akun lokal.',
        );
    }
    if (gate.hasPendingInvitation) {
        throw new BusinessRuleError(
            'Batalkan undangan Google yang masih pending dulu sebelum menjadikan akun lokal.',
        );
    }
}
