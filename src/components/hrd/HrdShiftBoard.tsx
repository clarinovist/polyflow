'use client';

import type { LucideIcon } from 'lucide-react';
import {
    AlertCircle,
    AlertTriangle,
    CalendarDays,
    CalendarRange,
    Clock,
    HandCoins,
    UserCheck,
    Users,
    UserX,
    Wallet,
} from 'lucide-react';
import Link from 'next/link';
import type { HrdShiftBoard } from '@/actions/hrd/dashboard-kpis';
import {
    CommandQueueChip,
    CommandQueueFooter,
    CommandQueueRow,
    type CommandQueueItem,
} from '@/components/dashboard/CommandCenterPrimitives';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
} from '@/components/dashboard/DashboardMetricPrimitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface HrdShiftBoardProps {
    data: HrdShiftBoard | null;
}

type SectionState = 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_CONFIGURED';

type AggregateRow = CommandQueueItem & {
    state: SectionState;
};

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

function stateRow({
    id,
    category,
    title,
    subtitle,
    value,
    href,
    action,
    icon,
    state,
    tone = 'neutral',
}: {
    id: string;
    category: string;
    title: string;
    subtitle: string;
    value?: string;
    href: string;
    action: string;
    icon: LucideIcon;
    state: SectionState;
    tone?: CommandQueueItem['tone'];
}): AggregateRow {
    if (state !== 'AVAILABLE') {
        return {
            id,
            category,
            title,
            subtitle:
                state === 'UNAVAILABLE'
                    ? 'Data tidak tersedia; kegagalan baca tidak dianggap nol.'
                    : 'Data belum dikonfigurasi.',
            value: '—',
            action:
                state === 'UNAVAILABLE' ? 'Tidak tersedia' : 'Belum disiapkan',
            tone: 'neutral',
            icon,
            state,
        };
    }
    return {
        id,
        category,
        title,
        subtitle,
        value,
        href,
        action,
        tone,
        icon,
        state,
    };
}

