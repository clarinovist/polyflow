'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    getAttendanceMonthlySummary,
    getAttendanceWeeklySummary,
} from '@/actions/admin/attendance';
import { startOfWeek, endOfWeek } from '@/services/hrd/week-range';
import { AttendanceDailySummaryCards } from './attendance/AttendanceDailySummaryCards';
import { AttendanceDailyTable } from './attendance/AttendanceDailyTable';
import { AttendanceFilterBar } from './attendance/AttendanceFilterBar';
import { AttendanceLoadError } from './attendance/AttendanceLoadError';
import { AttendanceMonthlyView } from './attendance/AttendanceMonthlyView';
import { AttendanceNoRecordPanel } from './attendance/AttendanceNoRecordPanel';
import { AttendanceRecapToolbar } from './attendance/AttendanceRecapToolbar';
import { AttendanceStaleSessions } from './attendance/AttendanceStaleSessions';
import { AttendanceSummaryChips } from './attendance/AttendanceSummaryChips';
import { AttendanceWeeklyView } from './attendance/AttendanceWeeklyView';
import { CorrectAttendanceDialog } from './attendance/CorrectAttendanceDialog';
import { SelfieLightbox } from './attendance/SelfieLightbox';
import {
    filterAttendanceRecords,
    summarizeAttendance,
    type StatusFilter,
} from './attendance/attendance-recap-helpers';
import { weekLabel } from './attendance/attendance-format';
import {
    ATTENDANCE_PATH,
    buildExportHref,
    parseViewMode,
    withParam,
    withPeriod,
    withViewMode,
} from './attendance/attendance-recap-nav';
import type {
    AttendanceRecord,
    DailySummary,
    MonthlySummary,
    PhotoPreview,
    ViewMode,
    WeeklySummary,
    WorkShift,
} from './attendance/attendance-recap-types';
import { useCorrectAttendance } from './attendance/useCorrectAttendance';
import { useNoRecordRoster } from './attendance/useNoRecordRoster';
import { useSummaryLoader } from './attendance/useSummaryLoader';

interface Props {
    records: AttendanceRecord[];
    summary: DailySummary | null;
    shifts: WorkShift[];
    currentDate: string;
    currentShift?: string;
    overtimeOnly: boolean;
    /** Filter status awal dari URL (?status=...). */
    initialStatus?: StatusFilter;
    /** Pesan galat bila daftar absensi gagal dimuat di server. */
    loadError?: string | null;
}

