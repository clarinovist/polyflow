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
import { formatIdr } from './attendance-format';
import type { WeeklySummary } from './attendance-recap-types';
import { AttendanceLoadError } from './AttendanceLoadError';
import { RecapMessageCard, SummaryCard } from './RecapShared';

interface Props {
    data: WeeklySummary[];
    loading: boolean;
    error: string | null;
    /** Label rentang minggu, mis. "09 Nov 2026 – 15 Nov 2026". */
    rangeLabel: string;
    onRetry: () => void;
}

/** Rekap mingguan per karyawan: memuat / galat / kosong / tabel + kartu total. */
export function AttendanceWeeklyView({
    data,
    loading,
    error,
    rangeLabel,
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
                    Tidak ada data absensi untuk minggu {rangeLabel}
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
                        <SummaryCard
                            icon={<Clock className="h-4 w-4" />}
                            label="Est. Upah"
                            value={formatIdr(
                                data.reduce(
                                    (s, r) => s + r.totalEarnings,
                                    0,
                                ),
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
                                    <TableHead className="font-semibold text-muted-foreground text-right">
                                        Jam Aktual
                                    </TableHead>
                                    <TableHead className="font-semibold text-muted-foreground text-right">
                                        Jam OT
                                    </TableHead>
                                    <TableHead className="font-semibold text-muted-foreground text-right">
                                        Harian
                                    </TableHead>
                                    <TableHead className="font-semibold text-muted-foreground text-right">
                                        OT Rp
                                    </TableHead>
                                    <TableHead className="font-semibold text-muted-foreground text-right">
                                        Total
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
                                        <TableCell className="text-right">
                                            {formatIdr(
                                                r.totalDailyEarnings,
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {formatIdr(
                                                r.totalOvertimeEarnings,
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">
                                            {formatIdr(r.totalEarnings)}
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
