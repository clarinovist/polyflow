'use client';

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    ClipboardList,
    UserCheck,
    Wrench,
    LayoutDashboard,
    LogOut,
    CalendarCheck,
} from 'lucide-react';
import { kioskLabels } from '@/lib/labels';
import { KioskOperatorGate } from '@/components/kiosk/KioskOperatorGate';
import { KioskOperatorChip } from '@/components/kiosk/KioskOperatorChip';
import { MyPortalQr } from '@/components/kiosk/MyPortalQr';
import { KioskTodayStrip } from '@/components/kiosk/KioskTodayStrip';
import {
    getOperatorTodaySummary,
    type OperatorTodaySummary,
} from '@/actions/production/production-execution';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils/utils';

interface Employee {
    id: string;
    name: string;
    machineIds?: string[];
    machineNames?: string[];
}

interface KioskHubProps {
    employees: Employee[];
    machines: Array<{ id: string; name: string }>;
    /** Enables the HD / Potong-Plong Proses Khusus tile and direct links. */
    hasProsesKhusus?: boolean;
}

function HubTile({
    href,
    icon,
    iconClass,
    title,
    description,
    badge,
    className,
}: {
    href: string;
    icon: ReactNode;
    iconClass: string;
    title: string;
    description: string;
    badge?: ReactNode;
    className?: string;
}) {
    return (
        <Link href={href} className={cn('block h-full', className)}>
            <div className="group relative h-full bg-card border-2 rounded-2xl p-5 sm:p-6 md:p-8 hover:border-primary hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer min-h-[132px] sm:min-h-[148px] md:min-h-[160px] flex flex-col justify-between">
                <div className="pr-16 sm:pr-20">
                    <div
                        className={cn(
                            'h-12 w-12 sm:h-14 sm:w-14 rounded-xl flex items-center justify-center mb-3 sm:mb-4 transition-colors',
                            iconClass,
                        )}
                    >
                        {icon}
                    </div>
                    <h2 className="text-lg sm:text-xl md:text-2xl font-black uppercase tracking-tight leading-tight">
                        {title}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1 leading-snug">
                        {description}
                    </p>
                </div>
                {badge}
            </div>
        </Link>
    );
}

