const ATTENDANCE_LABELS: Record<string, string> = {
    PRESENT: 'Hadir',
    ABSENT: 'Alfa',
    ON_LEAVE: 'Izin',
    // Turunan tampilan (bukan nilai enum AttendanceStatus di database).
    NO_RECORD: 'Belum absen',
    LATE: 'Terlambat',
};

const LEAVE_LABELS: Record<string, string> = {
    PENDING: 'Menunggu',
    APPROVED: 'Disetujui',
    REJECTED: 'Ditolak',
};

export function attendanceStatusLabel(status: string): string {
    return ATTENDANCE_LABELS[status] ?? status;
}

export function leaveStatusLabel(status: string): string {
    return LEAVE_LABELS[status] ?? status;
}
