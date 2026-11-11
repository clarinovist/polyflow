import React from 'react';
import { DashboardSectionState } from '@/components/dashboard/DashboardMetricPrimitives';
import { MobileInsightCard } from '@/components/mobile';
import type { MobileInsight } from '@/lib/mobile/types';
import { attendanceStatusLabel } from '@/lib/hrd/attendance-status-label';
import type { HrdDashboardAggregate } from '@/services/hrd/hrd-dashboard-service';
import { ATTENDANCE_BASE_PATH } from './attendance-filters';

type Health = HrdDashboardAggregate['health'];

const HOLIDAY_LABEL = 'Hari libur (Minggu)';
const DETAIL_LABEL = 'Detail';
const EMPLOYEE_UNIT = 'karyawan';

function formatWorkDate(workDate: string): string {
    return new Date(`${workDate}T00:00:00.000Z`).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

function statusHref(status: string): string {
    return `${ATTENDANCE_BASE_PATH}?status=${status}`;
}

type AttendanceData = Extract<
    Health['attendanceToday'],
    { status: 'AVAILABLE' }
>['data'];

function statusCard(
    key: string,
    status: 'PRESENT' | 'LATE' | 'ON_LEAVE' | 'ABSENT' | 'NO_RECORD',
    value: number,
    severity: MobileInsight['severity'],
): MobileInsight {
    return {
        key,
        label: attendanceStatusLabel(status),
        value,
        unit: EMPLOYEE_UNIT,
        severity,
        href: statusHref(status),
        actionLabel: DETAIL_LABEL,
    };
}

function buildAttendanceInsights(data: AttendanceData): MobileInsight[] {
    const insights: MobileInsight[] = [
        statusCard('present', 'PRESENT', data.present, 'INFO'),
        statusCard('late', 'LATE', data.late, data.late > 0 ? 'WARNING' : 'INFO'),
        statusCard('on-leave', 'ON_LEAVE', data.onLeave, 'INFO'),
        statusCard('absent', 'ABSENT', data.absent, data.absent > 0 ? 'WARNING' : 'INFO'),
        data.isNonWorkingDay
            ? {
                  key: 'no-record',
                  label: HOLIDAY_LABEL,
                  value: '-',
                  severity: 'INFO',
              }
            : statusCard(
                  'no-record',
                  'NO_RECORD',
                  data.noRecord,
                  data.noRecord > 0 ? 'WARNING' : 'INFO',
              ),
    ];
    if (data.outsideRadius > 0)
        insights.push({
            key: 'outside-radius',
            label: 'Di luar radius',
            value: data.outsideRadius,
            unit: EMPLOYEE_UNIT,
            severity: 'WARNING',
        });
    if (data.noSelfie > 0)
        insights.push({
            key: 'no-selfie',
            label: 'Tanpa selfie',
            value: data.noSelfie,
            unit: EMPLOYEE_UNIT,
            severity: 'WARNING',
        });
    insights.push({
        key: 'overtime',
        label: 'Lembur dari absensi hadir',
        value: data.overtimeHours.toLocaleString('id-ID', {
            maximumFractionDigits: 2,
        }),
        unit: 'jam hari ini',
        severity: 'INFO',
    });
    return insights;
}

export function HrdAttendanceCards({
    attendance,
    workDate,
}: {
    attendance: Health['attendanceToday'];
    workDate: string;
}) {
    if (attendance.status !== 'AVAILABLE')
        return (
            <DashboardSectionState
                state="UNAVAILABLE"
                title="Absensi hari ini tidak tersedia"
                description="Gagal memuat bukan berarti nol; coba muat ulang."
            />
        );
    return (
        <section aria-label="Absensi hari ini" className="space-y-2">
            <p className="text-xs text-muted-foreground">
                Absensi {formatWorkDate(workDate)}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {buildAttendanceInsights(attendance.data).map((insight) => (
                    <MobileInsightCard key={insight.key} insight={insight} />
                ))}
            </div>
        </section>
    );
}

export function HrdFollowUpCard({
    followUp,
}: {
    followUp: Health['employmentFollowUp'];
}) {
    if (followUp.status !== 'AVAILABLE')
        return (
            <DashboardSectionState
                state="UNAVAILABLE"
                title="Tindak lanjut kepegawaian tidak tersedia"
            />
        );
    const { total, probation, contract } = followUp.data;
    return (
        <MobileInsightCard
            insight={{
                key: 'employment-follow-up',
                label: 'Kontrak/Masa Percobaan ≤30 Hari',
                value: total,
                unit: `${probation} masa percobaan · ${contract} kontrak`,
                severity: total > 0 ? 'WARNING' : 'INFO',
            }}
        />
    );
}
