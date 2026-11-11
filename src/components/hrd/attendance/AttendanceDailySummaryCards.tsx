import { ArrowUpDown, Clock, Users } from 'lucide-react';
import { MULTI_SHIFT_LABEL } from './attendance-recap-helpers';
import type { DailySummary } from './attendance-recap-types';
import { SummaryCard } from './RecapShared';

/** Kartu ringkasan rekap harian dari agregat server. */
export function AttendanceDailySummaryCards({ summary }: { summary: DailySummary }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryCard
                icon={<Users className="h-4 w-4" />}
                label="Hadir"
                value={`${summary.totalEmployees} orang`}
            />
            <SummaryCard
                icon={<ArrowUpDown className="h-4 w-4" />}
                label="Catatan"
                value={`${summary.totalRecords} shift`}
            />
            <SummaryCard
                icon={<Clock className="h-4 w-4" />}
                label={MULTI_SHIFT_LABEL}
                value={`${summary.multiShiftCount} orang`}
                accent={summary.multiShiftCount > 0}
            />
            <SummaryCard
                icon={<Clock className="h-4 w-4" />}
                label="Total Jam"
                value={`${summary.totalActualHours.toFixed(1)}j`}
            />
            <SummaryCard
                icon={<Clock className="h-4 w-4" />}
                label="Total OT"
                value={`${summary.totalOvertimeHours.toFixed(1)}j`}
                accent={summary.totalOvertimeHours > 0}
            />
        </div>
    );
}
