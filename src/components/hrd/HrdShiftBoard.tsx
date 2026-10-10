'use client';

import type { LucideIcon } from 'lucide-react';
import {
    AlertTriangle,
    CalendarDays,
    CalendarRange,
    Clock,
    HandCoins,
    Shield,
    UserCheck,
    Users,
    UserX,
    Wallet,
} from 'lucide-react';
import Link from 'next/link';
import type { HrdShiftBoard } from '@/actions/hrd/dashboard-kpis';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
} from '@/components/dashboard/DashboardMetricPrimitives';
import { Card, CardContent } from '@/components/ui/card';

interface HrdShiftBoardProps {
    data: HrdShiftBoard | null;
}

function formatIdr(value: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(value);
}

function formatHours(value: number): string {
    return value.toLocaleString('id-ID', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}

function AttentionCard({
    title,
    description,
    icon: Icon,
    value,
    href,
    state,
}: {
    title: string;
    description: string;
    icon: LucideIcon;
    value?: string;
    href: string;
    state: 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
}) {
    const content = (
        <Card className="h-full min-w-0 transition-shadow hover:shadow-sm">
            <CardContent className="flex h-full min-h-32 min-w-0 flex-col gap-2 p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold">{title}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {description}
                        </p>
                    </div>
                    <Icon className="h-4 w-4 shrink-0 text-amber-600" />
                </div>
                {state !== 'AVAILABLE' ? (
                    <DashboardSectionState
                        state={state}
                        title={
                            state === 'UNAVAILABLE'
                                ? 'Data tidak tersedia'
                                : 'Belum dikonfigurasi'
                        }
                        description={
                            state === 'UNAVAILABLE'
                                ? 'Kegagalan baca tidak dianggap nol atau antrean kosong.'
                                : 'Data menunggu konfigurasi yang sah.'
                        }
                    />
                ) : (
                    <p className="mt-auto break-words text-xl font-bold tabular-nums">
                        {value}
                    </p>
                )}
            </CardContent>
        </Card>
    );

    return state === 'AVAILABLE' ? (
        <Link
            href={href}
            className="block min-h-11 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
            {content}
        </Link>
    ) : (
        content
    );
}

export function HrdShiftBoardComponent({ data }: HrdShiftBoardProps) {
    if (!data) {
        return (
            <div className="min-w-0 space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">HRD</h1>
                    <p className="text-muted-foreground">
                        Kesehatan tenaga kerja dan tindak lanjut operasional.
                    </p>
                </div>
                <section
                    className="space-y-3"
                    aria-labelledby="hrd-health-heading"
                >
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Health
                    </p>
                    <h2
                        id="hrd-health-heading"
                        className="text-lg font-semibold"
                    >
                        Kondisi utama
                    </h2>
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Dashboard HRD tidak tersedia"
                        description="Data gagal dimuat. Angka kosong tidak dianggap nol."
                    />
                </section>
            </div>
        );
    }

    const { generatedAt, workDate, yesterdayWorkDate, health, attention } =
        data;

    return (
        <div className="min-w-0 space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-3xl font-bold tracking-tight">HRD</h1>
                    <p className="text-muted-foreground">
                        Kesehatan tenaga kerja dan tindak lanjut operasional.
                    </p>
                </div>
                <DashboardFreshness generatedAt={generatedAt} />
            </div>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="hrd-health-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Health
                    </p>
                    <h2
                        id="hrd-health-heading"
                        className="text-lg font-semibold"
                    >
                        Kondisi utama
                    </h2>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
                    <DashboardHealthCard
                        title="Karyawan aktif"
                        value={
                            health.activeHeadcount.status === 'AVAILABLE'
                                ? health.activeHeadcount.data.count.toLocaleString(
                                      'id-ID',
                                  )
                                : undefined
                        }
                        state={health.activeHeadcount.status}
                        icon={Users}
                        definition={{
                            unit: 'Karyawan',
                            period: 'Snapshot saat diperbarui',
                            description:
                                'Karyawan dengan status master ACTIVE.',
                            source: 'HRD employee master',
                        }}
                        href="/hrd/employees"
                    />
                    <DashboardHealthCard
                        title="Status absensi tercatat hari ini"
                        value={
                            health.attendanceToday.status === 'AVAILABLE'
                                ? `${health.attendanceToday.data.present} hadir`
                                : undefined
                        }
                        state={health.attendanceToday.status}
                        icon={UserCheck}
                        definition={{
                            unit: 'Karyawan unik',
                            period: `WorkDate WIB ${workDate}`,
                            description:
                                'Status tersimpan; bukan attendance rate dan tidak membuat NO_RECORD.',
                            source: 'Attendance',
                        }}
                        href="/hrd/attendance"
                        supportingText={
                            health.attendanceToday.status === 'AVAILABLE'
                                ? `${health.attendanceToday.data.absent} absent · ${health.attendanceToday.data.onLeave} cuti/izin · ${formatHours(health.attendanceToday.data.overtimeHours)} jam lembur pada record PRESENT`
                                : undefined
                        }
                    />
                    <DashboardHealthCard
                        title="Review slip payroll terbaru"
                        value={
                            health.payrollReadiness.status === 'AVAILABLE'
                                ? `${health.payrollReadiness.data.total} slip dibuat`
                                : undefined
                        }
                        state={health.payrollReadiness.status}
                        icon={Wallet}
                        definition={{
                            unit: 'Slip tergenerasi',
                            period:
                                health.payrollReadiness.status === 'AVAILABLE'
                                    ? `${health.payrollReadiness.data.month}/${health.payrollReadiness.data.year} · periode OPEN terbaru`
                                    : 'Periode OPEN terbaru',
                            description:
                                'Status review slip yang sudah dibuat; bukan kelengkapan seluruh karyawan.',
                            source: 'Monthly payroll',
                        }}
                        href="/hrd/payroll-monthly"
                        supportingText={
                            health.payrollReadiness.status === 'AVAILABLE'
                                ? `${health.payrollReadiness.data.draft} draft · ${health.payrollReadiness.data.finalized} finalized · ${health.payrollReadiness.data.paid} paid`
                                : undefined
                        }
                    />
                    <DashboardHealthCard
                        title="Tindak lanjut kontrak/probation"
                        value={
                            health.employmentFollowUp.status === 'AVAILABLE'
                                ? health.employmentFollowUp.data.total.toLocaleString(
                                      'id-ID',
                                  )
                                : undefined
                        }
                        state={health.employmentFollowUp.status}
                        icon={AlertTriangle}
                        definition={{
                            unit: 'Karyawan aktif',
                            period: 'Jatuh tempo atau overdue s.d. 30 hari ke depan',
                            description:
                                'PROBATION memakai probationEndDate; CONTRACT memakai contractEndDate.',
                            source: 'HRD employee master',
                        }}
                        href="/hrd/alerts"
                        supportingText={
                            health.employmentFollowUp.status === 'AVAILABLE'
                                ? `${health.employmentFollowUp.data.probation} probation · ${health.employmentFollowUp.data.contract} kontrak`
                                : undefined
                        }
                    />
                </div>
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="hrd-attention-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Attention
                    </p>
                    <h2
                        id="hrd-attention-heading"
                        className="text-lg font-semibold"
                    >
                        Butuh perhatian
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Seluruh kartu hanya memuat agregat tanpa nama, kode,
                        atau baris personal.
                    </p>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    <AttentionCard
                        title="Cuti/izin menunggu"
                        description="Pengajuan berstatus PENDING."
                        icon={CalendarDays}
                        href="/hrd/leave?status=PENDING"
                        state={attention.pendingLeave.status}
                        value={
                            attention.pendingLeave.status === 'AVAILABLE'
                                ? `${attention.pendingLeave.data.count.toLocaleString('id-ID')} pengajuan`
                                : undefined
                        }
                    />
                    <AttentionCard
                        title="Kasbon aktif"
                        description="Jumlah akun kasbon aktif dan total sisa portofolio."
                        icon={HandCoins}
                        href="/hrd/loans"
                        state={attention.loanPortfolio.status}
                        value={
                            attention.loanPortfolio.status === 'AVAILABLE'
                                ? `${attention.loanPortfolio.data.activeCount.toLocaleString('id-ID')} aktif · ${formatIdr(attention.loanPortfolio.data.outstandingAmount)}`
                                : undefined
                        }
                    />
                    <AttentionCard
                        title="Periode payroll terbuka"
                        description="Periode OPEN; zero-slip tetap valid dan perlu ditindaklanjuti."
                        icon={CalendarRange}
                        href="/hrd/payroll-monthly"
                        state={attention.payroll.status}
                        value={
                            attention.payroll.status === 'AVAILABLE'
                                ? `${attention.payroll.data.openPeriods} terbuka · ${attention.payroll.data.periodsNeedGenerate} belum memiliki slip`
                                : undefined
                        }
                    />
                    <AttentionCard
                        title="Peserta BPJS aktif"
                        description="Karyawan ACTIVE dengan flag peserta BPJS."
                        icon={Shield}
                        href="/hrd/bpjs"
                        state={attention.bpjs.status}
                        value={
                            attention.bpjs.status === 'AVAILABLE'
                                ? `${attention.bpjs.data.activeParticipants.toLocaleString('id-ID')} peserta`
                                : undefined
                        }
                    />
                    <AttentionCard
                        title="Peringatan HR belum dibaca"
                        description="Hitungan notifikasi penerima; bukan hitungan risiko karyawan."
                        icon={AlertTriangle}
                        href="/hrd/alerts?unread=true"
                        state={attention.hrAlerts.status}
                        value={
                            attention.hrAlerts.status === 'AVAILABLE'
                                ? `${attention.hrAlerts.data.unreadRecipientNotifications.toLocaleString('id-ID')} notifikasi`
                                : undefined
                        }
                    />
                    <AttentionCard
                        title="ABSENT tercatat kemarin"
                        description={`Karyawan unik dengan status tersimpan ABSENT pada workDate WIB ${yesterdayWorkDate}.`}
                        icon={UserX}
                        href="/hrd/attendance"
                        state={attention.recordedAbsenceYesterday.status}
                        value={
                            attention.recordedAbsenceYesterday.status ===
                            'AVAILABLE'
                                ? `${attention.recordedAbsenceYesterday.data.count.toLocaleString('id-ID')} karyawan`
                                : undefined
                        }
                    />
                </div>
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="hrd-drivers-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Drivers
                    </p>
                    <h2
                        id="hrd-drivers-heading"
                        className="text-lg font-semibold"
                    >
                        Pendorong kondisi
                    </h2>
                </div>
                <DashboardSectionState
                    state="NOT_CONFIGURED"
                    title="Driver unit/sif belum dikonfigurasi"
                    description="Peringkat penyebab menunggu kontrak organisasi dan penjadwalan yang disetujui pemilik domain; dashboard tidak membuat ranking kausal dari hitungan mentah."
                />
            </section>

            <Card>
                <CardContent className="p-4">
                    <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground">
                        Aksi cepat
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href="/hrd/attendance"
                            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80"
                        >
                            <Clock className="h-4 w-4" />
                            Rekap Absensi
                        </Link>
                        <Link
                            href="/hrd/payroll"
                            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80"
                        >
                            <Wallet className="h-4 w-4" />
                            Gaji Mingguan
                        </Link>
                        <Link
                            href="/hrd/payroll-monthly"
                            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80"
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