export function AttendanceRecap({
    records,
    summary,
    shifts,
    currentDate,
    currentShift,
    overtimeOnly,
    initialStatus = 'all',
    loadError = null,
}: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const correction = useCorrectAttendance(() => router.refresh());
    const [photoPreview, setPhotoPreview] = useState<PhotoPreview | null>(null);

    const modeParam = searchParams.get('mode');
    const [viewMode, setViewMode] = useState<ViewMode>(parseViewMode(modeParam));

    const currentYear = Number(
        searchParams.get('year') || currentDate.slice(0, 4),
    );
    const currentMonth = Number(
        searchParams.get('month') || currentDate.slice(5, 7),
    );

    const monthly = useSummaryLoader<MonthlySummary>('Gagal memuat rekap bulanan');
    const weekly = useSummaryLoader<WeeklySummary>('Gagal memuat rekap mingguan');
    const { data: monthlyData, loading: monthlyLoading } = monthly;
    const { data: weeklyData, loading: weeklyLoading } = weekly;

    const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
    const [query, setQuery] = useState('');
    const roster = useNoRecordRoster(currentDate, viewMode === 'daily');
    const rosterData = roster.state.status === 'ready' ? roster.state.data : null;
    const visibleRecords = useMemo(
        () => filterAttendanceRecords(records, statusFilter, query),
        [records, statusFilter, query],
    );
    const summaryCounts = useMemo(
        () => summarizeAttendance(records, rosterData?.employees.length ?? null),
        [records, rosterData],
    );

    const weekBounds = useMemo(() => {
        const base = new Date(currentDate);
        return { start: startOfWeek(base), end: endOfWeek(base) };
    }, [currentDate]);

    const pushParams = (sp: URLSearchParams) =>
        router.push(`${ATTENDANCE_PATH}?${sp.toString()}`);

    const updateParam = (key: string, value: string | null) =>
        pushParams(withParam(searchParams, key, value));

    const switchMode = (mode: ViewMode) => {
        setViewMode(mode);
        pushParams(withViewMode(searchParams, mode, currentYear, currentMonth));
    };

    // `load` stabil (useCallback), jadi pemuat di bawah tidak memicu muat ulang.
    const { load: runMonthlyLoad } = monthly;
    const { load: runWeeklyLoad } = weekly;

    const loadMonthly = useCallback(
        (year: number, month: number) =>
            runMonthlyLoad(() => getAttendanceMonthlySummary(year, month)),
        [runMonthlyLoad],
    );

    const loadWeekly = useCallback(
        (dateStr: string) => {
            const base = new Date(dateStr);
            return runWeeklyLoad(() =>
                getAttendanceWeeklySummary(
                    startOfWeek(base).toISOString(),
                    endOfWeek(base).toISOString(),
                ),
            );
        },
        [runWeeklyLoad],
    );

    useEffect(() => {
        if (viewMode === 'monthly') {
            loadMonthly(currentYear, currentMonth);
        } else if (viewMode === 'weekly') {
            loadWeekly(currentDate);
        }
    }, [viewMode, currentYear, currentMonth, currentDate, loadMonthly, loadWeekly]);

    const exportHref = buildExportHref({
        viewMode,
        year: currentYear,
        month: currentMonth,
        date: currentDate,
        shift: currentShift,
        overtimeOnly,
    });

    return (
        <div className="space-y-4">
            <AttendanceRecapToolbar
                viewMode={viewMode}
                currentDate={currentDate}
                currentShift={currentShift}
                overtimeOnly={overtimeOnly}
                shifts={shifts}
                year={currentYear}
                month={currentMonth}
                weekRangeLabel={weekLabel(weekBounds.start, weekBounds.end)}
                exportHref={exportHref}
                onSwitchMode={switchMode}
                onParamChange={updateParam}
                onMonthChange={(v) =>
                    pushParams(
                        withPeriod(
                            searchParams,
                            ['month', v],
                            ['year', String(currentYear)],
                        ),
                    )
                }
                onYearChange={(v) =>
                    pushParams(
                        withPeriod(
                            searchParams,
                            ['year', v],
                            ['month', String(currentMonth)],
                        ),
                    )
                }
            />

            {viewMode === 'monthly' && (
                <AttendanceMonthlyView
                    data={monthlyData}
                    loading={monthlyLoading}
                    error={monthly.error}
                    year={currentYear}
                    month={currentMonth}
                    onRetry={() => loadMonthly(currentYear, currentMonth)}
                />
            )}

            {viewMode === 'weekly' && (
                <AttendanceWeeklyView
                    data={weeklyData}
                    loading={weeklyLoading}
                    error={weekly.error}
                    rangeLabel={weekLabel(weekBounds.start, weekBounds.end)}
                    onRetry={() => loadWeekly(currentDate)}
                />
            )}

            {/* Ringkasan chip + filter (daily only) */}
            {viewMode === 'daily' && loadError && (
                <AttendanceLoadError
                    message={loadError}
                    onRetry={() => router.refresh()}
                />
            )}
            {viewMode === 'daily' && !loadError && (
                <div className="space-y-3">
                    <AttendanceSummaryChips
                        counts={summaryCounts}
                        active={statusFilter}
                        isNonWorkingDay={rosterData?.isNonWorkingDay ?? false}
                        onSelect={setStatusFilter}
                    />
                    <AttendanceFilterBar
                        status={statusFilter}
                        query={query}
                        onStatusChange={setStatusFilter}
                        onQueryChange={setQuery}
                    />
                </div>
            )}
            {viewMode === 'daily' && !loadError && statusFilter === 'norecord' && (
                <AttendanceNoRecordPanel
                    state={roster.state}
                    workDate={currentDate}
                    shifts={shifts}
                    query={query}
                    onRetry={roster.reload}
                    onMarked={() => {
                        roster.reload();
                        router.refresh();
                    }}
                />
            )}

            {viewMode === 'daily' && !loadError && statusFilter === 'stale' && (
                <AttendanceStaleSessions
                    query={query}
                    onCorrected={() => router.refresh()}
                />
            )}

            {viewMode === 'daily' && !loadError && summary && (
                <AttendanceDailySummaryCards summary={summary} />
            )}

            {viewMode === 'daily' &&
                !loadError &&
                statusFilter !== 'norecord' &&
                statusFilter !== 'stale' && (
                    <AttendanceDailyTable
                        records={visibleRecords}
                        totalCount={records.length}
                        actionsDisabled={correction.loading}
                        onPreview={setPhotoPreview}
                        onCorrect={correction.open}
                    />
                )}

            <SelfieLightbox
                preview={photoPreview}
                onClose={() => setPhotoPreview(null)}
            />

            <CorrectAttendanceDialog
                record={correction.correcting}
                form={correction.form}
                loading={correction.loading}
                onFieldChange={correction.setField}
                onClose={correction.close}
                onSubmit={correction.submit}
            />
        </div>
    );
}
