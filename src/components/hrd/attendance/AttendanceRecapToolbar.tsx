'use client';

import Link from 'next/link';
import { ArrowUpDown, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { MONTH_NAMES } from './attendance-format';
import { buildYearOptions, currentWibYear } from './attendance-recap-helpers';
import type { ViewMode, WorkShift } from './attendance-recap-types';

const VIEW_MODES: readonly ViewMode[] = ['daily', 'weekly', 'monthly'];
const VIEW_MODE_LABELS: Record<ViewMode, string> = {
    daily: 'Harian',
    weekly: 'Mingguan',
    monthly: 'Bulanan',
};
const ALL_SHIFTS_VALUE = '__all__';
const FIELD_LABEL_CLASS = 'text-sm font-medium text-muted-foreground';

interface Props {
    viewMode: ViewMode;
    currentDate: string;
    currentShift?: string;
    overtimeOnly: boolean;
    shifts: WorkShift[];
    year: number;
    month: number;
    /** Label rentang minggu untuk mode mingguan. */
    weekRangeLabel: string;
    exportHref: string;
    onSwitchMode: (mode: ViewMode) => void;
    /** Ubah satu query param (null = hapus) lalu navigasi. */
    onParamChange: (key: string, value: string | null) => void;
    onMonthChange: (month: string) => void;
    onYearChange: (year: string) => void;
}

function ViewModeTabs({
    viewMode,
    onSwitchMode,
}: Pick<Props, 'viewMode' | 'onSwitchMode'>) {
    return (
        <div className="flex items-center bg-muted rounded-lg p-0.5">
            {VIEW_MODES.map((m) => (
                <button
                    key={m}
                    type="button"
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        viewMode === m
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => onSwitchMode(m)}
                >
                    {VIEW_MODE_LABELS[m]}
                </button>
            ))}
        </div>
    );
}

function DateField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <>
            <label className={FIELD_LABEL_CLASS}>{label}</label>
            <Input
                type="date"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-[180px]"
            />
        </>
    );
}

function DailyControls({
    currentDate,
    currentShift,
    overtimeOnly,
    shifts,
    onParamChange,
}: Pick<
    Props,
    | 'currentDate'
    | 'currentShift'
    | 'overtimeOnly'
    | 'shifts'
    | 'onParamChange'
>) {
    return (
        <>
            <div className="flex items-center gap-2">
                <DateField
                    label="Tanggal"
                    value={currentDate}
                    onChange={(v) => onParamChange('date', v)}
                />
            </div>
            <div className="flex items-center gap-2">
                <label className={FIELD_LABEL_CLASS}>Shift</label>
                <Select
                    value={currentShift || ALL_SHIFTS_VALUE}
                    onValueChange={(v) =>
                        onParamChange('shift', v === ALL_SHIFTS_VALUE ? null : v)
                    }
                >
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Semua shift" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL_SHIFTS_VALUE}>Semua shift</SelectItem>
                        {shifts
                            .filter((s) => s.status === 'ACTIVE')
                            .map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                    {s.name}
                                </SelectItem>
                            ))}
                    </SelectContent>
                </Select>
            </div>
            <Button
                variant={overtimeOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => onParamChange('ot', overtimeOnly ? null : '1')}
                className="gap-1"
            >
                <ArrowUpDown className="h-3.5 w-3.5" />
                {overtimeOnly ? 'Lembur ON' : 'Filter Lembur'}
            </Button>
        </>
    );
}

function WeeklyControls({
    currentDate,
    weekRangeLabel,
    onParamChange,
}: Pick<Props, 'currentDate' | 'weekRangeLabel' | 'onParamChange'>) {
    return (
        <div className="flex items-center gap-2">
            <DateField
                label="Minggu"
                value={currentDate}
                onChange={(v) => onParamChange('date', v)}
            />
            <span className="text-xs text-muted-foreground">{weekRangeLabel}</span>
            <Link
                href={`/hrd/payroll?date=${currentDate}`}
                className="text-xs text-muted-foreground hover:underline ml-1"
            >
                → Gaji Mingguan
            </Link>
        </div>
    );
}

function MonthlyControls({
    year,
    month,
    onMonthChange,
    onYearChange,
}: Pick<Props, 'year' | 'month' | 'onMonthChange' | 'onYearChange'>) {
    return (
        <div className="flex items-center gap-2">
            <label className={FIELD_LABEL_CLASS}>Periode</label>
            <Select value={String(month)} onValueChange={onMonthChange}>
                <SelectTrigger className="w-[140px]">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {MONTH_NAMES.map((name, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                            {name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={onYearChange}>
                <SelectTrigger className="w-[100px]">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {buildYearOptions(year, currentWibYear()).map((y) => (
                        <SelectItem key={y} value={String(y)}>
                            {y}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Link
                href="/hrd/payroll-monthly"
                className="text-xs text-muted-foreground hover:underline ml-2"
            >
                → Gaji Bulanan
            </Link>
        </div>
    );
}

/** Bilah kontrol rekap absensi: tab mode, kontrol per mode, dan tautan CSV. */
export function AttendanceRecapToolbar(props: Props) {
    const { viewMode } = props;
    return (
        <div className="flex flex-wrap gap-3 items-center bg-card p-4 rounded-xl border">
            <ViewModeTabs viewMode={viewMode} onSwitchMode={props.onSwitchMode} />
            {viewMode === 'daily' && <DailyControls {...props} />}
            {viewMode === 'weekly' && <WeeklyControls {...props} />}
            {viewMode === 'monthly' && <MonthlyControls {...props} />}
            <Button asChild size="sm" variant="outline" className="ml-auto gap-1">
                <a href={props.exportHref}>
                    <Download className="h-3.5 w-3.5" /> CSV
                </a>
            </Button>
        </div>
    );
}
