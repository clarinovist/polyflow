import { formatWIB } from '@/lib/utils/timezone';

export interface ShiftOptionLike {
    shiftName: string;
    startTime: Date | string;
    endTime: Date | string;
}

/**
 * Label picker shift yang tidak ambigu lintas hari.
 *
 * Latar belakang: beberapa WO punya beberapa baris bernama sama
 * (mis. dua "Shift Malam" untuk tanggal berbeda) sehingga operator salah
 * pilih di kiosk. Label selalu memuat tanggal+jam mulai dan jam selesai.
 */
export function formatShiftOptionLabel(shift: ShiftOptionLike): string {
    const start = formatWIB(shift.startTime, 'dd MMM HH:mm');
    const end = formatWIB(shift.endTime, 'HH:mm');
    return `${shift.shiftName} \u2022 ${start}\u2013${end}`;
}

export interface RecordedTimeLike {
    createdAt: Date | string | null | undefined;
    startTime: Date | string | null | undefined;
    endTime?: Date | string | null | undefined;
}

/**
 * true bila tanggal-WIB waktu catat beda dengan tanggal-WIB waktu produksi
 * (entri backdate shift malam). Dipakai untuk menampilkan catatan jam aktual.
 */
export function isBackdatedEntry(exec: RecordedTimeLike): boolean {
    if (!exec.createdAt) return false;
    const ref = exec.startTime ?? exec.endTime;
    if (!ref) return false;
    return (
        formatWIB(exec.createdAt, 'yyyy-MM-dd') !== formatWIB(ref, 'yyyy-MM-dd')
    );
}
