import { Badge } from '@/components/ui/badge';
import { attendanceStatusLabel } from '@/lib/hrd/attendance-status-label';

interface BadgeRecord {
    status: string;
    isLate?: boolean;
    isOutsideRadius?: boolean;
    hasValidSelfie?: boolean;
}

const FLAG_BADGE_CLASS = 'text-[10px]';

/**
 * Badge per baris rekap harian: status (Alfa/Izin) untuk record non-hadir, dan
 * Terlambat / Di luar radius / Tanpa selfie untuk record hadir.
 */
export function AttendanceRowBadges({ record }: { record: BadgeRecord }) {
    const isPresent = record.status === 'PRESENT';
    return (
        <div className="flex flex-wrap gap-1">
            {record.status === 'ABSENT' && (
                <Badge variant="destructive" className={FLAG_BADGE_CLASS}>
                    {attendanceStatusLabel('ABSENT')}
                </Badge>
            )}
            {record.status === 'ON_LEAVE' && (
                <Badge variant="secondary" className={FLAG_BADGE_CLASS}>
                    {attendanceStatusLabel('ON_LEAVE')}
                </Badge>
            )}
            {isPresent && record.isLate && (
                <Badge
                    className={`${FLAG_BADGE_CLASS} border-transparent bg-amber-500/15 text-amber-700`}
                >
                    {attendanceStatusLabel('LATE')}
                </Badge>
            )}
            {isPresent && record.isOutsideRadius && (
                <Badge
                    variant="outline"
                    className={`${FLAG_BADGE_CLASS} border-orange-500/40 text-orange-600`}
                >
                    Di luar radius
                </Badge>
            )}
            {isPresent && record.hasValidSelfie === false && (
                <Badge
                    variant="outline"
                    className={`${FLAG_BADGE_CLASS} border-red-500/40 text-red-600`}
                >
                    Tanpa selfie
                </Badge>
            )}
        </div>
    );
}