function buildQueue(data: HrdShiftBoard): AggregateRow[] {
    const payrollReadiness = data.health.payrollReadiness;
    const payrollAttention = data.attention.payroll;
    const rows: AggregateRow[] = [];

    rows.push(
        stateRow({
            id: 'payroll-readiness',
            category: 'Payroll',
            title: 'Review slip payroll terbaru',
            subtitle:
                payrollReadiness.status === 'AVAILABLE'
                    ? payrollReadiness.data.draft +
                      ' draf · ' +
                      payrollReadiness.data.finalized +
                      ' selesai · ' +
                      payrollReadiness.data.paid +
                      ' dibayar'
                    : '',
            value:
                payrollReadiness.status === 'AVAILABLE'
                    ? payrollReadiness.data.total + ' slip dibuat'
                    : undefined,
            href: '/hrd/payroll-monthly',
            action: 'Buka payroll',
            icon: Wallet,
            state: payrollReadiness.status,
            tone:
                payrollReadiness.status === 'AVAILABLE' &&
                payrollReadiness.data.draft > 0
                    ? 'critical'
                    : 'neutral',
        }),
    );

    rows.push(
        stateRow({
            id: 'payroll-periods',
            category: 'Periode payroll',
            title: 'Periode payroll terbuka',
            subtitle:
                payrollAttention.status === 'AVAILABLE'
                    ? payrollAttention.data.periodsNeedGenerate +
                      ' periode belum memiliki slip sama sekali'
                    : '',
            value:
                payrollAttention.status === 'AVAILABLE'
                    ? payrollAttention.data.openPeriods + ' periode terbuka'
                    : undefined,
            href: '/hrd/payroll-monthly',
            action: 'Tinjau periode',
            icon: CalendarRange,
            state: payrollAttention.status,
            tone:
                payrollAttention.status === 'AVAILABLE' &&
                payrollAttention.data.periodsNeedGenerate > 0
                    ? 'critical'
                    : 'neutral',
        }),
    );

    const leave = data.attention.pendingLeave;
    rows.push(
        stateRow({
            id: 'leave',
            category: 'Cuti/izin',
            title: 'Pengajuan menunggu keputusan',
            subtitle:
                'Agregat pengajuan; dashboard tidak menampilkan identitas personal.',
            value:
                leave.status === 'AVAILABLE'
                    ? leave.data.count.toLocaleString('id-ID') + ' pengajuan'
                    : undefined,
            href: '/hrd/leave?status=PENDING',
            action: 'Review pengajuan',
            icon: CalendarDays,
            state: leave.status,
            tone:
                leave.status === 'AVAILABLE' && leave.data.count > 0
                    ? 'critical'
                    : 'neutral',
        }),
    );

    const employment = data.health.employmentFollowUp;
    rows.push(
        stateRow({
            id: 'employment',
            category: 'Kontrak',
            title: 'Kontrak atau masa percobaan perlu tindak lanjut',
            subtitle:
                employment.status === 'AVAILABLE'
                    ? employment.data.probation +
                      ' probation · ' +
                      employment.data.contract +
                      ' kontrak'
                    : '',
            value:
                employment.status === 'AVAILABLE'
                    ? employment.data.total.toLocaleString('id-ID') +
                      ' karyawan aktif'
                    : undefined,
            href: '/hrd/alerts',
            action: 'Buka alert',
            icon: AlertTriangle,
            state: employment.status,
            tone:
                employment.status === 'AVAILABLE' && employment.data.total > 0
                    ? 'warning'
                    : 'neutral',
        }),
    );

    const absence = data.attention.recordedAbsenceYesterday;
    rows.push(
        stateRow({
            id: 'absence',
            category: 'Absensi',
            title: 'Tidak hadir tercatat kemarin',
            subtitle:
                'Karyawan unik dengan status tersimpan pada hari kerja WIB ' +
                data.yesterdayWorkDate +
                '; bukan daftar no-show.',
            value:
                absence.status === 'AVAILABLE'
                    ? absence.data.count.toLocaleString('id-ID') + ' karyawan'
                    : undefined,
            href: '/hrd/attendance',
            action: 'Buka rekap',
            icon: UserX,
            state: absence.status,
            tone:
                absence.status === 'AVAILABLE' && absence.data.count > 0
                    ? 'warning'
                    : 'neutral',
        }),
    );

    const alerts = data.attention.hrAlerts;
    rows.push(
        stateRow({
            id: 'alerts',
            category: 'Peringatan',
            title: 'Peringatan HR belum dibaca',
            subtitle:
                'Hitungan notifikasi penerima; bukan hitungan risiko karyawan.',
            value:
                alerts.status === 'AVAILABLE'
                    ? alerts.data.unreadRecipientNotifications.toLocaleString(
                          'id-ID',
                      ) + ' notifikasi'
                    : undefined,
            href: '/hrd/alerts?unread=true',
            action: 'Buka alert',
            icon: AlertCircle,
            state: alerts.status,
            tone:
                alerts.status === 'AVAILABLE' &&
                alerts.data.unreadRecipientNotifications > 0
                    ? 'warning'
                    : 'neutral',
        }),
    );

    return rows;
}

