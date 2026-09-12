'use client';

import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import {
    UserCheck,
    CalendarDays,
    HandCoins,
    CalendarRange,
    Shield,
    AlertTriangle,
    ArrowRight,
    Wallet,
    Clock,
    UserX,
} from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import type { HrdShiftBoard } from '@/actions/hrd/dashboard-kpis';

type BoardData = HrdShiftBoard;

interface HrdShiftBoardProps {
    data: BoardData;
}

/** Full IDR for tooltips / title attributes. */
function formatIdr(n: number) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(n);
}

/**
 * Compact IDR for narrow KPI cards so "Rp 1.500.000" does not overflow.
 * e.g. 1_500_000 → "Rp 1,5 jt", 12_000 → "Rp 12 rb"
 */
function formatIdrCompact(n: number) {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000_000) {
        const v = abs / 1_000_000_000;
        const s = v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '');
        return `${sign}Rp ${s.replace('.', ',')} M`;
    }
    if (abs >= 1_000_000) {
        const v = abs / 1_000_000;
        const s = v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '');
        return `${sign}Rp ${s.replace('.', ',')} jt`;
    }
    if (abs >= 1_000) {
        const v = abs / 1_000;
        const s = v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '');
        return `${sign}Rp ${s.replace('.', ',')} rb`;
    }
    return formatIdr(n);
}

