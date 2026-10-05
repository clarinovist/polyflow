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