export function HrdShiftBoardComponent({ data }: HrdShiftBoardProps) {
    if (!data) {
        return (
            <div className="min-w-0 space-y-6">
                <h1 className="text-3xl font-bold tracking-tight">HRD</h1>
                <DashboardSectionState
                    state="UNAVAILABLE"
                    title="Dashboard HRD tidak tersedia"
                    description="Data gagal dimuat. Angka kosong tidak dianggap nol."
                />
            </div>
        );
    }

    const { generatedAt, workDate, health, attention } = data;
    const queue = buildQueue(data);
    const visibleQueue = queue.filter(
        (item) => item.state !== 'AVAILABLE' || item.tone !== 'neutral',
    );
    const actionableCount = visibleQueue.filter(
        (item) => item.state === 'AVAILABLE',
    ).length;

    return (
        <div className="mx-auto flex max-w-[1600px] min-w-0 flex-col space-y-6 md:space-y-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Command center
                    </p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight">
                        HRD
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                        Kesehatan tenaga kerja dan tindak lanjut agregat tanpa
                        mengekspos data personal.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                            Hari kerja WIB {workDate}
                        </span>
                        <DashboardFreshness generatedAt={generatedAt} />
                    </div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Button
                        asChild
                        size="lg"
                        className="min-h-11 gap-2 shadow-sm"
                    >
                        <Link href="/hrd/attendance">
                            <Clock className="h-4 w-4" /> Rekap absensi
                        </Link>
                    </Button>
                    <Button
                        asChild
                        size="lg"
                        variant="outline"
                        className="min-h-11 gap-2"
                    >
                        <Link href="/hrd/payroll-monthly">
                            <Wallet className="h-4 w-4" /> Payroll bulanan
                        </Link>
                    </Button>
                    <Button
                        asChild
                        size="lg"
                        variant="ghost"
                        className="min-h-11 gap-2"
                    >
                        <Link href="/hrd/payroll">
                            <HandCoins className="h-4 w-4" /> Gaji mingguan
                        </Link>
                    </Button>
                </div>
            </div>

            <section
                aria-labelledby="hrd-health-heading"
                className="min-w-0 space-y-3"
            >
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Kondisi
                    </p>
                    <h2
                        id="hrd-health-heading"
                        className="text-lg font-semibold"
                    >
                        Ringkasan kesehatan
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
                            period: 'Saat dashboard diperbarui',
                            description:
                                'Karyawan yang berstatus aktif pada data kepegawaian.',
                            source: 'Data karyawan HRD',
                        }}
                        href="/hrd/employees"
                    />
                    <DashboardHealthCard
                        title="Status absensi tercatat hari ini"
                        value={
                            health.attendanceToday.status === 'AVAILABLE'
                                ? health.attendanceToday.data.present + ' hadir'
                                : undefined
                        }
                        state={health.attendanceToday.status}
                        icon={UserCheck}
                        definition={{
                            unit: 'Karyawan unik',
                            period: 'Hari kerja WIB ' + workDate,
                            description:
                                'Jumlah karyawan unik yang memiliki status absensi tersimpan; bukan tingkat kehadiran.',
                            source: 'Data absensi',
                        }}
                        href="/hrd/attendance"
                        supportingText={
                            health.attendanceToday.status === 'AVAILABLE'
                                ? health.attendanceToday.data.absent +
                                  ' tidak hadir · ' +
                                  health.attendanceToday.data.onLeave +
                                  ' cuti/izin · ' +
                                  formatHours(
                                      health.attendanceToday.data.overtimeHours,
                                  ) +
                                  ' jam lembur pada catatan hadir'
                                : undefined
                        }
                    />
                    <DashboardHealthCard
                        title="Review slip payroll terbaru"
                        value={
                            health.payrollReadiness.status === 'AVAILABLE'
                                ? health.payrollReadiness.data.total +
                                  ' slip dibuat'
                                : undefined
                        }
                        state={health.payrollReadiness.status}
                        icon={Wallet}
                        definition={{
                            unit: 'Slip tergenerasi',
                            period:
                                health.payrollReadiness.status === 'AVAILABLE'
                                    ? health.payrollReadiness.data.month +
                                      '/' +
                                      health.payrollReadiness.data.year +
                                      ' · periode terbuka terbaru'
                                    : 'Periode terbuka terbaru',
                            description:
                                'Status peninjauan slip yang sudah dibuat; bukan ukuran kelengkapan seluruh karyawan.',
                            source: 'Payroll bulanan',
                        }}
                        href="/hrd/payroll-monthly"
                        supportingText={
                            health.payrollReadiness.status === 'AVAILABLE'
                                ? health.payrollReadiness.data.draft +
                                  ' draf · ' +
                                  health.payrollReadiness.data.finalized +
                                  ' diselesaikan · ' +
                                  health.payrollReadiness.data.paid +
                                  ' dibayar'
                                : undefined
                        }
                    />
                    <DashboardHealthCard
                        title="Tindak lanjut kontrak atau masa percobaan"
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
                            period: 'Sudah jatuh tempo atau 30 hari ke depan',
                            description:
                                'Masa percobaan memakai tanggal akhir percobaan; kontrak memakai tanggal akhir kontrak.',
                            source: 'Data karyawan HRD',
                        }}
                        href="/hrd/alerts"
                        supportingText={
                            health.employmentFollowUp.status === 'AVAILABLE'
                                ? health.employmentFollowUp.data.probation +
                                  ' masa percobaan · ' +
                                  health.employmentFollowUp.data.contract +
                                  ' kontrak'
                                : undefined
                        }
                    />
                </div>
            </section>

            <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.85fr)]">
                <section
                    aria-labelledby="hrd-attention-heading"
                    className="min-w-0"
                >
                    <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-sm">
                        <div className="border-b p-4 sm:p-5">
                            <div className="flex items-start gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                                    <AlertCircle className="h-4 w-4" />
                                </span>
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                        Prioritas operasional
                                    </p>
                                    <h2
                                        id="hrd-attention-heading"
                                        className="mt-0.5 text-xl font-semibold tracking-tight"
                                    >
                                        Butuh tindakan
                                    </h2>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Urutan tetap berdasarkan workflow HRD;
                                        seluruh fakta tetap agregat tanpa nama,
                                        kode, atau ID personal.
                                    </p>
                                </div>
                            </div>
                            <div
                                className="scrollbar-none -mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1"
                                aria-label="Ringkasan antrean HRD"
                            >
                                <CommandQueueChip
                                    label="Perlu tindakan"
                                    value={actionableCount}
                                />
                                <CommandQueueChip
                                    label="Cuti/izin"
                                    value={
                                        attention.pendingLeave.status ===
                                        'AVAILABLE'
                                            ? attention.pendingLeave.data.count
                                            : '—'
                                    }
                                    href="/hrd/leave?status=PENDING"
                                />
                                <CommandQueueChip
                                    label="Kasbon aktif"
                                    value={
                                        attention.loanPortfolio.status ===
                                        'AVAILABLE'
                                            ? attention.loanPortfolio.data
                                                  .activeCount
                                            : '—'
                                    }
                                    href="/hrd/loans"
                                />
                                <CommandQueueChip
                                    label="BPJS aktif"
                                    value={
                                        attention.bpjs.status === 'AVAILABLE'
                                            ? attention.bpjs.data
                                                  .activeParticipants
                                            : '—'
                                    }
                                    href="/hrd/bpjs"
                                />
                            </div>
                        </div>
                        {visibleQueue.length > 0 ? (
                            <ul aria-label="Daftar prioritas HRD">
                                {visibleQueue.map((item) => (
                                    <CommandQueueRow
                                        key={item.id}
                                        item={item}
                                    />
                                ))}
                            </ul>
                        ) : (
                            <div className="p-8 text-center text-sm text-muted-foreground">
                                Tidak ada tindak lanjut HRD pada agregat yang
                                tersedia.
                            </div>
                        )}
                        <CommandQueueFooter
                            returned={visibleQueue.length}
                            itemLabel="status"
                            label="Buka semua peringatan"
                            href="/hrd/alerts"
                        />
                    </Card>
                </section>

                <aside
                    aria-labelledby="hrd-drivers-heading"
                    className="min-w-0 space-y-5"
                >
                    <DashboardSectionState
                        state="NOT_CONFIGURED"
                        title="Pendorong per unit atau sif belum disiapkan"
                        description="Struktur organisasi dan jadwal belum disetujui; dashboard tidak menyimpulkan penyebab atau tren hanya dari hitungan."
                    />
                    <Card className="gap-0 py-0 shadow-sm">
                        <CardContent className="p-5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Fakta pendukung
                            </p>
                            <h2
                                id="hrd-drivers-heading"
                                className="mt-1 text-lg font-semibold"
                            >
                                Portofolio HRD
                            </h2>
                            <div className="mt-5 space-y-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground">
                                        Kasbon aktif
                                    </p>
                                    <p className="font-semibold tabular-nums">
                                        {attention.loanPortfolio.status ===
                                        'AVAILABLE'
                                            ? attention.loanPortfolio.data
                                                  .activeCount +
                                              ' akun · ' +
                                              formatIdr(
                                                  attention.loanPortfolio.data
                                                      .outstandingAmount,
                                              )
                                            : 'Data tidak tersedia'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">
                                        Peserta BPJS aktif
                                    </p>
                                    <p className="font-semibold tabular-nums">
                                        {attention.bpjs.status === 'AVAILABLE'
                                            ? attention.bpjs.data.activeParticipants.toLocaleString(
                                                  'id-ID',
                                              ) + ' peserta'
                                            : 'Data tidak tersedia'}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </div>
    );
}
