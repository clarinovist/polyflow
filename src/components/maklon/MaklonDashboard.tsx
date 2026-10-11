import type { LucideIcon } from 'lucide-react';
import {
    Boxes,
    CheckCircle2,
    Clock3,
    PackageCheck,
    PackageSearch,
    Plus,
    RotateCcw,
    TimerOff,
    Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import type {
    MaklonDashboardData,
    MaklonDashboardQuickActionHref,
} from '@/actions/maklon/maklon-dashboard';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
} from '@/components/dashboard/DashboardMetricPrimitives';
import { Card, CardContent } from '@/components/ui/card';

type MetricSection<T> =
    | { state: 'AVAILABLE'; data: T }
    | { state: 'UNAVAILABLE'; data: null };

interface MaklonDashboardProps {
    data: MaklonDashboardData | null;
}

const QUICK_ACTIONS: Record<
    MaklonDashboardQuickActionHref,
    { label: string; icon: LucideIcon }
> = {
    '/maklon/receipts': {
        label: 'Penerimaan bahan',
        icon: PackageSearch,
    },
    '/maklon/returns': { label: 'Retur bahan', icon: RotateCcw },
    '/maklon/returns/create': { label: 'Buat retur', icon: Plus },
    '/warehouse/incoming/create-maklon': {
        label: 'Buat penerimaan',
        icon: Plus,
    },
    '/warehouse': { label: 'Portal gudang', icon: Warehouse },
};

function formatCount(
    section: MetricSection<{ count: number }>,
): string | undefined {
    return section.state === 'AVAILABLE'
        ? section.data.count.toLocaleString('id-ID')
        : undefined;
}

function formatQuantity(value: number): string {
    return value.toLocaleString('id-ID', {
        maximumFractionDigits: 4,
    });
}

function OutputGroups({
    section,
}: {
    section: MaklonDashboardData['health']['outputTodayByUnit'];
}) {
    if (section.state === 'UNAVAILABLE') {
        return <DashboardSectionState state="UNAVAILABLE" />;
    }

    if (section.data.groups.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                Belum ada output tercatat pada hari bisnis ini.
            </p>
        );
    }

    return (
        <ul className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            {section.data.groups.map((group) => (
                <li
                    key={group.unit}
                    className="min-w-0 rounded-md border bg-muted/20 p-3"
                >
                    <p className="break-words text-xl font-bold tabular-nums">
                        {formatQuantity(group.quantity)}
                    </p>
                    <p className="break-all text-xs font-semibold text-muted-foreground">
                        {group.unit}
                    </p>
                </li>
            ))}
        </ul>
    );
}

