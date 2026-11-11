'use client';

import { Clock, Users } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { attendanceStatusLabel } from '@/lib/hrd/attendance-status-label';
import { MONTH_NAMES } from './attendance-format';
import type { MonthlySummary } from './attendance-recap-types';
import { MULTI_SHIFT_LABEL } from './attendance-recap-helpers';
import { AttendanceLoadError } from './AttendanceLoadError';
import { RecapMessageCard, SummaryCard } from './RecapShared';

interface Props {
    data: MonthlySummary[];
    loading: boolean;
    error: string | null;
    year: number;
    month: number;
    onRetry: () => void;
}

/** Rekap bulanan per karyawan: memuat / galat / kosong / tabel + kartu total. */
export function AttendanceMonthlyView({
    data,
    loading,
    error,
    year,
    month,
    onRetry,
}: Props) {
    return (
        <div className="space-y-4">
            {loading ? (
                <RecapMessageCard>Memuat…</RecapMessageCard>
            ) : error ? (
                <AttendanceLoadError
                    message={error}
                    onRetry={onRetry}
                />
            ) : data.length === 0 ? (
                <RecapMessageCard>
                    Tidak ada data absensi untuk{' '}
                    {MONTH_NAMES[month - 1]} {year}
                </RecapMessageCard>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <SummaryCard
                            icon={<Users className="h-4 w-4" />}
                            label="Karyawan"
                            value={`${data.length} orang`}
                        />
                        <SummaryCard
                            icon={<Clock className="h-4 w-4" />}
                            label="Total Hadir"
                            value={`${data.reduce((s, r) => s + r.daysPresent, 0)} hari`}
                        />
                        <SummaryCard
                            icon={<Clock className="h-4 w-4" />}
                            label={`Total ${attendanceStatusLabel('ABSENT')}`}
                            value={`${data.reduce((s, r) => s + r.daysAbsent, 0)} hari`}
                            accent={data.some(
                                (r) => r.daysAbsent > 0,
                            )}
                        />
                        <SummaryCard
                            icon={<Clock className="h-4 w-4" />}
                            label="Total Jam"
                            value={`${data.reduce((s, r) => s + r.totalActualHours, 0).toFixed(1)}j`}
                        />
                        <SummaryCard
                            icon={<Clock className="h-4 w-4" />}
                            label="Total OT"
                            value={`${data.reduce((s, r) => s + r.totalOvertimeHours, 0).toFixed(1)}j`}
                            accent={data.some(
                                (r) => r.totalOvertimeHours > 0,
                            )}
                        />
                    </div>
                    <div className="bg-card rounded-xl border overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead className="font-semibold text-muted-foreground">
                                        Kode
                                    </TableHead>
                                    <TableHead className="font-semibold text-muted-foreground">
                                        Nama
                                    </TableHead>
                                    <TableHead className="font-semibold text-muted-foreground text-center">
                                        Hadir
                                    </TableHead>
                                    <TableHead className="font-semibold text-muted-foreground text-center">
                                        {attendanceStatusLabel('ABSENT')}
                                    </TableHead>
                                    <TableHead className="font-semibold text-muted-foreground text-center">
                                        {attendanceStatusLabel('ON_LEAVE')}
                                    </TableHead>
                                    <TableHead className="font-semibold text-muted-foreground text-center">
                                        {MULTI_SHIFT_LABEL}
                                    </TableHead>
                                    <TableHead className="font-semibold text-muted-foreground text-right">
                                        Jam Aktual
                                    </TableHead>
                                    <TableHead className="font-semibold text-muted-foreground text-right">
                                        Jam OT
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((r) => (
                                    <TableRow
                                        key={r.employeeId}
                                        className="hover:bg-muted/50"
                                    >
                                        <TableCell className="font-medium">
                                            {r.employeeCode}
                                        </TableCell>
                                        <TableCell>
                                            {r.employeeName}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {r.daysPresent}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {r.daysAbsent > 0 ? (
                                                <Badge
                                                    variant="destructive"
                                                    className="text-xs"
                                                >
                                                    {r.daysAbsent}
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground">
                                                    0
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {r.daysOnLeave}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {r.multiShiftDays}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {r.totalActualHours.toFixed(
                                                1,
                                            )}
                                            j
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {r.totalOvertimeHours.toFixed(
                                                1,
                                            )}
                                            j
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}
        </div>
    );
}