function StatCard({
    label,
    count,
    icon: Icon,
    action,
    colorClass,
    subtitle,
    valueTitle,
}: {
    label: string;
    count: string | number;
    icon: ComponentType<{ className?: string }>;
    action?: { href: string; label: string };
    colorClass: string;
    subtitle?: string;
    /** Full value for native tooltip when count is compacted */
    valueTitle?: string;
}) {
    const card = (
        <Card
            className={cn(
                'h-full min-w-0 overflow-hidden',
                action &&
                    'hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group',
            )}
        >
            <CardContent className="p-3 sm:p-4 flex flex-col gap-2.5 sm:gap-3 min-w-0 h-full">
                <div
                    className={cn(
                        'p-2 rounded-lg w-fit shrink-0',
                        colorClass,
                    )}
                >
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 flex flex-col">
                    <p
                        className="text-lg sm:text-xl font-bold tabular-nums leading-tight tracking-tight break-words"
                        title={valueTitle ?? String(count)}
                    >
                        {count}
                    </p>
                    <p className="text-sm font-medium text-muted-foreground mt-1.5 leading-snug">
                        {label}
                    </p>
                    {subtitle && (
                        <p
                            className="text-xs text-muted-foreground mt-0.5 truncate"
                            title={subtitle}
                        >
                            {subtitle}
                        </p>
                    )}
                    {action && (
                        <p className="text-xs text-primary font-semibold inline-flex items-center gap-1 mt-auto pt-2 group-hover:underline">
                            {action.label}{' '}
                            <ArrowRight className="h-3 w-3 shrink-0" />
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );

    return action ? (
        <Link href={action.href} className="block h-full min-w-0">
            {card}
        </Link>
    ) : (
        card
    );
}

function AttentionSection({
    title,
    icon: Icon,
    items,
    emptyMessage,
    renderItem,
}: {
    title: string;
    icon: ComponentType<{ className?: string }>;
    items: Array<Record<string, unknown>>;
    emptyMessage: string;
    renderItem: (item: Record<string, unknown>) => ReactNode;
}) {
    return (
        <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                <Icon className="h-4 w-4 text-amber-500" />
                {title}
            </h3>
            {items.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">
                    {emptyMessage}
                </p>
            ) : (
                <div className="space-y-1">
                    {items.map((item, idx) => (
                        <div
                            key={String(item.id ?? idx)}
                            className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors min-h-[44px]"
                        >
                            {renderItem(item)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function HrdShiftBoardComponent({ data }: HrdShiftBoardProps) {
    const { counts, attention } = data;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Hari Ini</h1>
                <p className="text-muted-foreground">
                    Ringkasan sif dan keputusan yang perlu ditindaklanjuti.
                </p>
            </div>

            {/* KPI Cards — min-w-0 so long values (kasbon IDR) do not overflow columns */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <StatCard
                    label="Hadir hari ini"
                    count={counts.presentToday}
                    icon={UserCheck}
                    colorClass="bg-emerald-500/10 text-emerald-600"
                    subtitle={data.today}
                />
                <StatCard
                    label="Cuti menunggu persetujuan"
                    count={counts.leavePending}
                    icon={CalendarDays}
                    action={
                        counts.leavePending > 0
                            ? {
                                  href: '/hrd/leave?status=PENDING',
                                  label: 'Proses',
                              }
                            : undefined
                    }
                    colorClass="bg-amber-500/10 text-amber-600"
                />
                <StatCard
                    label="Sisa kasbon"
                    count={formatIdrCompact(counts.loanOutstanding)}
                    valueTitle={formatIdr(counts.loanOutstanding)}
                    icon={HandCoins}
                    action={
                        counts.loanOutstanding > 0
                            ? { href: '/hrd/loans', label: 'Lihat' }
                            : undefined
                    }
                    colorClass="bg-rose-500/10 text-rose-600"
                    subtitle={`${counts.loanActiveCount} aktif`}
                />
                <StatCard
                    label="Periode terbuka"
                    count={counts.openPayrollPeriods}
                    icon={CalendarRange}
                    action={
                        counts.openPayrollPeriods > 0
                            ? { href: '/hrd/payroll-monthly', label: 'Proses' }
                            : undefined
                    }
                    colorClass="bg-blue-500/10 text-blue-600"
                    subtitle={
                        counts.periodsNeedGenerate > 0
                            ? `${counts.periodsNeedGenerate} perlu dibuatkan slip`
                            : undefined
                    }
                />
                <StatCard
                    label="Peserta BPJS"
                    count={counts.bpjsParticipants}
                    icon={Shield}
                    colorClass="bg-purple-500/10 text-purple-600"
                />
                <StatCard
                    label="Peringatan HR belum dibaca"
                    count={counts.hrAlertsUnread}
                    icon={AlertTriangle}
                    action={
                        counts.hrAlertsUnread > 0
                            ? {
                                  href: '/hrd/alerts?unread=true',
                                  label: 'Tinjau',
                              }
                            : undefined
                    }
                    colorClass="bg-orange-500/10 text-orange-600"
                />
            </div>

            {/* Attention Section */}
            <Card>
                <CardContent className="p-4 space-y-4">
                    <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">
                        Butuh Perhatian
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                        <AttentionSection
                            title="Cuti/izin menunggu"
                            icon={CalendarDays}
                            items={attention.pendingLeaves.map((l) => ({
                                id: l.id,
                                employeeName: l.employeeName,
                                type: l.type,
                                daysPending: l.daysPending,
                            }))}
                            emptyMessage="Tidak ada cuti yang menunggu persetujuan"
                            renderItem={(item) => (
                                <Link
                                    href={`/hrd/leave?status=PENDING&requestId=${String(item.id)}`}
                                    className="flex-1 flex items-center justify-between group/link"
                                >
                                    <div>
                                        <span className="text-sm font-medium">
                                            {String(item.employeeName)}
                                        </span>
                                        <span className="text-xs text-muted-foreground ml-2">
                                            {String(item.type)}
                                        </span>
                                        {typeof item.daysPending === 'number' &&
                                            item.daysPending > 0 && (
                                                <span className="text-xs text-amber-600 ml-2">
                                                    {item.daysPending} hari
                                                </span>
                                            )}
                                    </div>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
                                </Link>
                            )}
                        />

                        <AttentionSection
                            title="Peringatan kontrak/masa percobaan"
                            icon={AlertTriangle}
                            items={attention.hrAlerts.map((a) => ({
                                id: a.id,
                                title: a.title,
                                type: a.type,
                            }))}
                            emptyMessage="Tidak ada peringatan baru"
                            renderItem={(item) => (
                                <Link
                                    href={`/hrd/alerts?unread=true#alert-${String(item.id)}`}
                                    className="flex-1 flex items-center justify-between group/link"
                                >
                                    <div>
                                        <span className="text-sm font-medium line-clamp-1">
                                            {String(item.title)}
                                        </span>
                                        <span className="text-xs text-muted-foreground ml-2">
                                            {String(item.type) ===
                                            'HRD_PROBATION_ENDING'
                                                ? 'Masa percobaan'
                                                : 'Kontrak'}
                                        </span>
                                    </div>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
                                </Link>
                            )}
                        />

                        <AttentionSection
                            title="Periode gaji terbuka"
                            icon={Wallet}
                            items={attention.openPeriods.map((p) => ({
                                id: p.id,
                                label: p.label,
                                status: p.status,
                                needsGenerate: p.needsGenerate,
                            }))}
                            emptyMessage="Semua periode sudah ditutup"
                            renderItem={(item) => (
                                <Link
                                    href={`/hrd/payroll-monthly/${String(item.id)}`}
                                    className="flex-1 flex items-center justify-between group/link"
                                >
                                    <div>
                                        <span className="text-sm font-medium">
                                            {String(item.label)}
                                        </span>
                                        {Boolean(item.needsGenerate) && (
                                            <span className="text-xs text-amber-600 ml-2 font-medium">
                                                Perlu dibuatkan slip
                                            </span>
                                        )}
                                    </div>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
                                </Link>
                            )}
                        />

                        <AttentionSection
                            title="Tanpa kabar kemarin"
                            icon={UserX}
                            items={attention.absentYesterday.map((e) => ({
                                id: e.employeeId,
                                employeeName: e.employeeName,
                                employeeCode: e.employeeCode,
                            }))}
                            emptyMessage="Semua hadir kemarin"
                            renderItem={(item) => (
                                <Link
                                    href={`/dashboard/employees/${String(item.id)}?tab=attendance`}
                                    className="flex-1 flex items-center justify-between group/link"
                                >
                                    <div>
                                        <span className="text-sm font-medium">
                                            {String(item.employeeName)}
                                        </span>
                                        <span className="text-xs text-muted-foreground ml-2">
                                            {String(item.employeeCode)}
                                        </span>
                                    </div>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
                                </Link>
                            )}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Dual Payroll Guidance */}
            <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
                <CardContent className="p-4">
                    <h2 className="text-sm font-bold text-foreground uppercase tracking-wide mb-2">
                        Panduan Gaji
                    </h2>
                    <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-2">
                            <Wallet className="h-4 w-4 text-amber-600" />
                            <span className="text-muted-foreground">
                                Borongan/harian →
                            </span>
                            <Link
                                href="/hrd/payroll"
                                className="font-semibold text-primary hover:underline"
                            >
                                Gaji Mingguan
                            </Link>
                        </div>
                        <div className="flex items-center gap-2">
                            <CalendarRange className="h-4 w-4 text-blue-600" />
                            <span className="text-muted-foreground">
                                Bulanan/kantor →
                            </span>
                            <Link
                                href="/hrd/payroll-monthly"
                                className="font-semibold text-primary hover:underline"
                            >
                                Gaji Bulanan + BPJS
                            </Link>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Aksi frekuensi tinggi, bukan pengulangan menu portal. */}
            <Card>
                <CardContent className="p-4">
                    <h2 className="text-sm font-bold text-foreground uppercase tracking-wide mb-3">
                        Aksi cepat
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href="/hrd/attendance"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
                        >
                            <Clock className="h-4 w-4" />
                            Rekap Absensi
                        </Link>
                        <Link
                            href="/hrd/payroll"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
                        >
                            <Wallet className="h-4 w-4" />
                            Gaji Mingguan
                        </Link>
                        <Link
                            href="/hrd/payroll-monthly"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
                        >
                            <CalendarRange className="h-4 w-4" />
                            Gaji Bulanan
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