export function KioskHub({
    employees,
    machines,
    hasProsesKhusus = false,
}: KioskHubProps) {
    const [operatorId, setOperatorId] = useState<string | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [summary, setSummary] = useState<OperatorTodaySummary | null>(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);
    const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

    const fetchSummary = useCallback(async (id: string) => {
        setIsLoadingSummary(true);
        try {
            const res = await getOperatorTodaySummary(id);
            if (res.success && res.data) {
                setSummary(res.data as OperatorTodaySummary);
            } else {
                setSummary(null);
            }
        } catch {
            setSummary(null);
        } finally {
            setIsLoadingSummary(false);
        }
    }, []);

    useEffect(() => {
        const saved = sessionStorage.getItem('kiosk_operator_id');
        if (saved) {
            setOperatorId(saved);
            fetchSummary(saved);
        }
        setIsInitialized(true);
    }, [fetchSummary]);

    const handleOperatorSelect = (id: string) => {
        setOperatorId(id);
        sessionStorage.setItem('kiosk_operator_id', id);
        fetchSummary(id);
    };

    const handleConfirmLogout = () => {
        sessionStorage.removeItem('kiosk_operator_id');
        setOperatorId(null);
        setSummary(null);
        setIsLogoutDialogOpen(false);
    };

    if (!isInitialized) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!operatorId) {
        return (
            <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
                {/* Attendance tile - always visible, no operator needed */}
                <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase mb-1">
                        Kiosk
                    </h1>
                    <p className="text-sm text-muted-foreground font-medium">
                        Pilih menu di bawah ini
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:gap-4">
                    <Link href="/kiosk/attendance" className="block h-full">
                        <div className="group relative h-full bg-card border-2 rounded-2xl p-5 sm:p-6 md:p-8 border-blue-200 hover:border-blue-500 hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer min-h-[132px] sm:min-h-[148px] md:min-h-[160px] flex items-center gap-4 sm:gap-6">
                            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-xl bg-blue-100 dark:bg-blue-900/30 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 flex items-center justify-center transition-colors">
                                <CalendarCheck className="h-7 w-7 sm:h-8 sm:w-8 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tight leading-tight">
                                    Absensi Semua Karyawan
                                </h2>
                                <p className="text-sm text-muted-foreground mt-1 leading-snug">
                                    Clock-in dan clock-out untuk semua karyawan
                                    (bulanan, harian, helper, probation)
                                </p>
                            </div>
                        </div>
                    </Link>
                </div>

                {/* Separator */}
                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground font-semibold">
                            Produksi — pilih operator
                        </span>
                    </div>
                </div>

                <KioskOperatorGate
                    employees={employees}
                    machines={machines}
                    onSelect={handleOperatorSelect}
                />
            </div>
        );
    }

    const currentEmployee = employees.find((e) => e.id === operatorId);
    const machineNames =
        currentEmployee?.machineIds
            ?.map((id) => machines.find((m) => m.id === id)?.name)
            .filter((n): n is string => !!n) || [];
    const myActiveJobs = summary?.activeJobsCount ?? 0;

    return (
        <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
            {/* Operator session bar */}
            <div className="bg-emerald-500/5 p-3 sm:p-4 rounded-xl border-2 border-emerald-500/20 shadow-sm">
                <div className="flex items-start gap-3">
                    <KioskOperatorChip
                        name={currentEmployee?.name || ''}
                        machineNames={machineNames}
                        className="min-w-0 flex-1"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsLogoutDialogOpen(true)}
                        className="shrink-0 h-10 gap-1.5 px-3 border-border/80 text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5"
                        aria-label={kioskLabels.sessionLogout}
                    >
                        <LogOut className="h-4 w-4" />
                        <span className="text-xs font-semibold sm:text-sm">
                            {kioskLabels.sessionLogout}
                        </span>
                    </Button>
                </div>
            </div>

            <KioskTodayStrip
                operatorName={currentEmployee?.name || ''}
                summary={summary}
                isLoading={isLoadingSummary}
            />

            <AlertDialog
                open={isLogoutDialogOpen}
                onOpenChange={setIsLogoutDialogOpen}
            >
                <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Keluar Sesi Operator?
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-3 pt-2 text-sm text-foreground">
                                <p className="text-muted-foreground">
                                    Ringkasan shift hari ini untuk{' '}
                                    <strong>{currentEmployee?.name}</strong>:
                                </p>
                                {summary ? (
                                    <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5 font-medium">
                                        <div className="flex justify-between gap-3">
                                            <span className="text-muted-foreground">
                                                Job dikerjakan:
                                            </span>
                                            <span className="font-bold">
                                                {summary.jobCount} job
                                            </span>
                                        </div>
                                        <div className="flex justify-between gap-3">
                                            <span className="text-muted-foreground">
                                                Hasil bagus:
                                            </span>
                                            <span className="font-bold text-emerald-600">
                                                {summary.goodQty.toLocaleString(
                                                    'id-ID',
                                                )}{' '}
                                                kg
                                            </span>
                                        </div>
                                        <div className="flex justify-between gap-3">
                                            <span className="text-muted-foreground">
                                                Scrap:
                                            </span>
                                            <span className="font-bold text-amber-600">
                                                {summary.scrapQty.toLocaleString(
                                                    'id-ID',
                                                )}{' '}
                                                kg
                                            </span>
                                        </div>
                                        {summary.activeJobsCount > 0 && (
                                            <p className="text-xs text-amber-600 font-semibold pt-1 border-t">
                                                Masih ada{' '}
                                                {summary.activeJobsCount} job
                                                aktif yang belum di-stop.
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        Tidak ada data shift hari ini.
                                    </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Pastikan pekerjaan telah tercatat dengan
                                    benar sebelum menyerahkan tablet ke operator
                                    berikutnya.
                                </p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
                        <AlertDialogCancel className="mt-0">
                            Batal
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmLogout}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            Keluar Sesi
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase mb-1">
                    {kioskLabels.hubTitle}
                </h1>
                <p className="text-sm text-muted-foreground font-medium">
                    {kioskLabels.hubSubtitle}
                </p>
            </div>

            {/* 3 tiles: Status Saya spans full width on tablet. 4 tiles: 2×2. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
                <HubTile
                    href="/kiosk/jobs"
                    title={kioskLabels.tileProduksi}
                    description={kioskLabels.tileProduksiDesc}
                    iconClass="bg-emerald-100 dark:bg-emerald-900/30 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/50"
                    icon={
                        <ClipboardList className="h-6 w-6 sm:h-7 sm:w-7 text-emerald-600" />
                    }
                    badge={
                        !isLoadingSummary && myActiveJobs > 0 ? (
                            <div className="absolute top-4 right-4 bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-sm">
                                {myActiveJobs} {kioskLabels.tileProduksiActive}
                            </div>
                        ) : null
                    }
                />

                <HubTile
                    href="/kiosk/attendance"
                    title={kioskLabels.tileAbsensi}
                    description={kioskLabels.tileAbsensiDesc}
                    iconClass="bg-blue-100 dark:bg-blue-900/30 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50"
                    icon={
                        <UserCheck className="h-6 w-6 sm:h-7 sm:w-7 text-blue-600" />
                    }
                />

                {hasProsesKhusus && (
                    <div className="bg-card border-2 rounded-2xl p-5 sm:p-6 md:p-8 min-h-[132px] sm:min-h-[148px] md:min-h-[160px] flex flex-col justify-between">
                        <div>
                            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-3 sm:mb-4">
                                <Wrench className="h-6 w-6 sm:h-7 sm:w-7 text-purple-600" />
                            </div>
                            <h2 className="text-lg sm:text-xl md:text-2xl font-black uppercase tracking-tight leading-tight">
                                {kioskLabels.tileProsesKhusus}
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1 leading-snug">
                                {kioskLabels.tileProsesKhususDesc}
                            </p>
                        </div>
                        <div className="flex gap-2 mt-4">
                            <Link
                                href="/kiosk/production/hd"
                                className="flex-1"
                            >
                                <div className="h-11 rounded-lg border-2 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 flex items-center justify-center text-sm font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors active:scale-95">
                                    HD
                                </div>
                            </Link>
                            <Link
                                href="/kiosk/production/potongplong"
                                className="flex-1"
                            >
                                <div className="h-11 rounded-lg border-2 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 flex items-center justify-center text-sm font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors active:scale-95">
                                    Potong/Plong
                                </div>
                            </Link>
                        </div>
                    </div>
                )}

                <HubTile
                    href="/my"
                    title={kioskLabels.tileStatusSaya}
                    description={kioskLabels.tileStatusSayaDesc}
                    iconClass="bg-amber-100 dark:bg-amber-900/30 group-hover:bg-amber-200 dark:group-hover:bg-amber-900/50"
                    icon={
                        <LayoutDashboard className="h-6 w-6 sm:h-7 sm:w-7 text-amber-600" />
                    }
                    className={!hasProsesKhusus ? 'sm:col-span-2' : undefined}
                />
            </div>

            <MyPortalQr />
        </div>
    );
}