export function MaklonDashboard({ data }: MaklonDashboardProps) {
    if (!data) {
        return (
            <div className="min-w-0 space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Operasional Maklon
                    </h1>
                    <p className="text-muted-foreground">
                        Kondisi produksi Maklon tanpa identitas atau nilai
                        keuangan.
                    </p>
                </div>
                <section
                    className="space-y-3"
                    aria-labelledby="maklon-health-heading"
                >
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Kondisi
                    </p>
                    <h2
                        id="maklon-health-heading"
                        className="text-lg font-semibold"
                    >
                        Kondisi utama
                    </h2>
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Dashboard Maklon tidak tersedia"
                        description="Data gagal dimuat. Angka kosong tidak dianggap nol."
                    />
                </section>
            </div>
        );
    }

    const { health, attention, workDate } = data;

    return (
        <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-3xl font-bold tracking-tight">
                        Operasional Maklon
                    </h1>
                    <p className="text-muted-foreground">
                        Kondisi produksi Maklon tanpa identitas atau nilai
                        keuangan.
                    </p>
                </div>
                <DashboardFreshness generatedAt={data.generatedAt} />
            </div>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="maklon-health-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Kondisi
                    </p>
                    <h2
                        id="maklon-health-heading"
                        className="text-lg font-semibold"
                    >
                        Kondisi utama
                    </h2>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <DashboardHealthCard
                        title="SPK sedang berjalan"
                        value={formatCount(health.inProgress)}
                        state={health.inProgress.state}
                        icon={Clock3}
                        definition={{
                            unit: 'SPK',
                            period: 'Saat dashboard diperbarui',
                            description: 'SPK Maklon yang sedang berjalan.',
                            source: 'Data SPK produksi',
                        }}
                    />
                    <DashboardHealthCard
                        title="Selesai hari ini"
                        value={formatCount(health.completedToday)}
                        state={health.completedToday.state}
                        icon={CheckCircle2}
                        definition={{
                            unit: 'SPK',
                            period: `Hari bisnis WIB ${workDate}`,
                            description:
                                'SPK Maklon yang selesai pada hari bisnis ini berdasarkan waktu selesai aktual.',
                            source: 'Data SPK produksi',
                        }}
                    />
                    <DashboardHealthCard
                        title="Output hari ini per unit"
                        state={health.outputTodayByUnit.state}
                        icon={PackageCheck}
                        definition={{
                            unit: 'Kuantitas per satuan utama',
                            period: `Hari bisnis WIB ${workDate}`,
                            description:
                                'Jumlah hasil produksi yang tidak dibatalkan berdasarkan waktu mulai; satuan berbeda tidak digabung.',
                            source: 'Catatan hasil produksi',
                        }}
                        supportingText={
                            health.outputTodayByUnit.state === 'AVAILABLE' ? (
                                <OutputGroups
                                    section={health.outputTodayByUnit}
                                />
                            ) : undefined
                        }
                    />
                </div>
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="maklon-attention-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Perlu perhatian
                    </p>
                    <h2
                        id="maklon-attention-heading"
                        className="text-lg font-semibold"
                    >
                        Butuh perhatian
                    </h2>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
                    <DashboardHealthCard
                        title="Menunggu material"
                        value={formatCount(attention.waitingMaterial)}
                        state={attention.waitingMaterial.state}
                        icon={Boxes}
                        definition={{
                            unit: 'SPK',
                            period: 'Saat dashboard diperbarui',
                            description: 'SPK Maklon yang sedang menunggu material.',
                            source: 'Data SPK produksi',
                        }}
                    />
                    <DashboardHealthCard
                        title="Lewat rencana selesai"
                        value={formatCount(attention.pastPlannedEnd)}
                        state={attention.pastPlannedEnd.state}
                        icon={TimerOff}
                        definition={{
                            unit: 'SPK',
                            period: 'Saat dashboard diperbarui',
                            description:
                                'SPK Maklon yang sudah dirilis atau sedang berjalan dengan rencana selesai yang telah terlewati.',
                            source: 'Data SPK produksi',
                        }}
                    />
                </div>
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="maklon-drivers-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Arah utama
                    </p>
                    <h2
                        id="maklon-drivers-heading"
                        className="text-lg font-semibold"
                    >
                        Pendorong kondisi
                    </h2>
                </div>
                <DashboardSectionState
                    state="NOT_CONFIGURED"
                    title="Pendorong material belum disiapkan"
                    description="Pendorong material menunggu dasar kepemilikan yang dapat dicocokkan dan rumus yang disetujui; hitungan kejadian tidak langsung dianggap sebagai penyebab."
                />
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="maklon-withheld-heading"
            >
                <h2
                    id="maklon-withheld-heading"
                    className="text-lg font-semibold"
                >
                    Metrik yang ditahan
                </h2>
                <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
                    <DashboardSectionState
                        state="NOT_CONFIGURED"
                        title="Rekonsiliasi dan antrean material belum disiapkan"
                        description="Penerimaan, pemakaian, sisa, retur, dan antrean material menunggu dasar kepemilikan yang dapat dicocokkan serta rumus yang disetujui."
                    />
                    <DashboardSectionState
                        state="NOT_CONFIGURED"
                        title="Metrik keuangan belum disiapkan"
                        description="Pendapatan jasa, biaya konversi, dan margin ditahan sampai kelompok data dan sumber keuangan dicocokkan serta disetujui."
                    />
                </div>
            </section>

            <Card>
                <CardContent className="p-4">
                    <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground">
                        Aksi cepat
                    </h2>
                    <nav
                        aria-label="Aksi cepat Maklon"
                        className="flex flex-wrap gap-2"
                    >
                        {data.quickActionHrefs.map((href) => {
                            const item = QUICK_ACTIONS[href];
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    <Icon
                                        aria-hidden="true"
                                        className="h-4 w-4 shrink-0"
                                    />
                                    <span className="break-words">
                                        {item.label}
                                    </span>
                                </Link>
                            );
                        })}
                    </nav>
                </CardContent>
            </Card>
        </div>
    );
}
