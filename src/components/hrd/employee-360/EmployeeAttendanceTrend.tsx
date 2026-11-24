'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Bar,
    BarChart,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getEmployeeAttendanceTrend } from '@/actions/hrd/attendance-employee';
import type { EmployeeMonthlyTrendPoint } from '@/services/hrd/attendance-day-outcomes';
import { attendanceStatusLabel } from '@/lib/hrd/attendance-status-label';

interface Props {
    employeeId: string;
}

export function EmployeeAttendanceTrend({ employeeId }: Props) {
    const [points, setPoints] = useState<EmployeeMonthlyTrendPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadFailed(false);
        try {
            const res = await getEmployeeAttendanceTrend(employeeId, 6);
            if (!res.success || !res.data) {
                setPoints([]);
                setLoadFailed(true);
            } else {
                setPoints(res.data.points);
            }
        } catch {
            setPoints([]);
            setLoadFailed(true);
        } finally {
            setLoading(false);
        }
    }, [employeeId]);

    useEffect(() => {
        load();
    }, [load]);

    const hasActivity = points.some(
        (p) => p.presentDays + p.leaveDays + p.absentDays > 0,
    );

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    <div>
                        <CardTitle className="text-base">
                            Tren Kehadiran 6 Bulan Terakhir
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Ringkasan hari kerja per bulan (Tepat waktu +{' '}
                            {attendanceStatusLabel('LATE')} ={' '}
                            {attendanceStatusLabel('PRESENT')})
                        </p>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                        Memuat tren…
                    </p>
                ) : loadFailed ? (
                    <div className="space-y-2 py-8 text-center">
                        <p className="text-xs text-destructive">
                            Gagal memuat tren kehadiran. Coba lagi.
                        </p>
                        <Button variant="outline" size="sm" onClick={load}>
                            Coba lagi
                        </Button>
                    </div>
                ) : !hasActivity ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                        Belum ada catatan kehadiran dalam 6 bulan terakhir.
                    </p>
                ) : (
                    <div className="h-[240px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={points}>
                                <XAxis
                                    dataKey="label"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) {
                                            return null;
                                        }
                                        const row = payload[0]
                                            .payload as EmployeeMonthlyTrendPoint;
                                        return (
                                            <div className="rounded-lg border bg-background p-2.5 text-xs shadow-sm space-y-1">
                                                <p className="font-semibold">
                                                    {row.label} ({row.workingDays}{' '}
                                                    hari kerja)
                                                </p>
                                                <p>
                                                    {attendanceStatusLabel(
                                                        'PRESENT',
                                                    )}
                                                    : {row.presentDays} (Tepat:{' '}
                                                    {row.onTimeDays},{' '}
                                                    {attendanceStatusLabel(
                                                        'LATE',
                                                    )}
                                                    : {row.lateDays})
                                                </p>
                                                <p>
                                                    {attendanceStatusLabel(
                                                        'ON_LEAVE',
                                                    )}
                                                    : {row.leaveDays}
                                                </p>
                                                <p>
                                                    {attendanceStatusLabel(
                                                        'ABSENT',
                                                    )}
                                                    : {row.absentDays}
                                                </p>
                                                <p className="text-muted-foreground">
                                                    Tanpa catatan:{' '}
                                                    {row.missingDays}
                                                </p>
                                            </div>
                                        );
                                    }}
                                />
                                <Legend />
                                <Bar
                                    dataKey="onTimeDays"
                                    name="Tepat waktu"
                                    stackId="attendance"
                                    fill="#10b981"
                                />
                                <Bar
                                    dataKey="lateDays"
                                    name={attendanceStatusLabel('LATE')}
                                    stackId="attendance"
                                    fill="#f59e0b"
                                />
                                <Bar
                                    dataKey="leaveDays"
                                    name={attendanceStatusLabel('ON_LEAVE')}
                                    stackId="attendance"
                                    fill="#0ea5e9"
                                />
                                <Bar
                                    dataKey="absentDays"
                                    name={attendanceStatusLabel('ABSENT')}
                                    stackId="attendance"
                                    fill="#f43f5e"
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
